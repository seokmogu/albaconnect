/**
 * disputes.ts — Job dispute resolution routes
 *
 * POST   /jobs/:jobId/disputes              — raise a dispute (worker or employer)
 * GET    /jobs/:jobId/disputes              — list disputes (admin or job parties)
 * PATCH  /jobs/:jobId/disputes/:disputeId  — admin resolves/dismisses a dispute
 */

import type { FastifyInstance } from "fastify"
import { and, eq, or } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db/index"
import {
  jobDisputes,
  jobPostings,
  jobApplications,
  type JobDispute,
} from "../db/schema"
import { authenticate, requireAdmin } from "../middleware/auth"

// ── Validation schemas ─────────────────────────────────────────────────────────

const createDisputeSchema = z.object({
  type: z.enum(["NOSHOW_DISPUTE", "PAYMENT_DISPUTE", "QUALITY_DISPUTE"]),
  description: z.string().min(10).max(2000),
})

const resolveDisputeSchema = z.object({
  status: z.enum(["resolved", "dismissed"]),
  resolutionNotes: z.string().min(5).max(2000),
})

// ── Route plugin ───────────────────────────────────────────────────────────────

export async function disputeRoutes(app: FastifyInstance): Promise<void> {
  // POST /jobs/:jobId/disputes — raise a dispute
  app.post<{ Params: { jobId: string } }>(
    "/jobs/:jobId/disputes",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user.id
      const userRole = request.user.role // 'employer' | 'worker'
      const { jobId } = request.params

      const body = createDisputeSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: "Validation failed", details: body.error.issues })
      }
      const { type, description } = body.data

      // Verify caller is a party to this job
      const [job] = await db
        .select({ id: jobPostings.id, employerId: jobPostings.employerId, status: jobPostings.status })
        .from(jobPostings)
        .where(eq(jobPostings.id, jobId))
        .limit(1)

      if (!job) {
        return reply.status(404).send({ error: "Job not found" })
      }

      // Employer: must own the job. Worker: must have an accepted application.
      let isParty = false
      if (userRole === "employer") {
        isParty = job.employerId === userId
      } else {
        const [application] = await db
          .select({ id: jobApplications.id })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.jobId, jobId),
              eq(jobApplications.workerId, userId),
            ),
          )
          .limit(1)
        isParty = !!application
      }

      if (!isParty) {
        return reply.status(403).send({ error: "You are not a party to this job" })
      }

      // Insert dispute (UNIQUE(job_id, raised_by_id, type) prevents duplicates)
      let dispute: JobDispute
      try {
        const [created] = await db
          .insert(jobDisputes)
          .values({
            jobId,
            raisedById: userId,
            raisedByRole: userRole as "worker" | "employer",
            type,
            description,
          })
          .returning()
        dispute = created!
      } catch (err: unknown) {
        if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
          return reply.status(409).send({ error: "You have already raised this type of dispute for this job" })
        }
        throw err
      }

      // On NOSHOW_DISPUTE: place a dispute hold on the job to pause payout
      if (type === "NOSHOW_DISPUTE") {
        await db
          .update(jobPostings)
          .set({ disputeHold: true, updatedAt: new Date() })
          .where(eq(jobPostings.id, jobId))
      }

      return reply.status(201).send({ dispute })
    },
  )

  // GET /jobs/:jobId/disputes — list disputes
  app.get<{ Params: { jobId: string } }>(
    "/jobs/:jobId/disputes",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user.id
      const userRole = request.user.role

      const { jobId } = request.params

      const [job] = await db
        .select({ id: jobPostings.id, employerId: jobPostings.employerId })
        .from(jobPostings)
        .where(eq(jobPostings.id, jobId))
        .limit(1)

      if (!job) {
        return reply.status(404).send({ error: "Job not found" })
      }

      // Allow: admin (checked via x-admin-key in requireAdmin), the employer, or a worker with an application
      const adminKey = process.env["ADMIN_KEY"]
      const providedKey = request.headers["x-admin-key"]
      const isAdmin = adminKey ? providedKey === adminKey : false
      let canView = isAdmin || job.employerId === userId
      if (!canView) {
        const [application] = await db
          .select({ id: jobApplications.id })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.jobId, jobId),
              eq(jobApplications.workerId, userId),
            ),
          )
          .limit(1)
        canView = !!application
      }

      if (!canView) {
        return reply.status(403).send({ error: "Access denied" })
      }

      const disputes = await db
        .select()
        .from(jobDisputes)
        .where(eq(jobDisputes.jobId, jobId))

      return reply.send({ disputes })
    },
  )

  // PATCH /jobs/:jobId/disputes/:disputeId — admin resolves/dismisses
  app.patch<{ Params: { jobId: string; disputeId: string } }>(
    "/jobs/:jobId/disputes/:disputeId",
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { jobId, disputeId } = request.params

      const body = resolveDisputeSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: "Validation failed", details: body.error.issues })
      }
      const { status, resolutionNotes } = body.data

      const [existing] = await db
        .select()
        .from(jobDisputes)
        .where(and(eq(jobDisputes.id, disputeId), eq(jobDisputes.jobId, jobId)))
        .limit(1)

      if (!existing) {
        return reply.status(404).send({ error: "Dispute not found" })
      }

      if (existing.status !== "open") {
        return reply.status(409).send({ error: "Dispute is already resolved or dismissed" })
      }

      const [updated] = await db
        .update(jobDisputes)
        .set({
          status,
          resolutionNotes,
          resolvedBy: request.user.id,
          resolvedAt: new Date(),
        })
        .where(eq(jobDisputes.id, disputeId))
        .returning()

      // On resolution: lift dispute hold if no other open NOSHOW disputes remain
      if (existing.type === "NOSHOW_DISPUTE") {
        const openNoshowDisputes = await db
          .select({ id: jobDisputes.id })
          .from(jobDisputes)
          .where(
            and(
              eq(jobDisputes.jobId, jobId),
              eq(jobDisputes.type, "NOSHOW_DISPUTE"),
              eq(jobDisputes.status, "open"),
            ),
          )
        if (openNoshowDisputes.length === 0) {
          await db
            .update(jobPostings)
            .set({ disputeHold: false, updatedAt: new Date() })
            .where(eq(jobPostings.id, jobId))
        }
      }

      return reply.send({ dispute: updated })
    },
  )
}
