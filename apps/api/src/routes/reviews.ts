import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and, sql, desc } from "drizzle-orm"
import { db, reviews, jobApplications, jobPostings, users, workerProfiles, employerProfiles } from "../db"
import { authenticate } from "../middleware/auth"
import { reviewSubmittedCounter } from "../lib/metrics"

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

    // Determine reviewerRole from authenticated user
    const [reviewerUserForRole] = await db.select({ role: users.role }).from(users).where(eq(users.id, reviewerId)).limit(1)
    const reviewerRoleValue = (reviewerUserForRole?.role ?? "worker") as "employer" | "worker"
    const [review] = await db.insert(reviews).values({ jobId, reviewerId, revieweeId, rating, comment, reviewerRole: reviewerRoleValue }).returning()

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
      .values({ jobId, reviewerId, revieweeId, rating: score, comment, reviewerRole: reviewerRole as "employer" | "worker" })
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

  // ── Verified bi-directional review endpoints ─────────────────────────────

  const reviewSubmitSchema = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(500).optional(),
  })

  // POST /jobs/:id/review — submit a verified review (with reviewer_role tracking)
  // Employer → rates the assigned worker; Worker → rates the employer
  app.post("/jobs/:id/review", { preHandler: [authenticate] }, async (request, reply) => {
    const { id: jobId } = request.params as { id: string }
    const body = reviewSubmitSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    const { rating, comment } = body.data
    const reviewerId = request.user.id
    const reviewerRole = request.user.role as "employer" | "worker"

    // Verify job exists and is completed
    const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).limit(1)
    if (!job) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Job not found" } })
    }
    if (job.status !== "completed") {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "Can only review completed jobs" } })
    }

    // Determine reviewee — auto-set based on reviewer role
    let revieweeId: string
    if (reviewerRole === "employer") {
      // Employer verifies they own the job
      if (job.employerId !== reviewerId) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "You are not the employer for this job" } })
      }
      // Employer rates the assigned worker
      const appResult = await db.execute<{ worker_id: string }>(sql`
        SELECT worker_id FROM job_applications
        WHERE job_id = ${jobId} AND status = 'completed'
        LIMIT 1
      `)
      const appRow = appResult.rows[0]
      if (!appRow) {
        return reply.status(400).send({ error: { code: "NO_WORKER", message: "No completed worker found for this job" } })
      }
      revieweeId = appRow.worker_id
    } else if (reviewerRole === "worker") {
      // Worker verifies they were assigned to this job
      const appResult = await db.execute<{ worker_id: string }>(sql`
        SELECT worker_id FROM job_applications
        WHERE job_id = ${jobId} AND worker_id = ${reviewerId} AND status = 'completed'
        LIMIT 1
      `)
      if (!appResult.rows[0]) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "You were not the assigned worker for this job" } })
      }
      // Worker rates the employer
      revieweeId = job.employerId
    } else {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only employers and workers can submit reviews" } })
    }

    if (reviewerId === revieweeId) {
      return reply.status(400).send({ error: { code: "SELF_REVIEW", message: "Cannot review yourself" } })
    }

    // Prevent duplicate: one review per reviewer per job (enforced by UNIQUE constraint)
    const [existing] = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.jobId, jobId), eq(reviews.reviewerId, reviewerId)))
      .limit(1)

    if (existing) {
      return reply.status(409).send({ error: { code: "DUPLICATE", message: "Already reviewed this job" } })
    }

    const [review] = await db
      .insert(reviews)
      .values({ jobId, reviewerId, revieweeId, rating, comment, reviewerRole })
      .returning()

    // Track reviewer_role dimension in Prometheus
    reviewSubmittedCounter.inc({ reviewer_role: reviewerRole })

    // Update reviewee aggregate
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

  // GET /workers/:id/reviews — paginated reviews received by a worker (cursor-based)
  app.get("/workers/:id/reviews", { preHandler: [authenticate] }, async (request, reply) => {
    const { id: workerId } = request.params as { id: string }
    const { cursor, limit = 20 } = request.query as { cursor?: string; limit?: number }
    const pageLimit = Math.min(Number(limit), 100)

    const rows = await db.execute<any>(sql`
      SELECT
        r.id, r.job_id, r.reviewer_id, r.rating, r.comment, r.reviewer_role, r.created_at,
        u.name AS reviewer_name,
        jp.title AS job_title,
        jp.category
      FROM reviews r
      JOIN users u ON u.id = r.reviewer_id
      JOIN job_postings jp ON jp.id = r.job_id
      WHERE r.reviewee_id = ${workerId}
        ${cursor ? sql`AND r.created_at < (SELECT created_at FROM reviews WHERE id = ${cursor})` : sql``}
      ORDER BY r.created_at DESC
      LIMIT ${pageLimit + 1}
    `)

    const items = rows.rows as any[]
    const hasMore = items.length > pageLimit
    const results = hasMore ? items.slice(0, pageLimit) : items
    const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].id : null

    const aggResult = await db.execute<{ rating_avg: string; rating_count: string }>(sql`
      SELECT rating_avg, rating_count FROM worker_profiles WHERE user_id = ${workerId}
    `)
    const agg = aggResult.rows[0]

    return reply.send({
      reviews: results,
      nextCursor,
      aggregate: {
        avg: agg ? parseFloat(agg.rating_avg ?? "0") : 0,
        count: agg ? parseInt(agg.rating_count ?? "0", 10) : 0,
      },
    })
  })

  // GET /employers/:id/reviews — paginated reviews received by an employer (cursor-based)
  app.get("/employers/:id/reviews", { preHandler: [authenticate] }, async (request, reply) => {
    const { id: employerId } = request.params as { id: string }
    const { cursor, limit = 20 } = request.query as { cursor?: string; limit?: number }
    const pageLimit = Math.min(Number(limit), 100)

    const rows = await db.execute<any>(sql`
      SELECT
        r.id, r.job_id, r.reviewer_id, r.rating, r.comment, r.reviewer_role, r.created_at,
        u.name AS reviewer_name,
        jp.title AS job_title,
        jp.category
      FROM reviews r
      JOIN users u ON u.id = r.reviewer_id
      JOIN job_postings jp ON jp.id = r.job_id
      WHERE r.reviewee_id = ${employerId}
        ${cursor ? sql`AND r.created_at < (SELECT created_at FROM reviews WHERE id = ${cursor})` : sql``}
      ORDER BY r.created_at DESC
      LIMIT ${pageLimit + 1}
    `)

    const items = rows.rows as any[]
    const hasMore = items.length > pageLimit
    const results = hasMore ? items.slice(0, pageLimit) : items
    const nextCursor = hasMore && results.length > 0 ? results[results.length - 1].id : null

    const aggResult = await db.execute<{ rating_avg: string; rating_count: string }>(sql`
      SELECT rating_avg, rating_count FROM employer_profiles WHERE user_id = ${employerId}
    `)
    const agg = aggResult.rows[0]

    return reply.send({
      reviews: results,
      nextCursor,
      aggregate: {
        avg: agg ? parseFloat(agg.rating_avg ?? "0") : 0,
        count: agg ? parseInt(agg.rating_count ?? "0", 10) : 0,
      },
    })
  })
}
