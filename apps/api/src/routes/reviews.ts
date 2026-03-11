import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and, sql } from "drizzle-orm"
import { db, reviews, jobApplications, jobPostings } from "../db"
import { authenticate } from "../middleware/auth"

const reviewSchema = z.object({
  jobId: z.string().uuid(),
  revieweeId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
})

export async function reviewRoutes(app: FastifyInstance) {
  app.post("/reviews", { preHandler: [authenticate] }, async (request, reply) => {
    const body = reviewSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    const { jobId, revieweeId, rating, comment } = body.data
    const reviewerId = request.user.id

    if (reviewerId === revieweeId) {
      return reply.status(400).send({ error: "Cannot review yourself" })
    }

    // Verify the reviewer was involved in the job
    const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).limit(1)
    if (!job) return reply.status(404).send({ error: "Job not found" })

    if (job.status !== "completed") {
      return reply.status(400).send({ error: "Can only review completed jobs" })
    }

    const [existing] = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.jobId, jobId), eq(reviews.reviewerId, reviewerId)))
      .limit(1)

    if (existing) {
      return reply.status(409).send({ error: "Already reviewed this job" })
    }

    const [review] = await db.insert(reviews).values({ jobId, reviewerId, revieweeId, rating, comment }).returning()

    // Update reviewee rating average
    await db.execute(sql`
      UPDATE worker_profiles
      SET 
        rating_avg = (
          SELECT AVG(rating)::DECIMAL(3,2) FROM reviews WHERE reviewee_id = ${revieweeId}
        ),
        rating_count = (
          SELECT COUNT(*) FROM reviews WHERE reviewee_id = ${revieweeId}
        )
      WHERE user_id = ${revieweeId}
    `)

    await db.execute(sql`
      UPDATE employer_profiles
      SET 
        rating_avg = (
          SELECT AVG(rating)::DECIMAL(3,2) FROM reviews WHERE reviewee_id = ${revieweeId}
        ),
        rating_count = (
          SELECT COUNT(*) FROM reviews WHERE reviewee_id = ${revieweeId}
        )
      WHERE user_id = ${revieweeId}
    `)

    return reply.status(201).send({ review })
  })

  app.get("/reviews/:userId", { preHandler: [authenticate] }, async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number }
    const offset = (Number(page) - 1) * Number(limit)

    const rows = await db.execute<any>(sql`
      SELECT 
        r.*,
        u.name as reviewer_name,
        jp.title as job_title,
        jp.category
      FROM reviews r
      JOIN users u ON u.id = r.reviewer_id
      JOIN job_postings jp ON jp.id = r.job_id
      WHERE r.reviewee_id = ${userId}
      ORDER BY r.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `)

    return reply.send({ reviews: rows.rows })
  })
}
