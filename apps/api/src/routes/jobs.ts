import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and, count, sql, desc } from "drizzle-orm"
import { db, jobPostings, jobApplications, users, penalties, workerProfiles, employerProfiles } from "../db"
import { authenticate, requireEmployer, requireWorker } from "../middleware/auth"
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
    const { lat, lng, radius_km = 10, category, status = "open", page = 1, limit = 20, min_hourly_rate, start_date, avail_day, avail_from, avail_to } = request.query as {
      lat?: string
      lng?: string
      radius_km?: string
      category?: string
      status?: string
      page?: number
      limit?: number
      min_hourly_rate?: string
      start_date?: string
      avail_day?: string
      avail_from?: string
      avail_to?: string
    }

    const offset = (Number(page) - 1) * Number(limit)

    // Overnight window detection: avail_from > avail_to lexicographically (e.g. '22:00'–'06:00')
    // Standard AND logic breaks for jobs starting after midnight within an overnight window.
    // When overnight, use OR: (start >= from OR end <= to)
    const isOvernight = !!(avail_from && avail_to && avail_from > avail_to)

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
        ${avail_day !== undefined ? sql`AND EXTRACT(DOW FROM jp.start_at AT TIME ZONE 'Asia/Seoul')::int = ${parseInt(avail_day, 10)}` : sql``}
        ${isOvernight
          ? sql`AND (TO_CHAR(jp.start_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') >= ${avail_from} OR TO_CHAR(jp.end_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') <= ${avail_to})`
          : sql``}
        ${!isOvernight && avail_from ? sql`AND TO_CHAR(jp.start_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') >= ${avail_from}` : sql``}
        ${!isOvernight && avail_to ? sql`AND TO_CHAR(jp.end_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') <= ${avail_to}` : sql``}
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
        ${avail_day !== undefined ? sql`AND EXTRACT(DOW FROM jp.start_at AT TIME ZONE 'Asia/Seoul')::int = ${parseInt(avail_day, 10)}` : sql``}
        ${isOvernight
          ? sql`AND (TO_CHAR(jp.start_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') >= ${avail_from} OR TO_CHAR(jp.end_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') <= ${avail_to})`
          : sql``}
        ${!isOvernight && avail_from ? sql`AND TO_CHAR(jp.start_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') >= ${avail_from}` : sql``}
        ${!isOvernight && avail_to ? sql`AND TO_CHAR(jp.end_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') <= ${avail_to}` : sql``}
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

    // ── Plan tier enforcement ─────────────────────────────────────────────────
    const PLAN_LIMITS: Record<string, number> = { free: 3, basic: 20, premium: Infinity }

    const planResult = await db.execute(
      sql`SELECT plan_tier FROM employer_profiles WHERE user_id = ${employerId}::uuid LIMIT 1`
    )
    const tier = (planResult.rows[0] as any)?.plan_tier ?? 'free'
    const jobLimit = PLAN_LIMITS[tier] ?? 3

    if (jobLimit !== Infinity) {
      const countResult = await db.execute(
        sql`SELECT COUNT(*) AS active_count FROM job_postings WHERE employer_id = ${employerId}::uuid AND status IN ('open', 'matched', 'in_progress')`
      )
      const activeCount = Number((countResult.rows[0] as any)?.active_count ?? 0)

      if (activeCount >= jobLimit) {
        return reply.status(402).send({
          error: {
            code: 'PLAN_LIMIT_EXCEEDED',
            message: `현재 플랜(${tier})의 활성 공고 한도(${jobLimit}개)를 초과했습니다`,
            tier,
            limit: jobLimit,
            current: activeCount,
            upgrade_url: '/employer/upgrade',
          },
        })
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

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
      const employerId = request.user.id
      const apps = await db.execute<any>(sql`
        SELECT 
          ja.*,
          u.name as worker_name,
          wp.rating_avg as worker_rating,
          wp.categories as worker_categories,
          EXISTS(
            SELECT 1 FROM employer_favorites ef
            WHERE ef.employer_id = ${employerId} AND ef.worker_id = ja.worker_id
          ) AS is_favorited
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

  // PATCH /jobs/:id/complete — employer explicitly marks a job as complete
  // Triggers the 24-hour dispute window for escrow auto-release.
  app.patch<{ Params: { id: string } }>("/jobs/:id/complete", { preHandler: [requireEmployer] }, async (request, reply) => {
    const { id } = request.params
    const employerId = request.user.id

    const [job] = await db
      .select({
        id: jobPostings.id,
        status: jobPostings.status,
        employerId: jobPostings.employerId,
        escrowStatus: jobPostings.escrowStatus,
        completedAt: jobPostings.completedAt,
      })
      .from(jobPostings)
      .where(and(eq(jobPostings.id, id), eq(jobPostings.employerId, employerId)))
      .limit(1)

    if (!job) return reply.status(404).send({ error: "Job not found" })
    if (job.status === "completed") return reply.status(409).send({ error: "Job already completed", completedAt: job.completedAt })
    if (!(["in_progress", "matched"] as string[]).includes(job.status)) {
      return reply.status(422).send({ error: `Cannot complete job in status: ${job.status}` })
    }

    const now = new Date()
    await db
      .update(jobPostings)
      .set({ status: "completed", completedAt: now, statusUpdatedAt: now, updatedAt: now })
      .where(eq(jobPostings.id, id))

    // Notify accepted workers of dispute window start
    const acceptedApps = await db
      .select({ workerId: jobApplications.workerId })
      .from(jobApplications)
      .where(and(eq(jobApplications.jobId, id), eq(jobApplications.status, "accepted")))

    for (const { workerId } of acceptedApps) {
      await db.execute(
        sql`
          INSERT INTO notifications (user_id, type, title, body, data, read)
          VALUES (
            ${workerId}::uuid,
            'escrow_window_started',
            '근무가 완료되었습니다',
            '정산이 24시간 후 자동 처리됩니다. 문제가 있다면 지금 분쟁을 신청하세요.',
            ${JSON.stringify({ jobId: id, releaseAfter: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() })}::text,
            false
          )
        `,
      )
    }

    return reply.send({
      jobId: id,
      status: "completed",
      completedAt: now.toISOString(),
      escrowReleaseAfter: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      message: "24시간 분쟁 신청 기간 후 자동 정산됩니다",
    })
  })

  // ─── NEARBY JOBS ────────────────────────────────────────────────────────────

  /** Format distance_m into a human-readable label */
  function formatDistanceLabel(distanceM: number): string {
    if (distanceM < 1000) {
      return `${Math.round(distanceM)}m`
    }
    return `${(distanceM / 1000).toFixed(1)}km`
  }

  const MAX_NEARBY_RADIUS_KM = 50
  const DEFAULT_NEARBY_RADIUS_KM = 5
  const MAX_NEARBY_LIMIT = 50
  const DEFAULT_NEARBY_LIMIT = 20

  const nearbyQuerySchema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius_km: z.coerce.number().min(0.1).max(MAX_NEARBY_RADIUS_KM).default(DEFAULT_NEARBY_RADIUS_KM),
    limit: z.coerce.number().int().min(1).max(MAX_NEARBY_LIMIT).default(DEFAULT_NEARBY_LIMIT),
    cursor: z.string().optional(),
  })

  // GET /jobs/nearby — list open jobs within radius sorted by distance
  app.get("/jobs/nearby", { preHandler: [requireWorker] }, async (request, reply) => {
    const parsed = nearbyQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid query parameters", details: parsed.error.flatten() })
    }
    const { lat, lng, radius_km, limit, cursor } = parsed.data
    const radiusMeters = radius_km * 1000

    // Cursor-based pagination: cursor encodes the last distance_m seen
    const cursorDistanceM = cursor ? parseFloat(Buffer.from(cursor, "base64").toString("utf8")) : null

    const rows = await db.execute<{
      id: string
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
      lat: number
      lng: number
      distance_m: number
      company_name: string
    }>(sql`
      SELECT
        jp.id,
        jp.title,
        jp.category,
        jp.start_at,
        jp.end_at,
        jp.hourly_rate,
        jp.total_amount,
        jp.headcount,
        jp.matched_count,
        jp.address,
        jp.description,
        jp.status,
        ST_Y(jp.location::geometry) AS lat,
        ST_X(jp.location::geometry) AS lng,
        ST_Distance(
          jp.location::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) AS distance_m,
        COALESCE(ep.company_name, '') AS company_name
      FROM job_postings jp
      LEFT JOIN employer_profiles ep ON ep.user_id = jp.employer_id
      WHERE jp.status = 'open'
        AND ST_DWithin(
          jp.location::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
        ${cursorDistanceM !== null ? sql`AND ST_Distance(
          jp.location::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) > ${cursorDistanceM}` : sql``}
      ORDER BY distance_m ASC
      LIMIT ${limit + 1}
    `)

    const allRows = rows.rows
    const hasMore = allRows.length > limit
    const results = hasMore ? allRows.slice(0, limit) : allRows

    const nextCursor = hasMore
      ? Buffer.from(String(results[results.length - 1].distance_m)).toString("base64")
      : null

    return reply.send({
      jobs: results.map((r) => ({
        ...r,
        distance_m: Math.round(Number(r.distance_m)),
        distance_label: formatDistanceLabel(Number(r.distance_m)),
      })),
      count: results.length,
      hasMore,
      nextCursor,
      radiusKm: radius_km,
    })
  })

  // GET /jobs/nearby/count — quick count of open jobs within radius
  app.get("/jobs/nearby/count", { preHandler: [requireWorker] }, async (request, reply) => {
    const latRaw = (request.query as Record<string, string>).lat
    const lngRaw = (request.query as Record<string, string>).lng
    const radiusRaw = (request.query as Record<string, string>).radius_km

    if (!latRaw || !lngRaw) {
      return reply.status(400).send({ error: "lat and lng are required" })
    }

    const lat = parseFloat(latRaw)
    const lng = parseFloat(lngRaw)
    const radius_km = radiusRaw ? Math.min(parseFloat(radiusRaw), MAX_NEARBY_RADIUS_KM) : DEFAULT_NEARBY_RADIUS_KM

    if (isNaN(lat) || isNaN(lng)) {
      return reply.status(400).send({ error: "lat and lng must be valid numbers" })
    }

    const radiusMeters = radius_km * 1000

    const result = await db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total
      FROM job_postings jp
      WHERE jp.status = 'open'
        AND ST_DWithin(
          jp.location::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
    `)

    return reply.send({
      count: Number(result.rows[0]?.total ?? 0),
      radiusKm: radius_km,
      lat,
      lng,
    })
  })
}
