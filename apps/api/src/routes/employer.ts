import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db, users, employerProfiles, jobPostings, jobApplications } from "../db"
import { authenticate, requireEmployer } from "../middleware/auth"
import { sql } from "drizzle-orm"

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
}
