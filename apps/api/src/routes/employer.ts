import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db, users, employerProfiles, jobPostings, jobApplications } from "../db"
import { authenticate, requireEmployer } from "../middleware/auth"
import { sql } from "drizzle-orm"
import { getRedisClient } from "../lib/redis"

const profileSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  businessNumber: z.string().max(20).optional(),
})

export async function employerRoutes(app: FastifyInstance) {
  // GET /employers/profile
  app.get("/employers/profile", { preHandler: [requireEmployer] }, async (request, reply) => {
    const userId = request.user.id
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    const [profile] = await db.select().from(employerProfiles).where(eq(employerProfiles.userId, userId)).limit(1)

    if (!user || !profile) return reply.status(404).send({ error: "Profile not found" })

    // Get job stats
    const stats = await db.execute<{ total: string; open: string; completed: string }>(sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status IN ('open', 'matched') THEN 1 END) as open,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed
      FROM job_postings
      WHERE employer_id = ${userId}
    `)

    return reply.send({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      companyName: profile.companyName,
      businessNumber: profile.businessNumber,
      ratingAvg: profile.ratingAvg,
      ratingCount: profile.ratingCount,
      stats: stats.rows[0],
    })
  })

  // PUT /employers/profile
  app.put("/employers/profile", { preHandler: [requireEmployer] }, async (request, reply) => {
    const body = profileSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: "Validation failed" })

    const userId = request.user.id
    const updateData: Record<string, unknown> = { updatedAt: new Date() }
    if (body.data.companyName) updateData.companyName = body.data.companyName
    if (body.data.businessNumber !== undefined) updateData.businessNumber = body.data.businessNumber

    await db.update(employerProfiles).set(updateData).where(eq(employerProfiles.userId, userId))
    return reply.send({ message: "Profile updated" })
  })

  // GET /employers/stats - dashboard stats
  app.get("/employers/stats", { preHandler: [requireEmployer] }, async (request, reply) => {
    const userId = request.user.id

    const stats = await db.execute<any>(sql`
      SELECT
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN jp.status IN ('open', 'matched') THEN 1 END) as active_jobs,
        COUNT(CASE WHEN jp.status = 'completed' THEN 1 END) as completed_jobs,
        COALESCE(SUM(CASE WHEN jp.status = 'completed' THEN jp.total_amount END), 0) as total_spent,
        COUNT(DISTINCT CASE WHEN ja.status = 'accepted' THEN ja.worker_id END) as total_workers_hired
      FROM job_postings jp
      LEFT JOIN job_applications ja ON ja.job_id = jp.id
      WHERE jp.employer_id = ${userId}
    `)

    return reply.send({ stats: stats.rows[0] })
  })

  // GET /employers/analytics — aggregate metrics for the authenticated employer
  // Query params: range = 7d | 14d | 30d | 90d (default: 30d)
  app.get("/employers/analytics", { preHandler: [requireEmployer] }, async (request, reply) => {
    const userId = request.user.id
    const query = request.query as Record<string, string>
    const rangeParam = query.range ?? "30d"

    const rangeDays = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 }[rangeParam]
    if (!rangeDays) {
      return reply.status(400).send({ error: "Invalid range. Use: 7d, 14d, 30d, 90d" })
    }

    // Cache key includes employer + range
    const cacheKey = `employer:analytics:${userId}:${rangeParam}`
    const redis = getRedisClient()
    if (redis) {
      const cached = await redis.get(cacheKey)
      if (cached) return reply.send(JSON.parse(cached))
    }

    // 1. Overall aggregate metrics
    const aggregate = await db.execute<{
      total_jobs: string
      filled_jobs: string
      total_applications: string
      accepted_applications: string
      noshow_applications: string
    }>(sql`
      SELECT
        COUNT(DISTINCT jp.id) AS total_jobs,
        COUNT(DISTINCT CASE WHEN jp.status IN ('matched','in_progress','completed') THEN jp.id END) AS filled_jobs,
        COUNT(ja.id) AS total_applications,
        COUNT(CASE WHEN ja.status = 'accepted' THEN 1 END) AS accepted_applications,
        COUNT(CASE WHEN ja.status = 'noshow'   THEN 1 END) AS noshow_applications
      FROM job_postings jp
      LEFT JOIN job_applications ja ON ja.job_id = jp.id
      WHERE jp.employer_id = ${userId}
        AND jp.created_at >= NOW() - INTERVAL '1 day' * ${rangeDays}
    `)
    const agg = aggregate.rows[0] ?? {
      total_jobs: "0", filled_jobs: "0", total_applications: "0",
      accepted_applications: "0", noshow_applications: "0",
    }

    const totalJobs = Number(agg.total_jobs)
    const filledJobs = Number(agg.filled_jobs)
    const acceptedApps = Number(agg.accepted_applications)
    const noshowApps = Number(agg.noshow_applications)

    const fillRate = totalJobs > 0 ? Math.round((filledJobs / totalJobs) * 1000) / 10 : 0
    const noshowRate = acceptedApps > 0 ? Math.round((noshowApps / acceptedApps) * 1000) / 10 : 0

    // 2. Avg time-to-match (minutes from job created_at → first accepted application)
    const timeToMatch = await db.execute<{ avg_minutes: string }>(sql`
      SELECT
        AVG(EXTRACT(EPOCH FROM (ja.created_at - jp.created_at)) / 60)::numeric(10,1) AS avg_minutes
      FROM job_postings jp
      JOIN job_applications ja ON ja.job_id = jp.id AND ja.status = 'accepted'
      WHERE jp.employer_id = ${userId}
        AND jp.created_at >= NOW() - INTERVAL '1 day' * ${rangeDays}
        AND ja.created_at = (
          SELECT MIN(ja2.created_at) FROM job_applications ja2
          WHERE ja2.job_id = jp.id AND ja2.status = 'accepted'
        )
    `)
    const avgTimeToMatchMinutes = Number(timeToMatch.rows[0]?.avg_minutes ?? 0)

    // 3. Jobs-by-status breakdown
    const byStatus = await db.execute<{ status: string; count: string }>(sql`
      SELECT status, COUNT(*) AS count
      FROM job_postings
      WHERE employer_id = ${userId}
        AND created_at >= NOW() - INTERVAL '1 day' * ${rangeDays}
      GROUP BY status
    `)
    const jobsByStatus: Record<string, number> = {}
    for (const row of byStatus.rows) jobsByStatus[row.status] = Number(row.count)

    // 4. Daily jobs posted
    const daily = await db.execute<{ date: string; count: string }>(sql`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS count
      FROM job_postings
      WHERE employer_id = ${userId}
        AND created_at >= NOW() - INTERVAL '1 day' * ${rangeDays}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `)
    const dailyJobsPosted = daily.rows.map(r => ({ date: r.date, count: Number(r.count) }))

    const result = {
      range: rangeParam,
      fill_rate_pct: fillRate,
      avg_time_to_match_minutes: avgTimeToMatchMinutes,
      noshow_rate_pct: noshowRate,
      total_jobs: totalJobs,
      filled_jobs: filledJobs,
      jobs_by_status: jobsByStatus,
      daily_jobs_posted: dailyJobsPosted,
    }

    // Cache for 5 minutes
    if (redis) await redis.set(cacheKey, JSON.stringify(result), "EX", 300)

    return reply.send(result)
  })

  // GET /employers/analytics/jobs/:jobId — per-job analytics
  app.get("/employers/analytics/jobs/:jobId", { preHandler: [requireEmployer] }, async (request, reply) => {
    const userId = request.user.id
    const { jobId } = request.params as { jobId: string }

    // Verify ownership
    const job = await db.execute<{ id: string; status: string; created_at: string }>(sql`
      SELECT id, status, created_at FROM job_postings
      WHERE id = ${jobId} AND employer_id = ${userId}
      LIMIT 1
    `)
    if (!job.rows.length) {
      return reply.status(404).send({ error: "Job not found or access denied" })
    }

    const stats = await db.execute<{
      applicant_count: string
      accepted_count: string
      noshow_count: string
      avg_minutes_to_first_accept: string
    }>(sql`
      SELECT
        COUNT(*) AS applicant_count,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) AS accepted_count,
        COUNT(CASE WHEN status = 'noshow'   THEN 1 END) AS noshow_count,
        AVG(CASE WHEN status = 'accepted'
          THEN EXTRACT(EPOCH FROM (ja.created_at - jp.created_at)) / 60
        END)::numeric(10,1) AS avg_minutes_to_first_accept
      FROM job_applications ja
      JOIN job_postings jp ON jp.id = ja.job_id
      WHERE ja.job_id = ${jobId}
    `)

    const row = stats.rows[0] ?? {}
    return reply.send({
      jobId,
      status: job.rows[0].status,
      applicant_count: Number(row.applicant_count ?? 0),
      accepted_count: Number(row.accepted_count ?? 0),
      noshow_count: Number(row.noshow_count ?? 0),
      avg_minutes_to_first_accept: Number(row.avg_minutes_to_first_accept ?? 0),
    })
  })
}
