import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and, sql, desc } from "drizzle-orm"
import { db, jobPostings, jobApplications, users, penalties, workerProfiles } from "../db"
import { authenticate, requireEmployer } from "../middleware/auth"
import { dispatchJob } from "../services/matching"
import { LATE_CANCEL_PENALTY_RATE, PLATFORM_FEE_RATE } from "@albaconnect/shared"
import { validateTransition, getValidTransitions } from "../services/jobLifecycle"
import type { JobStatus, ActorRole } from "../services/jobLifecycle"
import { workerSockets } from "../services/matching"

const createJobSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  hourlyRate: z.number().int().positive(),
  headcount: z.number().int().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(1).max(500),
  description: z.string().min(1),
})

export async function jobRoutes(app: FastifyInstance) {
  // ─── PUBLIC UNAUTHENTICATED ENDPOINTS ──────────────────────────────────────

  // GET /api/v2/jobs/public — public job listing (no auth, rate-limited)
  // Returns only safe columns; never exposes PII, employerId, or businessNumber
  app.get(
    "/api/v2/jobs/public",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const {
        category,
        min_pay,
        max_pay,
        page = 1,
        limit = 20,
      } = request.query as {
        category?: string
        min_pay?: string
        max_pay?: string
        page?: number
        limit?: number
      }

      const pageNum = Math.max(1, Number(page))
      const limitNum = Math.min(100, Math.max(1, Number(limit)))
      const offset = (pageNum - 1) * limitNum

      const rows = await db.execute<{
        id: string
        title: string
        category: string
        hourly_rate: number
        total_amount: number
        address: string
        start_at: Date
        end_at: Date
        headcount: number
        company_name: string
      }>(sql`
        SELECT
          jp.id,
          jp.title,
          jp.category,
          jp.hourly_rate,
          jp.total_amount,
          jp.address,
          jp.start_at,
          jp.end_at,
          jp.headcount,
          COALESCE(ep.company_name, '알바커넥트 파트너') AS company_name
        FROM job_postings jp
        LEFT JOIN employer_profiles ep ON ep.user_id = jp.employer_id
        WHERE jp.status = 'open'
          AND jp.start_at > now()
          ${category ? sql`AND jp.category = ${category}` : sql``}
          ${min_pay ? sql`AND jp.hourly_rate >= ${Number(min_pay)}` : sql``}
          ${max_pay ? sql`AND jp.hourly_rate <= ${Number(max_pay)}` : sql``}
        ORDER BY jp.start_at ASC
        LIMIT ${limitNum} OFFSET ${offset}
      `)

      const countRows = await db.execute<{ total: string }>(sql`
        SELECT COUNT(*) AS total
        FROM job_postings jp
        WHERE jp.status = 'open'
          AND jp.start_at > now()
          ${category ? sql`AND jp.category = ${category}` : sql``}
          ${min_pay ? sql`AND jp.hourly_rate >= ${Number(min_pay)}` : sql``}
          ${max_pay ? sql`AND jp.hourly_rate <= ${Number(max_pay)}` : sql``}
      `)

      return reply.send({
        jobs: rows.rows,
        total: Number(countRows.rows[0]?.total ?? 0),
        page: pageNum,
        limit: limitNum,
      })
    }
  )

  // GET /api/v2/jobs/public/:id — public job detail (no auth)
  app.get(
    "/api/v2/jobs/public/:id",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      // Basic UUID validation
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
        return reply.status(400).send({ error: "Invalid job ID" })
      }

      const rows = await db.execute<{
        id: string
        title: string
        category: string
        hourly_rate: number
        total_amount: number
        address: string
        start_at: Date
        end_at: Date
        headcount: number
        description: string
        company_name: string
        status: string
      }>(sql`
        SELECT
          jp.id,
          jp.title,
          jp.category,
          jp.hourly_rate,
          jp.total_amount,
          jp.address,
          jp.start_at,
          jp.end_at,
          jp.headcount,
          jp.description,
          COALESCE(ep.company_name, '알바커넥트 파트너') AS company_name
        FROM job_postings jp
        LEFT JOIN employer_profiles ep ON ep.user_id = jp.employer_id
        WHERE jp.id = ${id}
          AND jp.status = 'open'
      `)

      if (rows.rows.length === 0) {
        return reply.status(404).send({ error: "Job not found" })
      }

      return reply.send({ job: rows.rows[0] })
    }
  )

  // ───────────────────────────────────────────────────────────────────────────

  // GET /jobs - list with optional location filter
  app.get("/jobs", { preHandler: [authenticate] }, async (request, reply) => {
    const { lat, lng, radius_km = 10, category, status = "open", page = 1, limit = 20, min_hourly_rate, start_date } = request.query as {
      lat?: string
      lng?: string
      radius_km?: string
      category?: string
      status?: string
      page?: number
      limit?: number
      min_hourly_rate?: string
      start_date?: string
    }

    const offset = (Number(page) - 1) * Number(limit)

    let query: string
    let params: unknown[]

    if (lat && lng) {
      const radiusMeters = Number(radius_km) * 1000
      const rows = await db.execute<{
        id: string
        employer_id: string
        title: string
        category: string
        start_at: Date
        end_at: Date
        hourly_rate: number
        total_amount: number
        headcount: number
        matched_count: number
        address: string
        description: string
        status: string
        escrow_status: string
        created_at: Date
        distance: number
        employer_name: string
        company_name: string
        lat: number
        lng: number
      }>(sql`
        SELECT 
          jp.*,
          ST_Y(jp.location::geometry) as lat,
          ST_X(jp.location::geometry) as lng,
          ST_Distance(
            jp.location::geography,
            ST_SetSRID(ST_MakePoint(${Number(lng)}, ${Number(lat)}), 4326)::geography
          ) as distance,
          u.name as employer_name,
          COALESCE(ep.company_name, '') as company_name
        FROM job_postings jp
        JOIN users u ON u.id = jp.employer_id
        LEFT JOIN employer_profiles ep ON ep.user_id = jp.employer_id
        WHERE jp.status = ${status}
        ${category ? sql`AND jp.category = ${category}` : sql``}
        ${min_hourly_rate ? sql`AND jp.hourly_rate >= ${Number(min_hourly_rate)}` : sql``}
        ${start_date ? sql`AND jp.start_at::date = ${start_date}::date` : sql``}
        AND ST_DWithin(
          jp.location::geography,
          ST_SetSRID(ST_MakePoint(${Number(lng)}, ${Number(lat)}), 4326)::geography,
          ${radiusMeters}
        )
        ORDER BY distance ASC
        LIMIT ${Number(limit)} OFFSET ${offset}
      `)
      return reply.send({ jobs: rows.rows, page: Number(page), limit: Number(limit) })
    } else {
      const rows = await db.execute<any>(sql`
        SELECT 
          jp.*,
          ST_Y(jp.location::geometry) as lat,
          ST_X(jp.location::geometry) as lng,
          u.name as employer_name,
          COALESCE(ep.company_name, '') as company_name
        FROM job_postings jp
        JOIN users u ON u.id = jp.employer_id
        LEFT JOIN employer_profiles ep ON ep.user_id = jp.employer_id
        WHERE jp.status = ${status}
        ${category ? sql`AND jp.category = ${category}` : sql``}
        ${min_hourly_rate ? sql`AND jp.hourly_rate >= ${Number(min_hourly_rate)}` : sql``}
        ${start_date ? sql`AND jp.start_at::date = ${start_date}::date` : sql``}
        ORDER BY jp.created_at DESC
        LIMIT ${Number(limit)} OFFSET ${offset}
      `)
      return reply.send({ jobs: rows.rows, page: Number(page), limit: Number(limit) })
    }
  })

  // POST /jobs - create new job posting
  app.post("/jobs", { preHandler: [requireEmployer] }, async (request, reply) => {
    const body = createJobSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    const { title, category, startAt, endAt, hourlyRate, headcount, lat, lng, address, description } = body.data
    const employerId = request.user.id

    const startDate = new Date(startAt)
    const endDate = new Date(endAt)

    if (endDate <= startDate) {
      return reply.status(400).send({ error: "endAt must be after startAt" })
    }

    const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
    const totalAmount = Math.round(hourlyRate * durationHours * headcount)

    const [job] = await db
      .insert(jobPostings)
      .values({
        employerId,
        title,
        category,
        startAt: startDate,
        endAt: endDate,
        hourlyRate,
        totalAmount,
        headcount,
        location: { lat, lng } as any,
        address,
        description,
        status: "open",
      })
      .returning()

    // Trigger matching engine asynchronously
    setImmediate(() => dispatchJob(job.id))

    return reply.status(201).send({ job })
  })

  // GET /jobs/:id
  app.get("/jobs/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const rows = await db.execute<any>(sql`
      SELECT 
        jp.*,
        ST_Y(jp.location::geometry) as lat,
        ST_X(jp.location::geometry) as lng,
        u.name as employer_name,
        COALESCE(ep.company_name, '') as company_name,
        ep.rating_avg as employer_rating
      FROM job_postings jp
      JOIN users u ON u.id = jp.employer_id
      LEFT JOIN employer_profiles ep ON ep.user_id = jp.employer_id
      WHERE jp.id = ${id}
    `)

    if (rows.rows.length === 0) {
      return reply.status(404).send({ error: "Job not found" })
    }

    // Get applications if employer is viewing their own job
    const job = rows.rows[0]
    let applications: unknown[] = []

    if (request.user.role === "employer" && request.user.id === job.employer_id) {
      const apps = await db.execute<any>(sql`
        SELECT 
          ja.*,
          u.name as worker_name,
          wp.rating_avg as worker_rating,
          wp.categories as worker_categories
        FROM job_applications ja
        JOIN users u ON u.id = ja.worker_id
        LEFT JOIN worker_profiles wp ON wp.user_id = ja.worker_id
        WHERE ja.job_id = ${id}
        ORDER BY ja.offered_at DESC
      `)
      applications = apps.rows
    }

    return reply.send({ job, applications })
  })

  // PUT /jobs/:id/cancel
  app.put("/jobs/:id/cancel", { preHandler: [requireEmployer] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const employerId = request.user.id

    const [job] = await db
      .select()
      .from(jobPostings)
      .where(and(eq(jobPostings.id, id), eq(jobPostings.employerId, employerId)))
      .limit(1)

    if (!job) {
      return reply.status(404).send({ error: "Job not found" })
    }

    if (!["open", "matched"].includes(job.status)) {
      return reply.status(400).send({ error: `Cannot cancel job with status: ${job.status}` })
    }

    // Calculate penalty for late cancellation
    const hoursUntilStart = (new Date(job.startAt).getTime() - Date.now()) / (1000 * 60 * 60)
    const acceptedApps = await db
      .select()
      .from(jobApplications)
      .where(and(eq(jobApplications.jobId, id), eq(jobApplications.status, "accepted")))

    const penaltyRecords = []

    for (const app of acceptedApps) {
      let penaltyAmount = 0
      let penaltyType: "employer_cancel_late" | "employer_noshow" = "employer_cancel_late"

      if (hoursUntilStart <= 0) {
        // No-show or same-day cancellation - full amount + platform fee
        penaltyAmount = Math.round(job.totalAmount * (1 + PLATFORM_FEE_RATE))
        penaltyType = "employer_noshow"
      } else if (hoursUntilStart < 24) {
        // Late cancellation - 30% of agreed amount
        penaltyAmount = Math.round(job.totalAmount * LATE_CANCEL_PENALTY_RATE)
        penaltyType = "employer_cancel_late"
      }

      if (penaltyAmount > 0) {
        penaltyRecords.push({
          jobId: id,
          fromUserId: employerId,
          toUserId: app.workerId,
          type: penaltyType,
          amount: penaltyAmount,
          reason: `Employer cancellation with ${Math.round(hoursUntilStart)}h notice`,
          status: "pending" as const,
        })
      }

      await db.update(jobApplications).set({ status: "rejected" }).where(eq(jobApplications.id, app.id))
    }

    if (penaltyRecords.length > 0) {
      await db.insert(penalties).values(penaltyRecords)
    }

    await db.update(jobPostings).set({ status: "cancelled", updatedAt: new Date() }).where(eq(jobPostings.id, id))

    return reply.send({
      message: "Job cancelled",
      penaltiesApplied: penaltyRecords.length,
      totalPenalty: penaltyRecords.reduce((s, p) => s + p.amount, 0),
    })
  })

  // POST /jobs/:id/dispatch — manually trigger dispatch for an open job
  app.post("/jobs/:id/dispatch", { preHandler: [requireEmployer] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, id)).limit(1)
    if (!job) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Job not found" } })
    if (job.employerId !== request.user.id) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Not your job" } })
    }
    if (job.status !== "open") {
      return reply.status(409).send({ error: { code: "CONFLICT", message: "Job is not open" } })
    }

    setImmediate(() => dispatchJob(id))
    return reply.status(202).send({ message: "Dispatch triggered" })
  })

  // PATCH /jobs/:id/status — advance job status with role-based guards
  app.patch("/jobs/:id/status", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      status: z.enum(["open", "matched", "in_progress", "completed", "cancelled"]),
    }).safeParse(request.body)

    if (!body.success) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid status value" } })
    }

    const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, id)).limit(1)
    if (!job) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Job not found" } })

    // Determine actor role
    const userId = request.user.id
    const userRole = request.user.role as "employer" | "worker"
    const isOwner = job.employerId === userId

    // Workers can only act on jobs they're accepted for
    let actorRole: ActorRole = userRole === "employer" ? "employer" : "worker"
    if (userRole === "employer" && !isOwner) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Not your job" } })
    }
    if (userRole === "worker") {
      // Verify worker has an accepted application for this job
      const [accepted] = await db
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.jobId, id), eq(jobApplications.workerId, userId), eq(jobApplications.status, "accepted")))
        .limit(1)
      if (!accepted) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "You are not assigned to this job" } })
      }
    }

    const targetStatus = body.data.status as JobStatus
    const currentStatus = job.status as JobStatus
    const result = validateTransition(currentStatus, targetStatus, actorRole)

    if (!result.ok) {
      return reply.status(409).send({ error: { code: "INVALID_TRANSITION", message: result.error } })
    }

    const now = new Date()
    const updateData: Record<string, unknown> = {
      status: targetStatus,
      statusUpdatedAt: now,
      updatedAt: now,
    }
    if (targetStatus === "completed") {
      updateData.completedAt = now
      updateData.paymentStatus = "triggered"
    }

    await db.update(jobPostings).set(updateData).where(eq(jobPostings.id, id))

    // Emit WebSocket event on completion
    if (targetStatus === "completed") {
      // Notify all accepted workers
      const acceptedApps = await db
        .select({ workerId: jobApplications.workerId })
        .from(jobApplications)
        .where(and(eq(jobApplications.jobId, id), eq(jobApplications.status, "accepted")))

      const payload = { type: "job_completed", jobId: id, completedAt: now.toISOString() }

      for (const app of acceptedApps) {
        const socketId = workerSockets.get(app.workerId)
        if (socketId) {
          // Emit via the global io if available — graceful no-op if socket server not set
          try {
            const { io: socketIo } = await import("../plugins/socket.js" as string)
            if (socketIo) socketIo.to(socketId).emit("job_completed", payload)
          } catch { /* socket not initialized in test env */ }
        }
      }
      // Also notify employer
      const employerSocketId = workerSockets.get(job.employerId)
      if (employerSocketId) {
        try {
          const { io: socketIo } = await import("../plugins/socket.js" as string)
          if (socketIo) socketIo.to(employerSocketId).emit("job_completed", payload)
        } catch { /* no-op */ }
      }
    }

    return reply.send({
      jobId: id,
      previousStatus: currentStatus,
      status: targetStatus,
      updatedAt: now.toISOString(),
      paymentStatus: targetStatus === "completed" ? "triggered" : job.paymentStatus ?? "pending",
      validNextStatuses: getValidTransitions(targetStatus, actorRole),
    })
  })
}
