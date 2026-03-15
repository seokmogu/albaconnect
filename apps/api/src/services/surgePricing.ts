/**
 * surgePricing.ts — Dynamic surge multiplier calculation for AlbaConnect
 *
 * Computes a surge pricing multiplier (1.00–2.00) based on:
 *   - Supply/demand ratio: open jobs vs available workers in same category + 5km radius
 *   - Peak hour bonus (KST): weekday 07-09 / 17-20 = +0.1x; weekend all-day = +0.1x
 *   - Last-minute bonus: job starts within 2h = +0.1x (capped)
 *
 * Thresholds (jobs/workers ratio):
 *   < 2.0  → 1.00x (no surge)
 *   2.0–4.0 → 1.20x
 *   4.0–8.0 → 1.50x
 *   > 8.0  → 2.00x (hard cap)
 *
 * Exported:
 *   computeSurgeMultiplier(params) — pure, no DB (for preview / tests)
 *   runSurgeCalc(db, jobId)        — DB-backed; updates job_postings.surge_multiplier
 *   applyDailySurge(db)            — batch update all open jobs (for daily cron / admin)
 */

import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { jobPostings } from '../db/schema'

export const SURGE_MULTIPLIER_MAX = 2.00
export const SURGE_RADIUS_KM = 5

interface SurgeParams {
  /** open jobs / available workers ratio in same category + radius */
  demandRatio: number
  /** job start time (used for KST peak-hour and last-minute checks) */
  startAt: Date
  /** current time (defaults to now) */
  now?: Date
}

/**
 * Pure function — compute surge multiplier from demand params.
 * Returns a value between 1.00 and 2.00 (inclusive).
 */
export function computeSurgeMultiplier(params: SurgeParams): number {
  const { demandRatio, startAt, now = new Date() } = params

  // Base multiplier from supply/demand ratio
  let multiplier = 1.00
  if (demandRatio >= 8.0) {
    multiplier = 2.00
  } else if (demandRatio >= 4.0) {
    multiplier = 1.50
  } else if (demandRatio >= 2.0) {
    multiplier = 1.20
  }

  if (multiplier === 1.00) {
    // No base surge — bonuses can push to max 1.2x even in low demand
  }

  // KST offset: UTC+9
  const kstOffset = 9 * 60 * 60 * 1000
  const startKST = new Date(startAt.getTime() + kstOffset)
  const hour = startKST.getUTCHours()
  const dayOfWeek = startKST.getUTCDay() // 0=Sun, 6=Sat

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
  const isPeakHour = (!isWeekend && ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 20)))

  if (isWeekend || isPeakHour) {
    multiplier = Math.min(SURGE_MULTIPLIER_MAX, multiplier + 0.10)
  }

  // Last-minute bonus: starts within 2 hours of now
  const msUntilStart = startAt.getTime() - now.getTime()
  if (msUntilStart > 0 && msUntilStart <= 2 * 60 * 60 * 1000) {
    multiplier = Math.min(SURGE_MULTIPLIER_MAX, multiplier + 0.10)
  }

  return Math.round(multiplier * 100) / 100
}

/**
 * DB-backed surge calculation for a single job.
 * Queries nearby supply/demand ratio, computes multiplier, updates job row.
 */
export async function runSurgeCalc(
  db: NodePgDatabase<Record<string, never>>,
  jobId: string,
): Promise<{ jobId: string; surgeMultiplier: number; updated: boolean }> {
  const [job] = await (db as any)
    .select({
      id: jobPostings.id,
      category: jobPostings.category,
      startAt: jobPostings.startAt,
      location: jobPostings.location,
    })
    .from(jobPostings)
    .where(eq((jobPostings as any).id, jobId))
    .limit(1)

  if (!job) return { jobId, surgeMultiplier: 1.00, updated: false }

  // Count open jobs in same category within SURGE_RADIUS_KM
  const openJobsResult = await (db as any).execute(sql`
    SELECT COUNT(*) AS open_count
    FROM job_postings
    WHERE status = 'open'
      AND category = ${job.category}
      AND job_id != ${jobId}
      AND ST_DWithin(
        location::geography,
        ${job.location}::geography,
        ${SURGE_RADIUS_KM * 1000}
      )
  `).catch(() => ({ rows: [{ open_count: '1' }] }))

  // Count available workers in same category within radius
  const availableWorkersResult = await (db as any).execute(sql`
    SELECT COUNT(*) AS worker_count
    FROM worker_profiles
    WHERE is_available = true
      AND ST_DWithin(
        location::geography,
        ${job.location}::geography,
        ${SURGE_RADIUS_KM * 1000}
      )
  `).catch(() => ({ rows: [{ worker_count: '1' }] }))

  const openJobs = Number(openJobsResult.rows[0]?.open_count ?? 1)
  const availableWorkers = Number(availableWorkersResult.rows[0]?.worker_count ?? 1)
  const demandRatio = availableWorkers > 0 ? openJobs / availableWorkers : openJobs

  const surge = computeSurgeMultiplier({ demandRatio, startAt: new Date(job.startAt) })

  await (db as any)
    .update(jobPostings)
    .set({ surgeMultiplier: String(surge) })
    .where(eq((jobPostings as any).id, jobId))

  return { jobId, surgeMultiplier: surge, updated: true }
}

/**
 * Batch update surge multipliers for all open jobs.
 * Called by admin trigger or daily cron.
 */
export async function applyDailySurge(
  db: NodePgDatabase<Record<string, never>>,
): Promise<{ processed: number; updated: number }> {
  const openJobs = await (db as any)
    .select({ id: (jobPostings as any).id })
    .from(jobPostings)
    .where(eq((jobPostings as any).status, 'open'))
    .limit(500)

  let updated = 0
  for (const job of openJobs) {
    const result = await runSurgeCalc(db, job.id).catch(() => null)
    if (result?.updated) updated++
  }

  return { processed: openJobs.length, updated }
}
