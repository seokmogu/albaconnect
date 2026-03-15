import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { db, workerProfiles, users, workerAvailability, workerBlackout, workerCertifications, shiftTemplates } from "../db"
import { authenticate, requireWorker, requireAdmin } from "../middleware/auth"
import { dispatchJob } from "../services/matching"
import { sql } from "drizzle-orm"
import { jobPostings } from "../db"
import { workerProfileCache, recommendedJobsCache, earningsCache, cacheGetL2, cacheSetL2, cacheDelL2, CACHE_TTL } from "../services/cache"
import { computeMatchScore } from "../services/scoring"
import { sendOtp, verifyOtp } from '../services/otpService.js'
import { computeReportCard } from "../services/reportCard"

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

const profileSchema = z.object({
  categories: z.array(z.string()).optional(),
  bio: z.string().max(1000).optional(),
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

  const scheduleUpsertSchema = z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().optional(),
  })

  const scheduleUpdateSchema = z.object({
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().optional(),
  })

  app.post("/workers/schedule", { preHandler: [requireWorker] }, async (request, reply) => {
    const body = scheduleUpsertSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    const workerId = request.user.id
    const { dayOfWeek, startTime, endTime, timezone = 'Asia/Seoul' } = body.data
    const row = await db.execute<{ id: string; day_of_week: number; start_time: string; end_time: string }>(sql`
      INSERT INTO worker_availability (worker_id, day_of_week, start_time, end_time, timezone, valid_from)
      VALUES (${workerId}, ${dayOfWeek}, ${startTime}, ${endTime}, ${timezone}, NOW())
      ON CONFLICT (worker_id, day_of_week) DO UPDATE
        SET start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            timezone = EXCLUDED.timezone,
            valid_from = NOW()
      RETURNING id, day_of_week, start_time, end_time, timezone
    `)
    return reply.status(201).send(row.rows[0])
  })

  app.put("/workers/schedule/:dayOfWeek", { preHandler: [requireWorker] }, async (request, reply) => {
    const { dayOfWeek } = request.params as { dayOfWeek: string }
    const dayNum = parseInt(dayOfWeek, 10)
    if (isNaN(dayNum) || dayNum < 0 || dayNum > 6) return reply.status(400).send({ error: "dayOfWeek must be 0-6" })
    const body = scheduleUpdateSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    const workerId = request.user.id
    const { startTime, endTime, timezone } = body.data
    const updated = await db.execute<{ id: string }>(sql`
      UPDATE worker_availability
      SET start_time = ${startTime}, end_time = ${endTime}
          ${timezone ? sql`, timezone = ${timezone}` : sql``}
      WHERE worker_id = ${workerId} AND day_of_week = ${dayNum}
      RETURNING id
    `)
    if (updated.rows.length === 0) return reply.status(404).send({ error: "Schedule not found for this day" })
    return reply.send({ ok: true, dayOfWeek: dayNum, startTime, endTime })
  })

  app.delete("/workers/schedule/:dayOfWeek", { preHandler: [requireWorker] }, async (request, reply) => {
    const { dayOfWeek } = request.params as { dayOfWeek: string }
    const dayNum = parseInt(dayOfWeek, 10)
    if (isNaN(dayNum) || dayNum < 0 || dayNum > 6) return reply.status(400).send({ error: "dayOfWeek must be 0-6" })
    const workerId = request.user.id
    const result = await db.execute<{ id: string }>(sql`
      DELETE FROM worker_availability WHERE worker_id = ${workerId} AND day_of_week = ${dayNum} RETURNING id
    `)
    if (result.rows.length === 0) return reply.status(404).send({ error: "Schedule not found for this day" })
    return reply.status(204).send()
  })

  app.get("/workers/schedule/:workerId", { preHandler: [authenticate] }, async (request, reply) => {
    const { workerId } = request.params as { workerId: string }
    // Workers can only view their own schedule
    if (request.user.id !== workerId) {
      return reply.status(403).send({ error: "Forbidden" })
    }
    const rows = await db.execute<{ day_of_week: number; start_time: string; end_time: string; timezone: string }>(sql`
      SELECT day_of_week, start_time, end_time, timezone
      FROM worker_availability
      WHERE worker_id = ${workerId}
      ORDER BY day_of_week ASC
    `)
    return reply.send({ schedule: rows.rows })
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
        ST_X(wp.location::geometry) AS lng,
        COALESCE(
          ARRAY(
            SELECT wc.type FROM worker_certifications wc
            WHERE wc.worker_id = u.id
              AND wc.status = 'verified'
              AND (wc.expires_at IS NULL OR wc.expires_at > NOW())
          ),
          ARRAY[]::worker_cert_type[]
        ) AS certification_types
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

    // Compute nearest_open_jobs_count using stored worker location (5km default radius)
    let nearestOpenJobsCount = 0
    if (profile.location) {
      const nearbyCount = await db.execute<{ total: string }>(sql`
        SELECT COUNT(*) AS total
        FROM job_postings
        WHERE status = 'open'
          AND ST_DWithin(
            location::geography,
            ST_SetSRID(ST_MakePoint(
              ${(profile.location as { lng?: number; x?: number }).lng ?? (profile.location as any).x ?? 0},
              ${(profile.location as { lat?: number; y?: number }).lat ?? (profile.location as any).y ?? 0}
            ), 4326)::geography,
            5000
          )
      `)
      nearestOpenJobsCount = Number(nearbyCount.rows[0]?.total ?? 0)
    }

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
      nearestOpenJobsCount,
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

  // POST /workers/verify/phone/send
  app.post('/workers/verify/phone/send', {
    preHandler: [authenticate, requireWorker],
  }, async (request, reply) => {
    const workerId = (request.user as { userId: string; id?: string }).userId ?? request.user.id
    const [user] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, workerId)).limit(1)
    if (!user?.phone) {
      return reply.status(400).send({ error: 'No phone number on account' })
    }
    await sendOtp(workerId, user.phone)
    return reply.send({ message: 'OTP sent' })
  })

  // POST /workers/verify/phone/confirm
  app.post('/workers/verify/phone/confirm', {
    preHandler: [authenticate, requireWorker],
  }, async (request, reply) => {
    const codeSchema = z.object({ code: z.string().length(6).regex(/^\d{6}$/) })
    const parsed = codeSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid OTP format' })

    const workerId = (request.user as { userId: string; id?: string }).userId ?? request.user.id

    let result: Awaited<ReturnType<typeof verifyOtp>>
    try {
      result = await verifyOtp(workerId, parsed.data.code)
    } catch (err) {
      // verifyOtp throws when Redis is unavailable — surface as 503, not 500
      request.log.error({ err }, "OTP verification unavailable — Redis unreachable")
      return reply.status(503).send({
        error: "Verification service temporarily unavailable",
        code: "VERIFICATION_SERVICE_UNAVAILABLE",
      })
    }

    if (result === 'locked') return reply.status(429).send({ error: 'Too many attempts', code: 'MAX_ATTEMPTS_EXCEEDED' })
    if (result === 'expired') return reply.status(410).send({ error: 'OTP expired or not found', code: 'OTP_EXPIRED' })
    if (result === 'wrong') return reply.status(400).send({ error: 'Invalid OTP', code: 'INVALID_OTP' })

    await db.update(workerProfiles).set({ isPhoneVerified: true }).where(eq(workerProfiles.userId, workerId))
    workerProfileCache.delete(workerId)
    return reply.send({ verified: true })
  })

  app.get("/workers/me/earnings/summary", { preHandler: [requireWorker] }, async (request, reply) => {
    const monthSchema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() })
    const parsed = monthSchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
    }

    const workerId = request.user.id
    const targetMonth = parsed.data.month ?? new Date().toISOString().slice(0, 7)
    const cacheKey = `earnings:summary:${workerId}:${targetMonth}`

    const cached = await cacheGetL2(earningsCache as any, cacheKey, CACHE_TTL.EARNINGS_SUMMARY)
    if (cached !== undefined) return reply.send(cached)

    const [year, month] = targetMonth.split('-').map(Number)
    const monthDate = `${year}-${String(month).padStart(2, '0')}-01`
    const prev = new Date(Date.UTC(year, month - 2, 1))
    const prevMonthDate = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-01`

    const [currentRows, prevRows] = await Promise.all([
      db.execute<{ total_jobs: string; total_hours: string; total_pay: string; avg_hourly_rate: string; by_job: any[] }>(sql`
        SELECT COUNT(DISTINCT ja.id)::int as total_jobs,
          COALESCE(SUM(jp.duration_hours),0)::float as total_hours,
          COALESCE(SUM(p.amount - p.platform_fee),0)::int as total_pay,
          COALESCE(ROUND(AVG(jp.hourly_rate)),0)::int as avg_hourly_rate,
          COALESCE(json_agg(json_build_object('jobId',jp.id,'title',jp.title,'hours',jp.duration_hours,'pay',p.amount-p.platform_fee,'completedAt',ja.responded_at)) FILTER (WHERE ja.id IS NOT NULL), '[]') as by_job
        FROM job_applications ja
        JOIN job_postings jp ON jp.id=ja.job_id
        LEFT JOIN payments p ON p.job_id=ja.job_id AND p.payer_id!=ja.worker_id AND p.payment_type='payout'
        WHERE ja.worker_id=${workerId} AND ja.status='completed' AND DATE_TRUNC('month',jp.start_at AT TIME ZONE 'Asia/Seoul')=${monthDate}::date
      `),
      db.execute<{ total_jobs: string; total_hours: string; total_pay: string; avg_hourly_rate: string; by_job: any[] }>(sql`
        SELECT COUNT(DISTINCT ja.id)::int as total_jobs,
          COALESCE(SUM(jp.duration_hours),0)::float as total_hours,
          COALESCE(SUM(p.amount - p.platform_fee),0)::int as total_pay,
          COALESCE(ROUND(AVG(jp.hourly_rate)),0)::int as avg_hourly_rate,
          COALESCE(json_agg(json_build_object('jobId',jp.id,'title',jp.title,'hours',jp.duration_hours,'pay',p.amount-p.platform_fee,'completedAt',ja.responded_at)) FILTER (WHERE ja.id IS NOT NULL), '[]') as by_job
        FROM job_applications ja
        JOIN job_postings jp ON jp.id=ja.job_id
        LEFT JOIN payments p ON p.job_id=ja.job_id AND p.payer_id!=ja.worker_id AND p.payment_type='payout'
        WHERE ja.worker_id=${workerId} AND ja.status='completed' AND DATE_TRUNC('month',jp.start_at AT TIME ZONE 'Asia/Seoul')=${prevMonthDate}::date
      `),
    ])

    const current = currentRows.rows[0] ?? { total_jobs: '0', total_hours: '0', total_pay: '0', avg_hourly_rate: '0', by_job: [] }
    const previous = prevRows.rows[0] ?? { total_jobs: '0', total_hours: '0', total_pay: '0' }
    const currPay = Number(current.total_pay ?? 0)
    const prevPay = Number(previous.total_pay ?? 0)
    const currJobs = Number(current.total_jobs ?? 0)
    const prevJobs = Number(previous.total_jobs ?? 0)

    const result = {
      month: targetMonth,
      total_jobs: currJobs,
      total_hours: Number(current.total_hours ?? 0),
      total_pay: currPay,
      avg_hourly_rate: Number(current.avg_hourly_rate ?? 0),
      by_job: current.by_job ?? [],
      vs_previous_month: {
        total_pay_delta_pct: prevPay === 0 ? 0 : Math.round(((currPay - prevPay) / prevPay) * 100),
        total_jobs_delta: currJobs - prevJobs,
      },
    }

    await cacheSetL2(earningsCache as any, cacheKey, result, CACHE_TTL.EARNINGS_SUMMARY)
    return reply.send(result)
  })

  app.get("/workers/me/earnings/history", { preHandler: [requireWorker] }, async (request, reply) => {
    const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(24).default(12) })
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
    }

    const workerId = request.user.id
    const limit = parsed.data.limit
    const cacheKey = `earnings:history:${workerId}:${limit}`

    const cached = await cacheGetL2(earningsCache as any, cacheKey, CACHE_TTL.EARNINGS_SUMMARY)
    if (cached !== undefined) return reply.send(cached)

    const rows = await db.execute<{ month: string; total_jobs: string; total_hours: string; total_pay: string }>(sql`
      SELECT TO_CHAR(DATE_TRUNC('month',jp.start_at AT TIME ZONE 'Asia/Seoul'),'YYYY-MM') as month,
        COUNT(DISTINCT ja.id)::int as total_jobs,
        COALESCE(SUM(jp.duration_hours),0)::float as total_hours,
        COALESCE(SUM(p.amount-p.platform_fee),0)::int as total_pay
      FROM job_applications ja
      JOIN job_postings jp ON jp.id=ja.job_id
      LEFT JOIN payments p ON p.job_id=ja.job_id AND p.payer_id!=ja.worker_id AND p.payment_type='payout'
      WHERE ja.worker_id=${workerId} AND ja.status='completed'
      GROUP BY DATE_TRUNC('month',jp.start_at AT TIME ZONE 'Asia/Seoul')
      ORDER BY DATE_TRUNC('month',jp.start_at AT TIME ZONE 'Asia/Seoul') DESC
      LIMIT ${Math.min(limit,24)}
    `)

    const result = { history: rows.rows }
    await cacheSetL2(earningsCache as any, cacheKey, result, CACHE_TTL.EARNINGS_SUMMARY)
    return reply.send(result)
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

  // ── Worker Certifications ─────────────────────────────────────────────────

  const certSubmitSchema = z.object({
    type: z.enum(["ID_VERIFIED", "DRIVER_LICENSE", "FOOD_HANDLER", "FORKLIFT", "FIRST_AID"]),
    evidence_url: z.string().url().optional(),
  })

  const adminCertUpdateSchema = z.object({
    status: z.enum(["verified", "rejected", "expired"]),
    expires_at: z.string().datetime().optional(),
  })

  // POST /api/workers/certifications — worker submits a certification claim
  app.post("/workers/certifications", { preHandler: [requireWorker] }, async (request, reply) => {
    const body = certSubmitSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }
    const { type, evidence_url } = body.data
    const workerId = request.user.id

    const [cert] = await db
      .insert(workerCertifications)
      .values({ workerId, type, evidenceUrl: evidence_url ?? null, status: "pending" })
      .returning()

    return reply.status(201).send({ certification: cert })
  })

  // GET /api/workers/:id/certifications — list certifications for a worker
  // Public: only verified and non-expired; Admin (x-admin-key): all statuses
  app.get("/workers/:id/certifications", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const isAdmin = Boolean(
      process.env["ADMIN_KEY"] && request.headers["x-admin-key"] === process.env["ADMIN_KEY"],
    )

    let certs: typeof workerCertifications.$inferSelect[]
    if (isAdmin) {
      certs = await db
        .select()
        .from(workerCertifications)
        .where(eq(workerCertifications.workerId, id))
    } else {
      // Public: verified and not expired
      certs = await db.execute<typeof workerCertifications.$inferSelect>(sql`
        SELECT * FROM worker_certifications
        WHERE worker_id = ${id}
          AND status = 'verified'
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
      `).then(r => r.rows)
    }

    return reply.send({ certifications: certs })
  })

  // PATCH /api/workers/certifications/:id — admin verifies / rejects / expires
  app.patch("/workers/certifications/:id", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = adminCertUpdateSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }
    const { status, expires_at } = body.data
    const adminId = request.user.id

    const updateValues: Partial<typeof workerCertifications.$inferInsert> = {
      status,
      verifiedBy: status === "verified" ? adminId : undefined,
      verifiedAt: status === "verified" ? new Date() : undefined,
      expiresAt: expires_at ? new Date(expires_at) : undefined,
    }

    const [updated] = await db
      .update(workerCertifications)
      .set(updateValues)
      .where(eq(workerCertifications.id, id))
      .returning()

    if (!updated) {
      return reply.status(404).send({ error: "Certification not found" })
    }

    return reply.send({ certification: updated })
  })

  // ── FCM Token registration ─────────────────────────────────────────────────

  // POST /workers/me/fcm-token — register or update FCM device token
  app.post("/workers/me/fcm-token", { preHandler: [requireWorker] }, async (request, reply) => {
    const { token } = request.body as { token?: string }
    if (!token || typeof token !== 'string' || token.length > 255) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid FCM token" } })
    }
    const workerId = (request as any).userId
    const [updated] = await db
      .update(workerProfiles)
      .set({ fcmToken: token } as any)
      .where(eq(workerProfiles.userId, workerId))
      .returning({ userId: workerProfiles.userId })
    if (!updated) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Worker profile not found" } })
    return reply.status(200).send({ message: "FCM token registered" })
  })

  // DELETE /workers/me/fcm-token — unregister FCM token (e.g. logout)
  app.delete("/workers/me/fcm-token", { preHandler: [requireWorker] }, async (request, reply) => {
    const workerId = (request as any).userId
    await db
      .update(workerProfiles)
      .set({ fcmToken: null } as any)
      .where(eq(workerProfiles.userId, workerId))
    return reply.status(204).send()
  })

  // ─── Shift Templates ────────────────────────────────────────────────────────

  const shiftTemplateBody = z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    repeatUntil: z.string().date().optional(),
  })

  // POST /workers/me/shifts — create a new shift template
  app.post("/workers/me/shifts", { preHandler: [requireWorker] }, async (request, reply) => {
    const workerId = (request as any).userId
    const parsed = shiftTemplateBody.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } })

    const { dayOfWeek, startTime, endTime, repeatUntil } = parsed.data
    const [created] = await db
      .insert(shiftTemplates)
      .values({ workerId, dayOfWeek, startTime, endTime, repeatUntil: repeatUntil ?? null })
      .returning()

    return reply.status(201).send(created)
  })

  // GET /workers/me/shifts — list own active shift templates
  app.get("/workers/me/shifts", { preHandler: [requireWorker] }, async (request, reply) => {
    const workerId = (request as any).userId
    const rows = await db.execute<{
      id: string; worker_id: string; day_of_week: number; start_time: string;
      end_time: string; repeat_until: string | null; created_at: string
    }>(sql`
      SELECT id, worker_id, day_of_week, start_time, end_time, repeat_until, created_at
      FROM shift_templates
      WHERE worker_id = ${workerId}
        AND (repeat_until IS NULL OR repeat_until >= CURRENT_DATE)
      ORDER BY day_of_week, start_time
    `)
    return reply.send(rows.rows)
  })

  // DELETE /workers/me/shifts/:id — remove a shift template
  app.delete("/workers/me/shifts/:id", { preHandler: [requireWorker] }, async (request, reply) => {
    const workerId = (request as any).userId
    const { id } = request.params as { id: string }
    const result = await db.execute<{ count: string }>(sql`
      DELETE FROM shift_templates
      WHERE id = ${id} AND worker_id = ${workerId}
      RETURNING id
    `)
    if (!result.rows.length) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Shift template not found or not yours" } })
    return reply.status(204).send()
  })

  // ── GET /workers/me/report-card ─────────────────────────────────────────────
  app.get(
    "/workers/me/report-card",
    { preHandler: [requireWorker] },
    async (request, reply) => {
      const { month: rawMonth } = request.query as { month?: string }
      let month: string
      if (rawMonth) {
        if (!/^\d{4}-\d{2}$/.test(rawMonth)) {
          return reply.status(400).send({ error: "Invalid month format. Use YYYY-MM." })
        }
        month = rawMonth
      } else {
        const prev = new Date()
        prev.setMonth(prev.getMonth() - 1)
        month = prev.toISOString().slice(0, 7)
      }
      const workerId = (request as any).user?.id ?? (request as any).userId
      const data = await computeReportCard(workerId, month)
      return reply.send(data)
    }
  )

  // ── GET /workers/me/report-card/pdf ────────────────────────────────────────
  app.get(
    "/workers/me/report-card/pdf",
    { preHandler: [requireWorker] },
    async (request, reply) => {
      const { month: rawMonth } = request.query as { month?: string }
      let month: string
      if (rawMonth) {
        if (!/^\d{4}-\d{2}$/.test(rawMonth)) {
          return reply.status(400).send({ error: "Invalid month format. Use YYYY-MM." })
        }
        month = rawMonth
      } else {
        const prev = new Date()
        prev.setMonth(prev.getMonth() - 1)
        month = prev.toISOString().slice(0, 7)
      }

      const workerId = (request as any).user?.id ?? (request as any).userId

      // Fetch user name
      const userResult = await db.execute<{ name: string | null }>(sql`
        SELECT name FROM users WHERE id = ${workerId}::uuid LIMIT 1
      `)
      const workerName = userResult.rows[0]?.name ?? "Worker"

      // Fetch ALL data before streaming — prevents corrupted PDF on DB error
      const reportData = await computeReportCard(workerId, month)

      // Fetch top 10 completed jobs
      const jobsResult = await db.execute<{
        title: string
        category: string
        total_amount: number
        start_at: string
      }>(sql`
        SELECT jp.title, jp.category, jp.total_amount, jp.start_at
        FROM job_applications ja
        JOIN job_postings jp ON jp.id = ja.job_id
        WHERE ja.worker_id = ${workerId}::uuid
          AND ja.status = 'completed'
        ORDER BY jp.start_at DESC
        LIMIT 10
      `)

      // Build PDF into a buffer (collect then send) — all DB work done above
      const PDFDocument = (await import("pdfkit")).default
      const doc = new PDFDocument({ size: "A4", margin: 50 })

      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        doc.on("data", (chunk: Buffer) => chunks.push(chunk))
        doc.on("end", () => resolve(Buffer.concat(chunks)))
        doc.on("error", reject)

        // Header
        doc.fontSize(24).font("Helvetica-Bold").text("AlbaConnect", 50, 50)
        doc.fontSize(14).font("Helvetica").text("Worker Performance Report", 50, 82)
        doc.fontSize(12).text(`Worker: ${workerName}`, 50, 102)
        doc.fontSize(12).text(`Period: ${month}`, 50, 118)
        doc.moveDown(2)

        // KPI section
        doc.fontSize(16).font("Helvetica-Bold").text("Performance Summary", { underline: true })
        doc.moveDown(0.5)
        doc.fontSize(11).font("Helvetica")
        doc.text(`Jobs Completed:       ${reportData.total_jobs_completed}`)
        doc.text(`Total Earnings:       ₩${reportData.total_earnings_won.toLocaleString("ko-KR")}`)
        doc.text(`Average Rating:       ${reportData.avg_rating.toFixed(2)} / 5.0`)
        doc.text(`On-Time Rate:         ${reportData.on_time_rate_pct.toFixed(1)}%`)
        doc.text(`No-Shows:             ${reportData.noshow_count}`)
        doc.text(`Verified Certs:       ${reportData.certifications_verified_count}`)
        doc.moveDown(1)

        // Top categories
        if (reportData.top_job_categories.length > 0) {
          doc.fontSize(14).font("Helvetica-Bold").text("Top Job Categories")
          doc.moveDown(0.5)
          doc.fontSize(11).font("Helvetica")
          reportData.top_job_categories.forEach((cat, i) => {
            doc.text(`${i + 1}. ${cat.category} (${cat.count} jobs)`)
          })
          doc.moveDown(1)
        }

        // Job history
        if (jobsResult.rows.length > 0) {
          doc.fontSize(14).font("Helvetica-Bold").text("Recent Completed Jobs (up to 10)")
          doc.moveDown(0.5)
          doc.fontSize(9).font("Helvetica")
          jobsResult.rows.forEach((job, i) => {
            const dateStr = new Date(job.start_at).toLocaleDateString("ko-KR")
            doc.text(
              `${i + 1}. ${job.title} | ${job.category} | ₩${Number(job.total_amount).toLocaleString("ko-KR")} | ${dateStr}`
            )
          })
          doc.moveDown(1)
        }

        // Footer
        doc.fontSize(9).font("Helvetica").text(`Generated: ${new Date().toISOString()}`, { align: "center" })

        doc.end()
      })

      return reply
        .type("application/pdf")
        .header("Content-Disposition", `attachment; filename=report-${workerId}-${month}.pdf`)
        .send(pdfBuffer)
    }
  )
}
