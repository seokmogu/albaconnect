/**
 * workerAlertWorker.ts — Automated worker re-engagement alerts via KakaoTalk
 *
 * Finds workers who are available + phone-verified but haven't received an alert
 * in ALERT_INTERVAL_DAYS (default 3). Sends JOB_ALERT AlimTalk with top 3 jobs.
 *
 * runWorkerAlerts(db) — core logic (injectable for tests + admin trigger)
 * startWorkerAlertWorker(db) — singleton setInterval (24h, VITEST guard)
 * stopWorkerAlertWorker() — cleanup on server close
 */

import { and, eq, isNull, lt, or } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { users, workerProfiles, jobPostings } from '../db/schema'
import { jobAlertAlimTalk } from './kakaoAlimTalk'

export const ALERT_INTERVAL_DAYS = Number(process.env['ALERT_INTERVAL_DAYS'] ?? 3)
export const ALERT_SCAN_INTERVAL_MS = Number(
  process.env['ALERT_SCAN_INTERVAL_MS'] ?? 24 * 60 * 60 * 1000,
)
const MAX_WORKERS_PER_RUN = Number(process.env['ALERT_MAX_WORKERS'] ?? 500)

interface AlertCounters {
  incSent(): void
  incSkipped(): void
  incErrors(): void
}

export interface AlertRunResult {
  sent: number
  skipped: number
  errors: number
}

// ── Core logic ────────────────────────────────────────────────────────────────

export async function runWorkerAlerts(
  db: NodePgDatabase<Record<string, never>>,
  countersOrDryRun?: AlertCounters | boolean,
  counters?: AlertCounters,
): Promise<AlertRunResult> {
  let sent = 0
  let skipped = 0
  let errors = 0

  const dryRun = typeof countersOrDryRun === 'boolean' ? countersOrDryRun : false
  const resolvedCounters = typeof countersOrDryRun === 'object' ? countersOrDryRun : counters

  const cutoff = new Date(Date.now() - ALERT_INTERVAL_DAYS * 24 * 60 * 60 * 1000)

  // Eligible: available + phone-verified + cooldown elapsed
  const eligibleWorkers = await db
    .select({
      userId: workerProfiles.userId,
      phone: users.phone,
    })
    .from(workerProfiles)
    .innerJoin(users, eq(workerProfiles.userId, users.id))
    .where(
      and(
        eq(workerProfiles.isAvailable, true),
        eq(workerProfiles.isPhoneVerified, true),
        or(
          isNull(workerProfiles.lastAlertSentAt),
          lt(workerProfiles.lastAlertSentAt, cutoff),
        ),
      ),
    )
    .limit(MAX_WORKERS_PER_RUN)

  for (const worker of eligibleWorkers) {
    try {
      // Top 3 open jobs (soonest first)
      const nearbyJobs = await db
        .select({
          title: jobPostings.title,
          hourlyRate: jobPostings.hourlyRate,
        })
        .from(jobPostings)
        .where(eq(jobPostings.status, 'open'))
        .orderBy(jobPostings.startAt)
        .limit(3)

      if (nearbyJobs.length === 0) {
        skipped++
        resolvedCounters?.incSkipped()        continue
      }

      const topJob = nearbyJobs[0]!
      if (!dryRun) {
        await jobAlertAlimTalk({
          phone: worker.phone,
          jobCount: nearbyJobs.length,
          topJobTitle: topJob.title,
          hourlyRate: topJob.hourlyRate,
        })

        await db
          .update(workerProfiles)
          .set({ lastAlertSentAt: new Date() })
          .where(eq(workerProfiles.userId, worker.userId))
      } else {
        console.log(`[WorkerAlert:dry-run] Would send alert to worker ${worker.userId}: ${nearbyJobs.length} job(s), top="${topJob.title}"`)
      }

      sent++
      resolvedCounters?.incSent()
    } catch {
      errors++
      resolvedCounters?.incErrors()    }
  }

  return { sent, skipped, errors }
}

// ── Singleton interval ────────────────────────────────────────────────────────

let _handle: ReturnType<typeof setInterval> | null = null

export function startWorkerAlertWorker(
  db: NodePgDatabase<Record<string, never>>,
  counters?: AlertCounters,
): void {
  if (process.env['VITEST']) return

  _handle = setInterval(() => {
    void runWorkerAlerts(db, counters).catch(() => { /* counted */ })
  }, ALERT_SCAN_INTERVAL_MS)

  if (_handle.unref) _handle.unref()
}

export function stopWorkerAlertWorker(): void {
  if (_handle) {
    clearInterval(_handle)
    _handle = null
  }
}
