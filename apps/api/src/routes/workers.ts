import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db, workerProfiles, users } from "../db"
import { authenticate, requireWorker } from "../middleware/auth"
import { dispatchJob } from "../services/matching"
import { sql } from "drizzle-orm"
import { jobPostings } from "../db"

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

    const updateData: Record<string, unknown> = {
      isAvailable,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
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
    const [user] = await db.select().from(users).where(eq(users.id, workerId)).limit(1)
    const [profile] = await db.select().from(workerProfiles).where(eq(workerProfiles.userId, workerId)).limit(1)

    if (!user || !profile) {
      return reply.status(404).send({ error: "Profile not found" })
    }

    return reply.send({
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
    })
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

    return reply.send({ message: "Profile updated" })
  })
}
