/**
 * Admin routes — basic stats and management
 * Protected by a simple admin token header (X-Admin-Token)
 */

import { FastifyInstance } from "fastify"
import { sql } from "drizzle-orm"
import { db } from "../db"
import { processExpiredJobs } from "../services/jobExpiry"
import { getRedisClient } from "../lib/redis"

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

    return reply.send({
      users: users.rows[0],
      jobs: jobs.rows[0],
      applications: applications.rows[0],
      payments: payments.rows[0],
      penalties: penalties.rows[0],
      realtime: {
        availableWorkers: available.rows[0]?.count ?? 0,
      },
    })
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
