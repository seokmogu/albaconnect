import { FastifyInstance } from "fastify"
import { eq, and, or, sql } from "drizzle-orm"
import { db, jobApplications, jobPostings, users, penalties, workerProfiles } from "../db"
import { authenticate } from "../middleware/auth"
import { handleAcceptOffer, handleRejectOffer } from "../services/matching"
import { PLATFORM_FEE_RATE } from "@albaconnect/shared"

export async function applicationRoutes(app: FastifyInstance) {
  // GET /applications
  app.get("/applications", { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { status, page = 1, limit = 20 } = request.query as { status?: string; page?: number; limit?: number }
    const offset = (Number(page) - 1) * Number(limit)

    const rows = await db.execute<any>(sql`
      SELECT 
        ja.*,
        jp.title as job_title,
        jp.category,
        jp.start_at,
        jp.end_at,
        jp.hourly_rate,
        jp.total_amount,
        jp.address,
        ST_Y(jp.location::geometry) as lat,
        ST_X(jp.location::geometry) as lng,
        jp.employer_id,
        u.name as ${request.user.role === "worker" ? sql`employer_name` : sql`worker_name`}
      FROM job_applications ja
      JOIN job_postings jp ON jp.id = ja.job_id
      JOIN users u ON u.id = ${request.user.role === "worker" ? sql`jp.employer_id` : sql`ja.worker_id`}
      WHERE ja.worker_id = ${userId}
      ${status ? sql`AND ja.status = ${status}` : sql``}
      ORDER BY ja.offered_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `)

    return reply.send({ applications: rows.rows })
  })

  // POST /applications/:id/accept
  app.post("/applications/:id/accept", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const workerId = request.user.id

    if (request.user.role !== "worker") {
      return reply.status(403).send({ error: "Worker access required" })
    }

    const result = await handleAcceptOffer(id, workerId)

    if (!result.success) {
      return reply.status(400).send({ error: result.message })
    }

    return reply.send({ message: result.message })
  })

  // POST /applications/:id/reject
  app.post("/applications/:id/reject", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const workerId = request.user.id

    if (request.user.role !== "worker") {
      return reply.status(403).send({ error: "Worker access required" })
    }

    const result = await handleRejectOffer(id, workerId)
    return reply.send({ message: "Offer rejected" })
  })

  // POST /applications/:id/complete - mark job as done by worker
  app.post("/applications/:id/complete", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const userId = request.user.id

    const [application] = await db.select().from(jobApplications).where(eq(jobApplications.id, id)).limit(1)

    if (!application) {
      return reply.status(404).send({ error: "Application not found" })
    }

    if (application.workerId !== userId) {
      return reply.status(403).send({ error: "Access denied" })
    }

    if (application.status !== "accepted") {
      return reply.status(400).send({ error: "Application is not in accepted state" })
    }

    // Mark application as completed
    await db.update(jobApplications).set({ status: "completed", respondedAt: new Date() }).where(eq(jobApplications.id, id))

    // Check if all matched workers completed
    const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, application.jobId)).limit(1)
    if (job) {
      const acceptedApps = await db
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.jobId, job.id), eq(jobApplications.status, "accepted")))

      if (acceptedApps.length === 0) {
        // All workers completed, mark job as completed
        await db.update(jobPostings).set({ status: "completed", updatedAt: new Date() }).where(eq(jobPostings.id, job.id))
      }
    }

    return reply.send({ message: "Job marked as complete" })
  })

  // POST /applications/:id/noshow - report worker no-show (employer)
  app.post("/applications/:id/noshow", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const employerId = request.user.id

    if (request.user.role !== "employer") {
      return reply.status(403).send({ error: "Employer access required" })
    }

    const [application] = await db.select().from(jobApplications).where(eq(jobApplications.id, id)).limit(1)
    if (!application) return reply.status(404).send({ error: "Application not found" })

    const [job] = await db.select().from(jobPostings).where(and(eq(jobPostings.id, application.jobId), eq(jobPostings.employerId, employerId))).limit(1)
    if (!job) return reply.status(403).send({ error: "Access denied" })

    if (application.status !== "accepted") {
      return reply.status(400).send({ error: "Application is not in accepted state" })
    }

    // Penalize worker: forfeit total amount
    const penaltyAmount = job.totalAmount

    await db.insert(penalties).values({
      jobId: job.id,
      fromUserId: application.workerId,
      toUserId: employerId,
      type: "worker_noshow",
      amount: penaltyAmount,
      reason: "Worker no-show: forfeited wages",
      status: "pending",
    })

    await db.update(jobApplications).set({ status: "noshow", respondedAt: new Date() }).where(eq(jobApplications.id, id))

    // Try to find replacement
    setImmediate(() => {
      import("../services/matching").then(({ dispatchJob }) => dispatchJob(job.id))
    })

    return reply.send({
      message: "No-show recorded. Penalty applied. Searching for replacement worker.",
      penaltyAmount,
    })
  })
}
