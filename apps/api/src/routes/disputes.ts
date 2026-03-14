/**
 * disputes.ts — Worker dispute resolution flow
 *
 * Routes:
 *   POST   /api/jobs/:jobId/disputes         — Worker or employer raises a dispute
 *   GET    /api/jobs/:jobId/disputes         — List disputes (admin or job parties)
 *   PATCH  /api/jobs/:jobId/disputes/:id    — Admin resolves a dispute
 *
 * NOSHOW_DISPUTE sets dispute_hold=true on job_postings, blocking payout until resolved.
 */

import { FastifyInstance } from "fastify"
import { eq, and, or } from "drizzle-orm"
import { z } from "zod"
import { db, jobDisputes, jobPostings, jobApplications, users } from "../db"
import { authenticate } from "../middleware/auth"
import { sendAlimTalk, normalizePhone } from "../services/kakaoAlimTalk.js"

const createDisputeSchema = z.object({
  type: z.enum(["NOSHOW_DISPUTE", "PAYMENT_DISPUTE", "QUALITY_DISPUTE"]),
  description: z.string().min(10).max(2000),
})

const resolveDisputeSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  resolutionNotes: z.string().min(1).max(2000),
})

export async function disputeRoutes(app: FastifyInstance) {
  /**
   * POST /api/jobs/:jobId/disputes
   * Workers and employers can raise disputes about a completed or NOSHOW job.
   * Duplicate disputes (same job + raiser + type) are prevented by unique constraint.
   * NOSHOW_DISPUTE sets dispute_hold=true on the job to block payouts.
   */
  app.post<{ Params: { jobId: string } }>(
    "/api/jobs/:jobId/disputes",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { jobId } = request.params
      const userId = request.user.id
      const userRole = request.user.role

      if (!userRole || (userRole !== "worker" && userRole !== "employer")) {
        return reply.status(403).send({ error: "Only workers and employers can raise disputes" })
      }

      const body = createDisputeSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
      }

      // Verify the job exists
      const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).limit(1)
      if (!job) {
        return reply.status(404).send({ error: "Job not found" })
      }

      // Verify the requester is a party to this job
      if (userRole === "employer") {
        if (job.employerId !== userId) {
          return reply.status(403).send({ error: "Access denied: not your job" })
        }
      } else {
        // worker must have an application for this job
        const [application] = await db
          .select()
          .from(jobApplications)
          .where(and(eq(jobApplications.jobId, jobId), eq(jobApplications.workerId, userId)))
          .limit(1)
        if (!application) {
          return reply.status(403).send({ error: "Access denied: not your job" })
        }
      }

      // Create dispute (unique constraint prevents duplicates)
      try {
        const [dispute] = await db
          .insert(jobDisputes)
          .values({
            jobId,
            raisedById: userId,
            raisedByRole: userRole,
            type: body.data.type,
            description: body.data.description,
          })
          .returning()

        // NOSHOW_DISPUTE: set dispute_hold on job to block Toss payout
        if (body.data.type === "NOSHOW_DISPUTE") {
          await db
            .update(jobPostings)
            .set({ disputeHold: true, updatedAt: new Date() })
            .where(eq(jobPostings.id, jobId))
        }

        // KakaoTalk AlimTalk: notify employer when any dispute is created
        void (async () => {
          try {
            const [employer] = await db
              .select({ phone: users.phone })
              .from(users)
              .where(eq(users.id, job.employerId))
              .limit(1)
            if (employer?.phone) {
              const phone = normalizePhone(employer.phone) ?? employer.phone
              await sendAlimTalk(phone, "DISPUTE_CREATED", {
                job_title: job.title,
              })
            }
          } catch {
            // non-fatal
          }
        })()

        return reply.status(201).send({ dispute })
      } catch (err: unknown) {
        if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
          return reply.status(409).send({ error: "Dispute already raised for this job with the same type" })
        }
        throw err
      }
    },
  )

  /**
   * GET /api/jobs/:jobId/disputes
   * Returns disputes for a job. Restricted to: the job parties + admins (via ADMIN_TOKEN).
   */
  app.get<{ Params: { jobId: string } }>(
    "/api/jobs/:jobId/disputes",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { jobId } = request.params
      const userId = request.user.id
      const userRole = request.user.role
      const adminToken = process.env.ADMIN_TOKEN

      // Check if admin (via x-admin-token header)
      const isAdmin = adminToken && request.headers["x-admin-token"] === adminToken

      if (!isAdmin) {
        // Must be a party to the job
        const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).limit(1)
        if (!job) {
          return reply.status(404).send({ error: "Job not found" })
        }

        if (userRole === "employer" && job.employerId !== userId) {
          return reply.status(403).send({ error: "Access denied" })
        }

        if (userRole === "worker") {
          const [application] = await db
            .select()
            .from(jobApplications)
            .where(and(eq(jobApplications.jobId, jobId), eq(jobApplications.workerId, userId)))
            .limit(1)
          if (!application) {
            return reply.status(403).send({ error: "Access denied" })
          }
        }
      }

      const disputes = await db
        .select()
        .from(jobDisputes)
        .where(eq(jobDisputes.jobId, jobId))

      return reply.send({ disputes })
    },
  )

  /**
   * PATCH /api/jobs/:jobId/disputes/:disputeId
   * Admin-only: resolve or dismiss a dispute.
   * On resolution of NOSHOW_DISPUTE: clears dispute_hold so payout can proceed.
   */
  app.patch<{ Params: { jobId: string; disputeId: string } }>(
    "/api/jobs/:jobId/disputes/:disputeId",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { jobId, disputeId } = request.params
      const adminToken = process.env.ADMIN_TOKEN

      // Admin-only check
      const isAdmin = adminToken && request.headers["x-admin-token"] === adminToken
      if (!isAdmin) {
        return reply.status(403).send({ error: "Admin access required" })
      }

      const body = resolveDisputeSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
      }

      const [dispute] = await db
        .select()
        .from(jobDisputes)
        .where(and(eq(jobDisputes.id, disputeId), eq(jobDisputes.jobId, jobId)))
        .limit(1)

      if (!dispute) {
        return reply.status(404).send({ error: "Dispute not found" })
      }

      if (dispute.status !== "open") {
        return reply.status(409).send({ error: "Dispute is already resolved or dismissed" })
      }

      const [resolved] = await db
        .update(jobDisputes)
        .set({
          status: body.data.status,
          resolutionNotes: body.data.resolutionNotes,
          resolvedBy: request.user.id,
          resolvedAt: new Date(),
        })
        .where(eq(jobDisputes.id, disputeId))
        .returning()

      // If NOSHOW_DISPUTE is resolved/dismissed, clear the payout hold
      if (dispute.type === "NOSHOW_DISPUTE") {
        await db
          .update(jobPostings)
          .set({ disputeHold: false, updatedAt: new Date() })
          .where(eq(jobPostings.id, jobId))
      }

      // KakaoTalk AlimTalk: notify both employer and worker raiser on resolution
      void (async () => {
        try {
          const [job] = await db
            .select({ employerId: jobPostings.employerId, title: jobPostings.title })
            .from(jobPostings)
            .where(eq(jobPostings.id, jobId))
            .limit(1)
          if (!job) return

          const partyIds = [...new Set([job.employerId, dispute.raisedById])]
          const parties = await db
            .select({ id: users.id, phone: users.phone })
            .from(users)
            .where(
              partyIds.length === 1
                ? eq(users.id, partyIds[0]!)
                : or(eq(users.id, partyIds[0]!), eq(users.id, partyIds[1]!))
            )

          await Promise.all(
            parties.map(async (p) => {
              if (!p.phone) return
              const phone = normalizePhone(p.phone) ?? p.phone
              await sendAlimTalk(phone, "DISPUTE_RESOLVED", {
                job_title: job.title,
                resolution: body.data.status,
              }).catch(() => {})
            })
          )
        } catch {
          // non-fatal
        }
      })()

      return reply.send({ dispute: resolved })
    },
  )
}
