import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db, workerProfiles, users } from "../db"
import { authenticate, requireWorker } from "../middleware/auth"
import { dispatchJob } from "../services/matching"
import { sql } from "drizzle-orm"
import { jobPostings } from "../db"
import { workerProfileCache, recommendedJobsCache, CACHE_TTL } from "../services/cache"
import { computeMatchScore } from "../services/scoring"

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

const profileSchema = z.object({
  categories: z.array(z.string()).optional(),
  bio: z.string().max(1000).optional(),
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
}
