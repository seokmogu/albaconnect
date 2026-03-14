/**
 * Admin routes — basic stats and management
 * Protected by a simple admin token header (X-Admin-Token)
 */

import { FastifyInstance } from "fastify"
import { eq } from "drizzle-orm"
import { sql } from "drizzle-orm"
import { db, employerProfiles, workerProfiles } from "../db"
import { processExpiredJobs } from "../services/jobExpiry"
import { getRedisClient } from "../lib/redis"
import { z } from "zod"

function requireAdmin(adminToken: string) {
  return async (request: any, reply: any) => {
    const token = request.headers["x-admin-token"]
    if (!token || token !== adminToken) {
      return reply.status(401).send({ error: "Admin access required" })
    }
  }
}

export async function adminRoutes(app: FastifyInstance) {
  const adminToken = process.env.ADMIN_TOKEN ?? "dev-admin-token"
  const preHandler = [requireAdmin(adminToken)]

  // GET /admin/stats — platform overview
  app.get("/admin/stats", { preHandler }, async (_request, reply) => {
    const redis = getRedisClient()
    if (redis) {
      const cached = await redis.get('admin:stats:v1')
      if (cached) {
        return reply.send(JSON.parse(cached))
      }
    }

    const users = await db.execute<any>(sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN role = 'employer' THEN 1 END) as employers,
        COUNT(CASE WHEN role = 'worker' THEN 1 END) as workers
      FROM users
    `)

    const jobs = await db.execute<any>(sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
        COUNT(CASE WHEN status = 'matched' THEN 1 END) as matched,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
        COALESCE(SUM(total_amount), 0) as total_wages_posted
      FROM job_postings
    `)

    const applications = await db.execute<any>(sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'noshow' THEN 1 END) as noshows,
        COUNT(CASE WHEN status = 'timeout' THEN 1 END) as timeouts
      FROM job_applications
    `)

    const payments = await db.execute<any>(sql`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(amount), 0) as total_volume,
        COALESCE(SUM(platform_fee), 0) as platform_revenue
      FROM payments
      WHERE status = 'completed'
    `)

    const penalties = await db.execute<any>(sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN type = 'worker_noshow' THEN 1 END) as worker_noshows,
        COUNT(CASE WHEN type LIKE 'employer%' THEN 1 END) as employer_violations,
        COALESCE(SUM(amount), 0) as total_penalty_amount
      FROM penalties
    `)

    const available = await db.execute<any>(sql`
      SELECT COUNT(*) as count FROM worker_profiles WHERE is_available = TRUE
    `)

    const jobsToday = await db.execute<any>(sql`SELECT COUNT(*) as count FROM job_postings WHERE created_at >= now() - interval '1 day'`)
    const matchesToday = await db.execute<any>(sql`SELECT COUNT(*) as count FROM job_applications WHERE status='accepted' AND created_at >= now() - interval '1 day'`)
    const openDisputesCount = await db.execute<any>(sql`SELECT COUNT(*) as count FROM job_disputes WHERE status='open'`)
    const noshowRate7d = await db.execute<any>(sql`SELECT COUNT(CASE WHEN status='noshow' THEN 1 END)::float / NULLIF(COUNT(CASE WHEN status IN ('accepted','completed','noshow') THEN 1 END), 0) as rate FROM job_applications WHERE created_at >= now() - interval '7 days'`)
    const avgFillTimeHours = await db.execute<any>(sql`SELECT AVG(EXTRACT(EPOCH FROM (ja.created_at - jp.created_at))/3600) as avg_hours FROM job_applications ja JOIN job_postings jp ON jp.id=ja.job_id WHERE ja.status='accepted' AND ja.created_at >= now() - interval '30 days'`)

    const result = {
      users: users.rows[0],
      jobs: jobs.rows[0],
      applications: applications.rows[0],
      payments: payments.rows[0],
      penalties: penalties.rows[0],
      realtime: {
        availableWorkers: available.rows[0]?.count ?? 0,
      },
      extended: {
        jobs_today: Number(jobsToday.rows[0]?.count ?? 0),
        matches_today: Number(matchesToday.rows[0]?.count ?? 0),
        open_disputes_count: Number(openDisputesCount.rows[0]?.count ?? 0),
        noshow_rate_7d: Number(noshowRate7d.rows[0]?.rate ?? 0),
        avg_fill_time_hours: Number(avgFillTimeHours.rows[0]?.avg_hours ?? 0),
      },
    }

    if (redis) {
      await redis.setex('admin:stats:v1', 60, JSON.stringify(result))
    }

    return reply.send(result)
  })

  // GET /admin/users — paginated user list
  app.get("/admin/users", { preHandler }, async (request, reply) => {
    const { page = 1, limit = 20, role } = request.query as { page?: number; limit?: number; role?: string }
    const offset = (Number(page) - 1) * Number(limit)

    const rows = await db.execute<any>(sql`
      SELECT 
        u.id, u.email, u.name, u.phone, u.role, u.created_at,
        CASE
          WHEN u.role = 'employer' THEN ep.company_name
          ELSE NULL
        END as company_name,
        CASE
          WHEN u.role = 'worker' THEN wp.is_available
          ELSE NULL
        END as is_available,
        CASE
          WHEN u.role = 'worker' THEN wp.rating_avg
          ELSE ep.rating_avg
        END as rating_avg
      FROM users u
      LEFT JOIN employer_profiles ep ON ep.user_id = u.id
      LEFT JOIN worker_profiles wp ON wp.user_id = u.id
      ${role ? sql`WHERE u.role = ${role}` : sql``}
      ORDER BY u.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `)

    return reply.send({ users: rows.rows, page: Number(page), limit: Number(limit) })
  })

  // GET /admin/penalties — penalty log
  app.get("/admin/penalties", { preHandler }, async (request, reply) => {
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number }
    const offset = (Number(page) - 1) * Number(limit)

    const rows = await db.execute<any>(sql`
      SELECT
        p.*,
        fu.name as from_user_name, fu.role as from_role,
        tu.name as to_user_name, tu.role as to_role,
        jp.title as job_title
      FROM penalties p
      JOIN users fu ON fu.id = p.from_user_id
      JOIN users tu ON tu.id = p.to_user_id
      JOIN job_postings jp ON jp.id = p.job_id
      ORDER BY p.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `)

    return reply.send({ penalties: rows.rows })
  })

  app.get("/admin/disputes", { preHandler }, async (request, reply) => {
    const { page = 1, limit = 20, type, status } = request.query as {
      page?: number
      limit?: number
      type?: string
      status?: string
    }
    const offset = (Number(page) - 1) * Number(limit)

    const rows = await db.execute<any>(sql`
      SELECT jd.*, jp.title as job_title, jp.id as job_id_ref
      FROM job_disputes jd
      JOIN job_postings jp ON jp.id = jd.job_id
      WHERE 1=1
      ${type ? sql`AND jd.type=${type}` : sql``}
      ${status ? sql`AND jd.status=${status}` : sql``}
      ORDER BY jd.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `)

    return reply.send({ disputes: rows.rows, page: Number(page), limit: Number(limit) })
  })

  const patchDisputeSchema = z.object({
    status: z.enum(['resolved', 'dismissed']),
    resolution_notes: z.string().min(1).max(2000),
  })

  app.patch("/admin/disputes/:id", { preHandler }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = patchDisputeSchema.parse(request.body)
    const redis = getRedisClient()

    const updated = await db.transaction(async (tx: any) => {
      const disputeRows = await tx.execute(sql`SELECT * FROM job_disputes WHERE id=${id} FOR UPDATE`)
      const dispute = disputeRows.rows[0]
      if (!dispute) return null

      await tx.execute(sql`UPDATE job_disputes SET status=${body.status}, resolution_notes=${body.resolution_notes}, resolved_at=now() WHERE id=${id}`)

      if (dispute.type === 'NOSHOW_DISPUTE') {
        const remaining = await tx.execute(sql`SELECT COUNT(*) as count FROM job_disputes WHERE job_id=${dispute.job_id} AND type='NOSHOW_DISPUTE' AND status='open' AND id!=${id}`)
        if (Number(remaining.rows[0]?.count ?? 0) === 0) {
          await tx.execute(sql`UPDATE job_postings SET dispute_hold=false WHERE id=${dispute.job_id}`)
        }
      }

      return { ...dispute, status: body.status, resolution_notes: body.resolution_notes }
    })

    if (!updated) {
      return reply.status(404).send({ error: 'Dispute not found' })
    }

    if (redis) {
      await redis.del('admin:stats:v1')
    }

    return reply.send({ dispute: updated })
  })

  const patchActorSchema = z.object({
    action: z.enum(['suspend', 'activate']),
  })

  app.patch("/admin/workers/:id", { preHandler }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = patchActorSchema.parse(request.body)
    await db.update(workerProfiles).set({
      isSuspended: body.action === 'suspend',
      ...(body.action === 'suspend' ? { isAvailable: false } : {}),
    }).where(eq(workerProfiles.userId, id))

    return reply.send({
      workerId: id,
      isSuspended: body.action === 'suspend',
      message: body.action === 'suspend' ? 'Worker suspended' : 'Worker activated',
    })
  })

  app.patch("/admin/employers/:id", { preHandler }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = patchActorSchema.parse(request.body)
    await db.update(employerProfiles).set({
      isSuspended: body.action === 'suspend',
    }).where(eq(employerProfiles.userId, id))

    return reply.send({
      employerId: id,
      isSuspended: body.action === 'suspend',
    })
  })

  // GET /admin/health
  app.get("/admin/health", { preHandler }, async (_request, reply) => {
    try {
      await db.execute(sql`SELECT 1`)
      return reply.send({ status: "ok", db: "connected", uptime: process.uptime() })
    } catch {
      return reply.status(503).send({ status: "error", db: "disconnected" })
    }
  })

  // POST /admin/expire-stale — manual trigger for job expiry
  app.post("/admin/expire-stale", { preHandler }, async (_request, reply) => {
    // Prevent concurrent manual triggers via Redis advisory lock
    const redis = getRedisClient()
    if (redis) {
      const acquired = await redis.set("admin:expire-stale:lock", "1", "EX", 10, "NX")
      if (!acquired) {
        return reply.status(429).send({
          error: { code: "LOCKED", message: "Expiry already running — retry in 10s" },
        })
      }
    }

    const result = await processExpiredJobs() // no emitFn — admin manual trigger
    return reply.send({
      expired: result.expiredCount,
      noshows: result.noshowCount,
      triggeredAt: new Date().toISOString(),
    })
  })
}
