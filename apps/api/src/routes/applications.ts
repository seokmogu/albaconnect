import { FastifyInstance } from "fastify"
import { eq, and, or, sql, isNull, isNotNull } from "drizzle-orm"
import { db, jobApplications, jobPostings, users, penalties, workerProfiles } from "../db"
import { authenticate, requireWorker, requireEmployer } from "../middleware/auth"
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

  // POST /jobs/:jobId/checkin — worker checks in with GPS coordinates
  app.post("/jobs/:jobId/checkin", { preHandler: [requireWorker] }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    const workerId = request.user.id
    const body = request.body as { latitude?: number; longitude?: number }

    // Find accepted application for this worker + job
    const [application] = await db
      .select()
      .from(jobApplications)
      .where(and(eq(jobApplications.jobId, jobId), eq(jobApplications.workerId, workerId), eq(jobApplications.status, "accepted")))
      .limit(1)

    if (!application) {
      return reply.status(404).send({ error: "No accepted application found for this job" })
    }

    if ((application as any).checkin_at != null) {
      return reply.status(409).send({ error: "Already checked in" })
    }

    await db.execute(sql`
      UPDATE job_applications
      SET checkin_at = NOW(),
          checkin_latitude = ${body.latitude ?? null},
          checkin_longitude = ${body.longitude ?? null}
      WHERE id = ${application.id}
    `)

    return reply.send({ checkedInAt: new Date().toISOString(), jobId, workerId })
  })

  // POST /jobs/:jobId/checkout — worker checks out, calculates actual hours
  app.post("/jobs/:jobId/checkout", { preHandler: [requireWorker] }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    const workerId = request.user.id

    // Find application with checkin_at set but checkout_at null
    const rows = await db.execute<any>(sql`
      SELECT * FROM job_applications
      WHERE job_id = ${jobId}
        AND worker_id = ${workerId}
        AND checkin_at IS NOT NULL
        AND checkout_at IS NULL
      LIMIT 1
    `)

    const application = rows.rows?.[0]
    if (!application) {
      return reply.status(404).send({ error: "No active check-in found for this job" })
    }

    // Calculate actual_hours = (NOW() - checkin_at) / 3600 seconds, rounded to 2 decimal places
    const result = await db.execute<any>(sql`
      UPDATE job_applications
      SET checkout_at = NOW(),
          actual_hours = ROUND(EXTRACT(EPOCH FROM (NOW() - checkin_at)) / 3600.0, 2)
      WHERE id = ${application.id}
      RETURNING checkout_at, actual_hours
    `)

    const updated = result.rows?.[0] ?? {}
    const actualHours = parseFloat(updated.actual_hours ?? "0")

    // Trigger payment with actual_hours (stub: log intent, real logic hooks into payment system)
    setImmediate(() => {
      console.log(`[Checkout] Job ${jobId} worker ${workerId} checked out. Actual hours: ${actualHours}. Payment trigger queued.`)
    })

    return reply.send({ checkedOutAt: updated.checkout_at ?? new Date().toISOString(), actualHours, jobId })
  })

  // GET /jobs/:jobId/attendance — employer views attendance data for a job
  app.get("/jobs/:jobId/attendance", { preHandler: [requireEmployer] }, async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    const employerId = request.user.id

    // Verify employer owns this job
    const [job] = await db
      .select()
      .from(jobPostings)
      .where(and(eq(jobPostings.id, jobId), eq(jobPostings.employerId, employerId)))
      .limit(1)

    if (!job) {
      return reply.status(404).send({ error: "Job not found or access denied" })
    }

    const rows = await db.execute<any>(sql`
      SELECT
        ja.id,
        ja.worker_id,
        ja.status,
        ja.checkin_at,
        ja.checkout_at,
        ja.actual_hours,
        ja.checkin_latitude,
        ja.checkin_longitude,
        u.name as worker_name
      FROM job_applications ja
      JOIN users u ON u.id = ja.worker_id
      WHERE ja.job_id = ${jobId}
      ORDER BY ja.created_at ASC
    `)

    return reply.send({ attendance: rows.rows })
  })
}
