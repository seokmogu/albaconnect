import { Server } from "socket.io"
import { sql, eq, and, ne } from "drizzle-orm"
import { db, jobPostings, jobApplications, workerProfiles, users } from "../db"
import { MATCH_RADIUS_KM, OFFER_TIMEOUT_SECONDS, LATE_CANCEL_PENALTY_RATE } from "@albaconnect/shared"
import { createNotification } from "../routes/notifications"
import { rankWorkers } from "./scoring"

// Map of userId -> socketId for active workers
export const workerSockets = new Map<string, string>()

let io: Server

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusKm = 6371

  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

export function setSocketServer(socketServer: Server) {
  io = socketServer
}

interface WorkerCandidate {
  userId: string
  distance: number
  ratingAvg: number
}

export async function findNearbyWorkers(jobId: string): Promise<WorkerCandidate[]> {
  const [job] = await db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.id, jobId))
    .limit(1)

  if (!job || !job.location) return []

  // Get workers already assigned or offered for this job
  const existingApps = await db
    .select({ workerId: jobApplications.workerId })
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.jobId, jobId),
        ne(jobApplications.status, "rejected"),
        ne(jobApplications.status, "timeout")
      )
    )

  const excludedWorkerIds = existingApps.map((a) => a.workerId)

  // PostGIS: find available workers within radius, sorted by distance then rating
  const loc = job.location as { lat: number; lng: number }
  const radiusMeters = MATCH_RADIUS_KM * 1000

  const workers = await db.execute<{
    user_id: string
    distance: number
    rating_avg: string
    rating_count: number
    categories: string[]
    last_seen_at: Date | null
  }>(sql`
    SELECT 
      wp.user_id,
      ST_Distance(
        wp.location::geography,
        ST_SetSRID(ST_MakePoint(${loc.lng}, ${loc.lat}), 4326)::geography
      ) AS distance,
      wp.rating_avg,
      wp.rating_count,
      wp.categories,
      wp.last_seen_at
    FROM worker_profiles wp
    WHERE 
      wp.is_available = TRUE
      AND wp.location IS NOT NULL
      AND ST_DWithin(
        wp.location::geography,
        ST_SetSRID(ST_MakePoint(${loc.lng}, ${loc.lat}), 4326)::geography,
        ${radiusMeters}
      )
      ${excludedWorkerIds.length > 0 ? sql`AND wp.user_id NOT IN (${sql.join(excludedWorkerIds.map(id => sql`${id}::uuid`), sql`, `)})` : sql``}
    LIMIT 50
  `)

  // Apply composite scoring (distance + rating + category + activity)
  const ranked = rankWorkers(
    workers.rows.map(row => ({
      userId: row.user_id,
      distance: row.distance,
      ratingAvg: parseFloat(row.rating_avg),
      ratingCount: row.rating_count,
      categories: row.categories ?? [],
      lastSeenAt: row.last_seen_at,
    })),
    job.category,
    radiusMeters
  )

  return ranked.map(row => ({
    userId: row.userId,
    distance: row.distance,
    ratingAvg: row.ratingAvg,
    score: row.score,
  }))
}

export async function dispatchJob(jobId: string): Promise<void> {
  const workers = await findNearbyWorkers(jobId)

  if (workers.length === 0) {
    console.log(`[Matching] No available workers found for job ${jobId}`)
    return
  }

  // Offer to workers one by one
  for (const worker of workers) {
    const dispatched = await offerJobToWorker(jobId, worker.userId)
    if (dispatched) break // Offered successfully, wait for response
  }
}

async function offerJobToWorker(jobId: string, workerId: string): Promise<boolean> {
  const socketId = workerSockets.get(workerId)
  if (!socketId) {
    console.log(`[Matching] Worker ${workerId} not connected via socket, skipping`)
    return false
  }

  const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).limit(1)
  if (!job || job.status !== "open") return false

  // Check if job still needs workers
  if (job.matchedCount >= job.headcount) return false

  const expiresAt = new Date(Date.now() + OFFER_TIMEOUT_SECONDS * 1000)

  // Create application record
  const [application] = await db
    .insert(jobApplications)
    .values({
      jobId,
      workerId,
      status: "offered",
      expiresAt,
    })
    .returning()

  const loc = job.location as { lat: number; lng: number }
  const durationMs = new Date(job.endAt).getTime() - new Date(job.startAt).getTime()
  const durationHours = durationMs / (1000 * 60 * 60)

  // Emit offer to worker
  io.to(socketId).emit("job_offer", {
    jobId,
    applicationId: application.id,
    title: job.title,
    category: job.category,
    address: job.address,
    lat: loc.lat,
    lng: loc.lng,
    hourlyRate: job.hourlyRate,
    startAt: job.startAt.toISOString(),
    durationHours,
    expiresAt: expiresAt.toISOString(),
  })

  console.log(`[Matching] Offered job ${jobId} to worker ${workerId}, expires at ${expiresAt.toISOString()}`)

  // Set timeout - if worker doesn't respond, move to next
  setTimeout(async () => {
    const [current] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, application.id))
      .limit(1)

    if (current && current.status === "offered") {
      // Mark as timeout
      await db
        .update(jobApplications)
        .set({ status: "timeout", respondedAt: new Date() })
        .where(eq(jobApplications.id, application.id))

      console.log(`[Matching] Worker ${workerId} timed out for job ${jobId}, trying next worker`)

      // Try next available worker
      await dispatchJob(jobId)
    }
  }, OFFER_TIMEOUT_SECONDS * 1000)

  return true
}

export async function handleAcceptOffer(applicationId: string, workerId: string): Promise<{ success: boolean; message: string }> {
  const [application] = await db
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.id, applicationId))
    .limit(1)

  if (!application || application.workerId !== workerId) {
    return { success: false, message: "Application not found" }
  }

  if (application.status !== "offered") {
    return { success: false, message: "Offer is no longer valid" }
  }

  if (new Date() > application.expiresAt) {
    await db.update(jobApplications).set({ status: "timeout" }).where(eq(jobApplications.id, applicationId))
    return { success: false, message: "Offer has expired" }
  }

  const [job] = await db.select().from(jobPostings).where(eq(jobPostings.id, application.jobId)).limit(1)
  if (!job || job.status !== "open") {
    return { success: false, message: "Job is no longer available" }
  }

  if (job.matchedCount >= job.headcount) {
    await db.update(jobApplications).set({ status: "rejected" }).where(eq(jobApplications.id, applicationId))
    return { success: false, message: "Job is already fully matched" }
  }

  // Accept the offer
  await db
    .update(jobApplications)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(eq(jobApplications.id, applicationId))

  const newMatchedCount = job.matchedCount + 1
  const newStatus = newMatchedCount >= job.headcount ? "matched" : "open"

  await db
    .update(jobPostings)
    .set({ matchedCount: newMatchedCount, status: newStatus, updatedAt: new Date() })
    .where(eq(jobPostings.id, job.id))

  // Notify employer
  const [employer] = await db.select().from(users).where(eq(users.id, job.employerId)).limit(1)
  const [worker] = await db.select().from(users).where(eq(users.id, workerId)).limit(1)

  const employerSocketId = workerSockets.get(job.employerId)
  if (employerSocketId && worker) {
    io.to(employerSocketId).emit("job_matched", {
      jobId: job.id,
      workerName: worker.name,
      matchedCount: newMatchedCount,
      headcount: job.headcount,
    })
  }

  // Persist notifications
  if (worker) {
    await createNotification(
      job.employerId,
      "job_matched",
      "매칭 완료!",
      `${worker.name}님이 "${job.title}" 공고를 수락했습니다.`,
      { jobId: job.id }
    )
    await createNotification(
      workerId,
      "job_matched",
      "알바 확정!",
      `"${job.title}" 공고가 확정되었습니다. 근무 시작 시간을 확인하세요.`,
      { jobId: job.id }
    )
  }

  console.log(`[Matching] Worker ${workerId} accepted job ${job.id}`)
  return { success: true, message: "Job accepted successfully" }
}

export async function handleRejectOffer(applicationId: string, workerId: string): Promise<{ success: boolean }> {
  const [application] = await db
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.id, applicationId))
    .limit(1)

  if (!application || application.workerId !== workerId) {
    return { success: false }
  }

  await db
    .update(jobApplications)
    .set({ status: "rejected", respondedAt: new Date() })
    .where(eq(jobApplications.id, applicationId))

  // Dispatch to next worker
  await dispatchJob(application.jobId)

  return { success: true }
}
