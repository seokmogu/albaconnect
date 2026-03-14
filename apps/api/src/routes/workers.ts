import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db, workerProfiles, users, workerAvailability, workerBlackout } from "../db"
import { authenticate, requireWorker } from "../middleware/auth"
import { dispatchJob } from "../services/matching"
import { sql } from "drizzle-orm"
import { jobPostings } from "../db"
import { workerProfileCache, recommendedJobsCache, earningsCache, cacheGetL2, cacheSetL2, cacheDelL2, CACHE_TTL } from "../services/cache"
import { computeMatchScore } from "../services/scoring"
import { sendOtp, verifyOtp } from '../services/otpService.js'

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

const profileSchema = z.object({
  categories: z.array(z.string()).optional(),
  bio: z.string().max(1000).optional(),
})

const availabilityScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().optional(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime().optional(),
})

const blackoutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
})

export async function workerRoutes(app: FastifyInstance) {
  // PUT /workers/availability
  app.put("/workers/availability", { preHandler: [requireWorker] }, async (request, reply) => {
    const body = availabilitySchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    const { isAvailable, lat, lng } = body.data
    const workerId = request.user.id

    if (isAvailable && (lat === undefined || lng === undefined)) {
      return reply.status(400).send({ error: "lat and lng required when setting available" })
    }

    if (lat !== undefined && lng !== undefined) {
      await db.execute(sql`
        UPDATE worker_profiles 
        SET 
          is_available = ${isAvailable},
          location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          last_seen_at = NOW(),
          updated_at = NOW()
        WHERE user_id = ${workerId}
      `)
    } else {
      await db.update(workerProfiles).set({ isAvailable, updatedAt: new Date() }).where(eq(workerProfiles.userId, workerId))
    }

    // Invalidate profile cache on availability change
    workerProfileCache.delete(`worker:${workerId}`)
    recommendedJobsCache.delete(`recommended:${workerId}`)

    // If worker goes available, check for nearby open jobs
    if (isAvailable && lat !== undefined && lng !== undefined) {
      setImmediate(async () => {
        const nearbyJobs = await db.execute<{ id: string }>(sql`
          SELECT jp.id
          FROM job_postings jp
          WHERE jp.status = 'open'
          AND jp.matched_count < jp.headcount
          AND ST_DWithin(
            jp.location::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            5000
          )
          ORDER BY jp.start_at ASC
          LIMIT 5
        `)

        for (const job of nearbyJobs.rows) {
          await dispatchJob(job.id)
        }
      })
    }

    return reply.send({ isAvailable, message: "Availability updated" })
  })

  app.post("/workers/availability-schedule", { preHandler: [requireWorker] }, async (request, reply) => {
    const body = availabilityScheduleSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    const workerId = request.user.id
    const [slot] = await db
      .insert(workerAvailability)
      .values({
        workerId,
        dayOfWeek: body.data.dayOfWeek,
        startTime: body.data.startTime,
        endTime: body.data.endTime,
        timezone: body.data.timezone ?? 'Asia/Seoul',
        validFrom: new Date(body.data.validFrom),
        validUntil: body.data.validUntil ? new Date(body.data.validUntil) : null,
      })
      .returning()

    return reply.status(201).send(slot)
  })

  app.get("/workers/availability-schedule", { preHandler: [requireWorker] }, async (request, reply) => {
    const workerId = request.user.id
    const slots = await db.select().from(workerAvailability).where(eq(workerAvailability.workerId, workerId))
    return reply.send({ slots })
  })

  app.delete("/workers/availability-schedule/:id", { preHandler: [requireWorker] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const workerId = request.user.id
    const [slot] = await db.select().from(workerAvailability).where(eq(workerAvailability.id, id)).limit(1)
    if (!slot) return reply.status(404).send({ error: "Availability slot not found" })
    if (slot.workerId !== workerId) return reply.status(403).send({ error: "Forbidden" })
    await db.delete(workerAvailability).where(eq(workerAvailability.id, id))
    return reply.send({ ok: true })
  })

  app.post("/workers/blackout", { preHandler: [requireWorker] }, async (request, reply) => {
    const body = blackoutSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    const workerId = request.user.id
    await db.execute(sql`
      INSERT INTO worker_blackout (worker_id, blackout_date, reason)
      VALUES (${workerId}, ${body.data.date}::date, ${body.data.reason ?? null})
      ON CONFLICT (worker_id, blackout_date)
      DO UPDATE SET reason = EXCLUDED.reason
    `)
    return reply.status(201).send({ ok: true })
  })

  app.delete("/workers/blackout/:date", { preHandler: [requireWorker] }, async (request, reply) => {
    const { date } = request.params as { date: string }
    const workerId = request.user.id
    await db.execute(sql`DELETE FROM worker_blackout WHERE worker_id = ${workerId} AND blackout_date = ${date}::date`)
    return reply.send({ ok: true })
  })

  app.get("/workers/available", async (request, reply) => {
    const { date, duration_hours = 1, lat, lng, radius_km = 10 } = request.query as {
      date?: string
      duration_hours?: number
      lat?: string
      lng?: string
      radius_km?: string
    }

    if (!date) return reply.status(400).send({ error: "date is required" })

    const rows = await db.execute(sql`
      SELECT u.id, u.name, wp.categories, wp.rating_avg, wp.rating_count,
        ST_Y(wp.location::geometry) AS lat,
        ST_X(wp.location::geometry) AS lng
      FROM users u
      JOIN worker_profiles wp ON wp.user_id = u.id
      WHERE u.role = 'worker'
        AND EXISTS (
          SELECT 1 FROM worker_availability wa
          WHERE wa.worker_id = u.id
            AND wa.day_of_week = EXTRACT(DOW FROM ${date}::date)
            AND wa.valid_from <= ${date}::timestamptz
            AND (wa.valid_until IS NULL OR wa.valid_until >= ${date}::timestamptz)
        )
        AND NOT EXISTS (
          SELECT 1 FROM worker_blackout wb
          WHERE wb.worker_id = u.id
            AND wb.blackout_date = ${date}::date
        )
        ${lat && lng ? sql`AND wp.location IS NOT NULL AND ST_DWithin(
          wp.location::geography,
          ST_SetSRID(ST_MakePoint(${Number(lng)}, ${Number(lat)}), 4326)::geography,
          ${Number(radius_km) * 1000}
        )` : sql``}
    `)

    return reply.send({ workers: rows.rows, durationHours: Number(duration_hours) })
  })

  // GET /workers/profile
  app.get("/workers/profile", { preHandler: [requireWorker] }, async (request, reply) => {
    const workerId = request.user.id
    const cacheKey = `worker:${workerId}`

    const cached = workerProfileCache.get(cacheKey)
    if (cached) return reply.send(cached)

    const [user] = await db.select().from(users).where(eq(users.id, workerId)).limit(1)
    const [profile] = await db.select().from(workerProfiles).where(eq(workerProfiles.userId, workerId)).limit(1)

    if (!user || !profile) {
      return reply.status(404).send({ error: "Profile not found" })
    }

    // Fetch job history stats for this worker
    const stats = await db.execute<{
      total_completed: number
      no_show_count: number
      categories_worked: string[]
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE ja.status = 'completed') AS total_completed,
        COUNT(*) FILTER (WHERE ja.status = 'noshow') AS no_show_count,
        ARRAY_AGG(DISTINCT jp.category) FILTER (WHERE ja.status = 'completed') AS categories_worked
      FROM job_applications ja
      JOIN job_postings jp ON jp.id = ja.job_id
      WHERE ja.worker_id = ${workerId}
    `)
    const s = stats.rows[0]

    const result = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      categories: profile.categories,
      bio: profile.bio,
      ratingAvg: profile.ratingAvg,
      ratingCount: profile.ratingCount,
      isAvailable: profile.isAvailable,
      verificationStatus: profile.isPhoneVerified ? 'verified' : 'unverified',
      lastSeenAt: profile.lastSeenAt,
      stats: {
        totalCompleted: Number(s?.total_completed ?? 0),
        noShowCount: Number(s?.no_show_count ?? 0),
        categoriesWorked: s?.categories_worked?.filter(Boolean) ?? [],
        completionRate: (() => {
          const total = Number(s?.total_completed ?? 0) + Number(s?.no_show_count ?? 0)
          return total > 0 ? Math.round((Number(s?.total_completed ?? 0) / total) * 100) : null
        })(),
      },
    }

    workerProfileCache.set(cacheKey, result, CACHE_TTL.WORKER_PROFILE)
    return reply.send(result)
  })

  // PUT /workers/profile
  app.put("/workers/profile", { preHandler: [requireWorker] }, async (request, reply) => {
    const body = profileSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed" })
    }

    const workerId = request.user.id
    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    if (body.data.categories !== undefined) updateData.categories = body.data.categories
    if (body.data.bio !== undefined) updateData.bio = body.data.bio

    await db.update(workerProfiles).set(updateData).where(eq(workerProfiles.userId, workerId))

    // Invalidate cache
    workerProfileCache.delete(`worker:${workerId}`)

    return reply.send({ message: "Profile updated" })
  })

  // GET /workers/recommended-jobs
  // Returns personalized job recommendations ranked by the skill-based scoring algorithm
  app.get("/workers/recommended-jobs", { preHandler: [requireWorker] }, async (request, reply) => {
    const workerId = request.user.id
    const { limit = 10, radius_km = 10 } = request.query as { limit?: number; radius_km?: string }

    const cacheKey = `recommended:${workerId}`
    const cached = recommendedJobsCache.get(cacheKey)
    if (cached) return reply.send(cached)

    // Get worker profile with location
    const profile = await db.execute<{
      user_id: string
      categories: string[]
      rating_avg: string
      rating_count: number
      is_available: boolean
      lat: number | null
      lng: number | null
      last_seen_at: Date | null
    }>(sql`
      SELECT
        wp.user_id,
        wp.categories,
        wp.rating_avg,
        wp.rating_count,
        wp.is_available,
        ST_Y(wp.location::geometry) AS lat,
        ST_X(wp.location::geometry) AS lng,
        wp.last_seen_at
      FROM worker_profiles wp
      WHERE wp.user_id = ${workerId}
      LIMIT 1
    `)

    if (!profile.rows.length) {
      return reply.status(404).send({ error: "Worker profile not found" })
    }

    const worker = profile.rows[0]

    // Fetch worker's job history stats per category
    const historyStats = await db.execute<{
      category: string
      completed_count: number
    }>(sql`
      SELECT
        jp.category,
        COUNT(*) FILTER (WHERE ja.status = 'completed') AS completed_count
      FROM job_applications ja
      JOIN job_postings jp ON jp.id = ja.job_id
      WHERE ja.worker_id = ${workerId}
      GROUP BY jp.category
    `)

    const historyByCategory: Record<string, number> = {}
    for (const row of historyStats.rows) {
      historyByCategory[row.category] = Number(row.completed_count)
    }

    const overallStats = await db.execute<{
      total_completed: number
      no_show_count: number
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS total_completed,
        COUNT(*) FILTER (WHERE status = 'noshow') AS no_show_count
      FROM job_applications
      WHERE worker_id = ${workerId}
    `)

    const overallS = overallStats.rows[0]
    const totalCompleted = Number(overallS?.total_completed ?? 0)
    const noShowCount = Number(overallS?.no_show_count ?? 0)

    // Fetch open jobs — near worker if location is set, otherwise recent jobs
    const radiusMeters = Number(radius_km) * 1000

    let openJobs: Array<{
      id: string
      title: string
      category: string
      start_at: string
      end_at: string
      hourly_rate: number
      total_amount: number
      headcount: number
      matched_count: number
      address: string
      employer_name: string
      company_name: string
      distance: number | null
      lat: number
      lng: number
    }>

    if (worker.lat !== null && worker.lng !== null) {
      const rows = await db.execute<any>(sql`
        SELECT
          jp.id, jp.title, jp.category,
          jp.start_at, jp.end_at,
          jp.hourly_rate, jp.total_amount,
          jp.headcount, jp.matched_count,
          jp.address,
          ST_Y(jp.location::geometry) AS lat,
          ST_X(jp.location::geometry) AS lng,
          ST_Distance(
            jp.location::geography,
            ST_SetSRID(ST_MakePoint(${worker.lng}, ${worker.lat}), 4326)::geography
          ) AS distance,
          u.name AS employer_name,
          COALESCE(ep.company_name, '') AS company_name
        FROM job_postings jp
        JOIN users u ON u.id = jp.employer_id
        LEFT JOIN employer_profiles ep ON ep.user_id = jp.employer_id
        WHERE jp.status = 'open'
          AND jp.matched_count < jp.headcount
          AND ST_DWithin(
            jp.location::geography,
            ST_SetSRID(ST_MakePoint(${worker.lng}, ${worker.lat}), 4326)::geography,
            ${radiusMeters}
          )
        ORDER BY jp.start_at ASC
        LIMIT 50
      `)
      openJobs = rows.rows
    } else {
      // No location — return recent open jobs
      const rows = await db.execute<any>(sql`
        SELECT
          jp.id, jp.title, jp.category,
          jp.start_at, jp.end_at,
          jp.hourly_rate, jp.total_amount,
          jp.headcount, jp.matched_count,
          jp.address,
          ST_Y(jp.location::geometry) AS lat,
          ST_X(jp.location::geometry) AS lng,
          NULL AS distance,
          u.name AS employer_name,
          COALESCE(ep.company_name, '') AS company_name
        FROM job_postings jp
        JOIN users u ON u.id = jp.employer_id
        LEFT JOIN employer_profiles ep ON ep.user_id = jp.employer_id
        WHERE jp.status = 'open'
          AND jp.matched_count < jp.headcount
        ORDER BY jp.created_at DESC
        LIMIT 50
      `)
      openJobs = rows.rows
    }

    // Score each job for this worker
    const workerCategories = worker.categories ?? []
    const matchRadius = radiusMeters

    const scored = openJobs
      .map(job => {
        const score = computeMatchScore({
          distanceMeters: job.distance ?? matchRadius,
          ratingAvg: parseFloat(worker.rating_avg),
          ratingCount: worker.rating_count,
          workerCategories,
          jobCategory: job.category,
          lastSeenAt: worker.last_seen_at,
          matchRadius,
          completedJobsInCategory: historyByCategory[job.category] ?? 0,
          totalCompletedJobs: totalCompleted,
          noShowCount,
        })

        return { ...job, score }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Number(limit))

    const result = { jobs: scored, total: scored.length }
    recommendedJobsCache.set(cacheKey, result, CACHE_TTL.RECOMMENDED_JOBS)

    return reply.send(result)
  })

  // POST /workers/push-subscription — save Web Push subscription for background notifications
  app.post("/workers/push-subscription", { preHandler: [requireWorker] }, async (request, reply) => {
    const bodySchema = z.object({
      endpoint: z.string().url(),
      keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      }),
      expirationTime: z.number().nullable().optional(),
    })

    const parsed = bodySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid subscription object", details: parsed.error.flatten() })
    }

    const userId = (request.user as { id: string }).id
    await db
      .update(workerProfiles)
      .set({ pushSubscription: parsed.data })
      .where(eq(workerProfiles.userId, userId))

    return reply.status(200).send({ ok: true })
  })

  // DELETE /workers/push-subscription — remove Web Push subscription (opt-out)
  app.delete("/workers/push-subscription", { preHandler: [requireWorker] }, async (request, reply) => {
    const userId = (request.user as { id: string }).id
    await db
      .update(workerProfiles)
      .set({ pushSubscription: null })
      .where(eq(workerProfiles.userId, userId))
    return reply.status(200).send({ ok: true })
  })

  // GET /workers/earnings — aggregate earnings stats (30d window, Redis-cached 5 min)
  app.get("/workers/earnings", { preHandler: [requireWorker] }, async (request, reply) => {
    const workerId = request.user.id
    const cacheKey = `earnings:${workerId}`

    const cached = await cacheGetL2(earningsCache as any, cacheKey, CACHE_TTL.EARNINGS_STATS)
    if (cached !== undefined) return reply.send(cached)

    const rows = await db.execute<{
      total_earned: string
      pending_payout: string
      completed_jobs: string
      avg_hourly_rate: string
    }>(sql`
      SELECT
        COALESCE(SUM(p.amount - p.platform_fee) FILTER (
          WHERE p.status = 'completed'
            AND p.created_at >= NOW() - INTERVAL '30 days'
        ), 0) AS total_earned,
        COALESCE(SUM(p.amount - p.platform_fee) FILTER (
          WHERE p.status = 'pending'
        ), 0) AS pending_payout,
        COUNT(DISTINCT ja.job_id) FILTER (
          WHERE ja.status = 'completed'
            AND ja.created_at >= NOW() - INTERVAL '30 days'
        ) AS completed_jobs,
        COALESCE(AVG(jp.hourly_rate) FILTER (
          WHERE ja.status = 'completed'
        ), 0) AS avg_hourly_rate
      FROM job_applications ja
      JOIN job_postings jp ON jp.id = ja.job_id
      LEFT JOIN payments p ON p.job_id = ja.job_id
      WHERE ja.worker_id = ${workerId}
    `)

    const row = rows.rows[0]
    const result = {
      total_earned: Number(row?.total_earned ?? 0),
      pending_payout: Number(row?.pending_payout ?? 0),
      completed_jobs: Number(row?.completed_jobs ?? 0),
      avg_hourly_rate: Math.round(Number(row?.avg_hourly_rate ?? 0)),
    }

    await cacheSetL2(earningsCache as any, cacheKey, result, CACHE_TTL.EARNINGS_STATS)
    return reply.send(result)
  })

  // GET /workers/payments — paginated payment history with optional status filter
  app.get("/workers/payments", {
    preHandler: [requireWorker],
    schema: {
      querystring: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "processing", "completed", "failed"] },
          page: { type: "integer", minimum: 1, default: 1 },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const workerId = request.user.id
    const { status, page = 1, limit = 20 } = request.query as {
      status?: string
      page?: number
      limit?: number
    }
    const offset = (Number(page) - 1) * Number(limit)

    // Map 'processing' to 'pending' since schema uses pending/completed/failed/refunded
    const dbStatus = status === "processing" ? "pending" : status

    const rows = await db.execute<{
      id: string
      job_title: string
      employer_name: string
      company_name: string | null
      hours_worked: string
      amount: number
      platform_fee: number
      status: string
      paid_at: string
    }>(sql`
      SELECT
        p.id,
        jp.title AS job_title,
        u.name AS employer_name,
        ep.company_name,
        ROUND(EXTRACT(EPOCH FROM (jp.end_at - jp.start_at)) / 3600.0, 2) AS hours_worked,
        p.amount,
        p.platform_fee,
        p.status,
        p.created_at AS paid_at
      FROM job_applications ja
      JOIN job_postings jp ON jp.id = ja.job_id
      JOIN payments p ON p.job_id = ja.job_id
      JOIN users u ON u.id = jp.employer_id
      LEFT JOIN employer_profiles ep ON ep.user_id = jp.employer_id
      WHERE ja.worker_id = ${workerId}
      ${dbStatus ? sql`AND p.status = ${dbStatus}` : sql``}
      ORDER BY p.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `)

    const countRows = await db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total
      FROM job_applications ja
      JOIN payments p ON p.job_id = ja.job_id
      WHERE ja.worker_id = ${workerId}
      ${dbStatus ? sql`AND p.status = ${dbStatus}` : sql``}
    `)

    const total = Number(countRows.rows[0]?.total ?? 0)

    const payments = rows.rows.map(r => ({
      id: r.id,
      job_title: r.job_title,
      employer_name: r.employer_name,
      company_name: r.company_name ?? null,
      hours_worked: Number(r.hours_worked),
      amount: r.amount,
      net_amount: r.amount - r.platform_fee,
      status: r.status,
      paid_at: r.paid_at,
    }))

    return reply.send({
      payments,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        total_pages: Math.ceil(total / Number(limit)),
      },
    })
  })
}
