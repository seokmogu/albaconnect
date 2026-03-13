import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and, sql, desc } from "drizzle-orm"
import { db, reviews, jobApplications, jobPostings, users, workerProfiles, employerProfiles } from "../db"
import { authenticate } from "../middleware/auth"

const reviewSchema = z.object({
  jobId: z.string().uuid(),
  revieweeId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
})

const jobRatingSchema = z.object({
  score: z.number().int().min(1).max(5),
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

    // Update reviewee rating average (role-specific)
    const [revieweeUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, revieweeId)).limit(1)
    if (revieweeUser?.role === "worker") {
      await db.execute(sql`
        UPDATE worker_profiles
        SET 
          rating_avg = (SELECT AVG(rating)::DECIMAL(3,2) FROM reviews WHERE reviewee_id = ${revieweeId}),
          rating_count = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = ${revieweeId})
        WHERE user_id = ${revieweeId}
      `)
    } else if (revieweeUser?.role === "employer") {
      await db.execute(sql`
        UPDATE employer_profiles
        SET 
          rating_avg = (SELECT AVG(rating)::DECIMAL(3,2) FROM reviews WHERE reviewee_id = ${revieweeId}),
          rating_count = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = ${revieweeId})
        WHERE user_id = ${revieweeId}
      `)
    }

    return reply.status(201).send({ review })
  })

  // GET /reviews/:userId — all reviews for a user
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

  // POST /jobs/:id/ratings — submit rating for a job (employer rates worker, worker rates employer)
  app.post("/jobs/:id/ratings", { preHandler: [authenticate] }, async (request, reply) => {
    const { id: jobId } = request.params as { id: string }
    const body = jobRatingSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    const { score, comment } = body.data
    const reviewerId = request.user.id
    const reviewerRole = request.user.role

    const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).limit(1)
    if (!job) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Job not found" } })
    if (job.status !== "completed") {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "Can only rate completed jobs" } })
    }

    // Determine reviewee based on caller's role
    let revieweeId: string
    if (reviewerRole === "employer") {
      // Employer rates the assigned worker — find accepted application
      const appResult = await db.execute<{ worker_id: string }>(sql`
        SELECT worker_id FROM job_applications 
        WHERE job_id = ${jobId} AND status = 'completed'
        LIMIT 1
      `)
      const appRow = appResult.rows[0]
      if (!appRow) return reply.status(400).send({ error: { code: "NO_WORKER", message: "No completed worker found for this job" } })
      revieweeId = appRow.worker_id
    } else if (reviewerRole === "worker") {
      // Worker rates the employer
      revieweeId = job.employerId
    } else {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only employers and workers can submit ratings" } })
    }

    if (reviewerId === revieweeId) {
      return reply.status(400).send({ error: { code: "SELF_RATING", message: "Cannot rate yourself" } })
    }

    // Prevent duplicate rating: one per reviewer per job
    const [existing] = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.jobId, jobId), eq(reviews.reviewerId, reviewerId)))
      .limit(1)

    if (existing) {
      return reply.status(409).send({ error: { code: "DUPLICATE", message: "Already rated this job" } })
    }

    const [review] = await db
      .insert(reviews)
      .values({ jobId, reviewerId, revieweeId, rating: score, comment })
      .returning()

    // Update reviewee aggregate (role-specific)
    const [revieweeUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, revieweeId)).limit(1)
    if (revieweeUser?.role === "worker") {
      await db.execute(sql`
        UPDATE worker_profiles
        SET 
          rating_avg = (SELECT AVG(rating)::DECIMAL(3,2) FROM reviews WHERE reviewee_id = ${revieweeId}),
          rating_count = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = ${revieweeId})
        WHERE user_id = ${revieweeId}
      `)
    } else if (revieweeUser?.role === "employer") {
      await db.execute(sql`
        UPDATE employer_profiles
        SET 
          rating_avg = (SELECT AVG(rating)::DECIMAL(3,2) FROM reviews WHERE reviewee_id = ${revieweeId}),
          rating_count = (SELECT COUNT(*) FROM reviews WHERE reviewee_id = ${revieweeId})
        WHERE user_id = ${revieweeId}
      `)
    }

    return reply.status(201).send({ review })
  })

  // GET /workers/:id/ratings — ratings received by a specific worker
  app.get("/workers/:id/ratings", { preHandler: [authenticate] }, async (request, reply) => {
    const { id: workerId } = request.params as { id: string }
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number }
    const offset = (Number(page) - 1) * Number(limit)

    const rows = await db.execute<any>(sql`
      SELECT 
        r.id, r.job_id, r.reviewer_id, r.rating, r.comment, r.created_at,
        u.name AS reviewer_name,
        jp.title AS job_title,
        jp.category
      FROM reviews r
      JOIN users u ON u.id = r.reviewer_id
      JOIN job_postings jp ON jp.id = r.job_id
      WHERE r.reviewee_id = ${workerId}
      ORDER BY r.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `)

    const aggResult = await db.execute<{ rating_avg: string; rating_count: string }>(sql`
      SELECT rating_avg, rating_count FROM worker_profiles WHERE user_id = ${workerId}
    `)
    const agg = aggResult.rows[0]

    return reply.send({
      ratings: rows.rows,
      aggregate: {
        avg: agg ? parseFloat(agg.rating_avg ?? "0") : 0,
        count: agg ? parseInt(agg.rating_count ?? "0", 10) : 0,
      },
    })
  })

  // GET /employers/:id/ratings — ratings received by a specific employer
  app.get("/employers/:id/ratings", { preHandler: [authenticate] }, async (request, reply) => {
    const { id: employerId } = request.params as { id: string }
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number }
    const offset = (Number(page) - 1) * Number(limit)

    const rows = await db.execute<any>(sql`
      SELECT 
        r.id, r.job_id, r.reviewer_id, r.rating, r.comment, r.created_at,
        u.name AS reviewer_name,
        jp.title AS job_title,
        jp.category
      FROM reviews r
      JOIN users u ON u.id = r.reviewer_id
      JOIN job_postings jp ON jp.id = r.job_id
      WHERE r.reviewee_id = ${employerId}
      ORDER BY r.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}
    `)

    const aggResult = await db.execute<{ rating_avg: string; rating_count: string }>(sql`
      SELECT rating_avg, rating_count FROM employer_profiles WHERE user_id = ${employerId}
    `)
    const agg = aggResult.rows[0]

    return reply.send({
      ratings: rows.rows,
      aggregate: {
        avg: agg ? parseFloat(agg.rating_avg ?? "0") : 0,
        count: agg ? parseInt(agg.rating_count ?? "0", 10) : 0,
      },
    })
  })
}
