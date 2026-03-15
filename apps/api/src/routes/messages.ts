/**
 * messages.ts — Direct employer-worker messaging per job thread
 *
 * POST  /api/jobs/:id/messages         — send a message
 * GET   /api/jobs/:id/messages         — paginated thread (cursor, limit 30)
 * PATCH /api/jobs/:id/messages/read    — mark all unread from other party as read
 * GET   /api/workers/me/messages/unread-count — badge count for worker home
 */

import { FastifyInstance } from "fastify"
import { and, asc, desc, eq, isNull, lt, ne } from "drizzle-orm"
import { z } from "zod"
import { db, messages, jobPostings, jobApplications, users } from "../db"
import { authenticate, requireWorker, requireEmployer } from "../middleware/auth"
import { workerSockets } from "../services/matching"
import { sendAlimTalk, normalizePhone } from "../services/kakaoAlimTalk"

const sendMessageSchema = z.object({
  body: z.string().min(1).max(1000),
})

const cursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(30),
})

export async function messageRoutes(app: FastifyInstance) {
  // POST /api/jobs/:id/messages — send a message
  app.post<{ Params: { id: string } }>(
    "/api/jobs/:id/messages",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const jobId = request.params.id
      const senderId = request.user.id
      const senderRole = request.user.role // 'employer' | 'worker'

      const body = sendMessageSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
      }

      // Verify the job exists
      const [job] = await db
        .select({ id: jobPostings.id, employerId: jobPostings.employerId })
        .from(jobPostings)
        .where(eq(jobPostings.id, jobId))
        .limit(1)

      if (!job) {
        return reply.status(404).send({ error: "Job not found" })
      }

      let recipientId: string

      if (senderRole === "employer") {
        // Employer must own the job
        if (job.employerId !== senderId) {
          return reply.status(403).send({ error: "You are not the employer for this job" })
        }
        // Find the accepted/completed worker application to determine recipient
        const [app_] = await db
          .select({ workerId: jobApplications.workerId })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.jobId, jobId),
              // accepted or completed
            ),
          )
          .limit(1)

        // Allow employer to specify recipient via query
        const recipientParam = (request.query as any).recipientId
        if (!recipientParam) {
          return reply.status(400).send({ error: "recipientId query parameter required for employer messages" })
        }
        recipientId = recipientParam
      } else {
        // Worker must have an application on this job
        const [application] = await db
          .select({ workerId: jobApplications.workerId })
          .from(jobApplications)
          .where(and(eq(jobApplications.jobId, jobId), eq(jobApplications.workerId, senderId)))
          .limit(1)

        if (!application) {
          return reply.status(403).send({ error: "You do not have an application for this job" })
        }
        recipientId = job.employerId
      }

      // Create the message
      const [message] = await db
        .insert(messages)
        .values({
          jobId,
          senderId,
          recipientId,
          body: body.data.body,
        })
        .returning()

      // Real-time push if recipient is connected via WebSocket
      const recipientSocketId = workerSockets.get(recipientId)
      if (recipientSocketId) {
        // io is accessible via app.io (set up in index.ts)
        const io = (app as any).io
        if (io) {
          io.to(recipientSocketId).emit("message", {
            type: "message",
            jobId,
            message: {
              id: message!.id,
              senderId,
              body: body.data.body,
              createdAt: message!.createdAt,
            },
          })
        }
      } else {
        // KakaoTalk fallback — fetch recipient phone
        try {
          const [recipient] = await db
            .select({ phone: users.phone })
            .from(users)
            .where(eq(users.id, recipientId))
            .limit(1)

          if (recipient?.phone) {
            const normalized = normalizePhone(recipient.phone) ?? recipient.phone
            await sendAlimTalk(normalized, "NEW_MESSAGE", {
              job_id: jobId,
              preview: body.data.body.slice(0, 30) + (body.data.body.length > 30 ? "…" : ""),
            }).catch(() => { /* non-fatal */ })
          }
        } catch {
          // non-fatal notification failure
        }
      }

      return reply.status(201).send({ message })
    },
  )

  // GET /api/jobs/:id/messages — paginated thread
  app.get<{ Params: { id: string } }>(
    "/api/jobs/:id/messages",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const jobId = request.params.id
      const userId = request.user.id
      const query = cursorSchema.safeParse(request.query)
      if (!query.success) {
        return reply.status(400).send({ error: "Invalid query params" })
      }

      const { cursor, limit } = query.data

      // Verify user is party to this job thread
      const [job] = await db
        .select({ employerId: jobPostings.employerId })
        .from(jobPostings)
        .where(eq(jobPostings.id, jobId))
        .limit(1)

      if (!job) return reply.status(404).send({ error: "Job not found" })

      const isEmployer = job.employerId === userId
      if (!isEmployer) {
        // Check worker has application
        const [app_] = await db
          .select({ workerId: jobApplications.workerId })
          .from(jobApplications)
          .where(and(eq(jobApplications.jobId, jobId), eq(jobApplications.workerId, userId)))
          .limit(1)
        if (!app_) return reply.status(403).send({ error: "Access denied" })
      }

      const cursorDate = cursor ? new Date(cursor) : null

      const rows = await db
        .select()
        .from(messages)
        .where(
          cursorDate
            ? and(eq(messages.jobId, jobId), lt(messages.createdAt, cursorDate))
            : eq(messages.jobId, jobId),
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const results = hasMore ? rows.slice(0, limit) : rows
      const nextCursor = hasMore ? results[results.length - 1]!.createdAt.toISOString() : null

      return reply.send({ messages: results, nextCursor, count: results.length })
    },
  )

  // PATCH /api/jobs/:id/messages/read — mark unread from other party as read
  app.patch<{ Params: { id: string } }>(
    "/api/jobs/:id/messages/read",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const jobId = request.params.id
      const userId = request.user.id

      await db
        .update(messages)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(messages.jobId, jobId),
            eq(messages.recipientId, userId),
            isNull(messages.readAt),
          ),
        )

      return reply.send({ ok: true })
    },
  )

  // GET /api/workers/me/messages/unread-count
  app.get(
    "/api/workers/me/messages/unread-count",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user.id

      const result = await db.execute<{ count: string }>(
        db
          .select()
          .from(messages)
          .where(and(eq(messages.recipientId, userId), isNull(messages.readAt)))
          .toSQL() as any,
      ).catch(async () => {
        // Fallback: raw count
        const rows = await db
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.recipientId, userId), isNull(messages.readAt)))
        return { rows: [{ count: String(rows.length) }] }
      })

      const count = Number((result as any).rows?.[0]?.count ?? 0)
      return reply.send({ unreadCount: count })
    },
  )
}
