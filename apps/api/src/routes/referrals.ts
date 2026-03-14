import { FastifyInstance } from "fastify"
import { eq, and, sql } from "drizzle-orm"
import { db, workerProfiles, referrals, users } from "../db"
import { requireWorker } from "../middleware/auth"

export async function referralRoutes(app: FastifyInstance) {
  /**
   * POST /workers/referrals/invite
   * Returns the worker's personal invite URL and invite code.
   */
  app.post(
    "/workers/referrals/invite",
    { preHandler: [requireWorker] },
    async (request, reply) => {
      const workerId = request.user.id

      const [profile] = await db
        .select({ inviteCode: workerProfiles.inviteCode })
        .from(workerProfiles)
        .where(eq(workerProfiles.userId, workerId))
        .limit(1)

      if (!profile) {
        return reply.status(404).send({ error: "Worker profile not found" })
      }

      if (!profile.inviteCode) {
        return reply.status(500).send({ error: "Invite code not yet generated for this profile" })
      }

      const inviteUrl = `https://albaconnect.kr/join?ref=${profile.inviteCode}`

      return reply.send({
        inviteUrl,
        inviteCode: profile.inviteCode,
      })
    }
  )

  /**
   * GET /workers/referrals
   * List the worker's referrals with status and earned bonuses.
   */
  app.get(
    "/workers/referrals",
    { preHandler: [requireWorker] },
    async (request, reply) => {
      const workerId = request.user.id
      const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number }
      const offset = (Number(page) - 1) * Number(limit)

      const rows = await db.execute<{
        id: string
        referee_id: string
        referee_name: string
        status: string
        bonus_amount: number
        qualified_at: Date | null
        rewarded_at: Date | null
        created_at: Date
      }>(sql`
        SELECT
          r.id,
          r.referee_id,
          u.name AS referee_name,
          r.status,
          r.bonus_amount,
          r.qualified_at,
          r.rewarded_at,
          r.created_at
        FROM referrals r
        JOIN users u ON u.id = r.referee_id
        WHERE r.referrer_id = ${workerId}
        ORDER BY r.created_at DESC
        LIMIT ${Number(limit)} OFFSET ${offset}
      `)

      const referralList = rows.rows

      // Compute total earned (rewarded bonuses only)
      const earnedResult = await db.execute<{ total: string }>(sql`
        SELECT COALESCE(SUM(bonus_amount), 0) AS total
        FROM referrals
        WHERE referrer_id = ${workerId} AND status = 'rewarded'
      `)
      const earnedRow = earnedResult.rows[0] as { total: string } | undefined

      return reply.send({
        referrals: referralList,
        totalEarned: parseInt(String(earnedRow?.total ?? "0"), 10),
        page: Number(page),
        limit: Number(limit),
      })
    }
  )
}
