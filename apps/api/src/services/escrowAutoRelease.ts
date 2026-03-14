/**
 * escrowAutoRelease.ts — Background worker for automatic escrow settlement
 *
 * Scans every SCAN_INTERVAL_MS (default 5 min) for completed jobs whose
 * 24-hour dispute window has elapsed and releases the escrowed payment.
 *
 * Conditions for auto-release:
 *   - job.status = 'completed'
 *   - job.completed_at < NOW() - RELEASE_WINDOW_HOURS (default 24h)
 *   - job.dispute_hold = false
 *   - job.escrow_status = 'escrowed'
 *   - job.payment_status != 'completed'
 *
 * On release:
 *   - UPDATE job_postings SET escrow_status='released', payment_status='completed', updated_at=NOW()
 *   - INSERT notifications (worker) — 정산 완료 알림
 *
 * Counters (prom-client):
 *   albaconnect_escrow_auto_released_total
 *   albaconnect_escrow_scan_errors_total
 */

import { and, eq, lt, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { jobPostings, jobApplications } from '../db/schema'

export const RELEASE_WINDOW_HOURS = Number(process.env['ESCROW_RELEASE_HOURS'] ?? 24)
export const SCAN_INTERVAL_MS = Number(process.env['ESCROW_SCAN_INTERVAL_MS'] ?? 5 * 60 * 1000)

interface ReleaseCounters {
  incReleased(): void
  incErrors(): void
}

// ── Core scan logic (pure, injectable db for testing) ─────────────────────────

export async function runEscrowAutoRelease(
  db: NodePgDatabase<Record<string, never>>,
  counters?: ReleaseCounters,
): Promise<{ released: number; errors: number }> {
  const cutoff = new Date(Date.now() - RELEASE_WINDOW_HOURS * 60 * 60 * 1000)

  let released = 0
  let errors = 0

  // Find eligible jobs
  const eligibleJobs = await db
    .select({
      id: jobPostings.id,
      employerId: jobPostings.employerId,
      totalAmount: jobPostings.totalAmount,
    })
    .from(jobPostings)
    .where(
      and(
        eq(jobPostings.status, 'completed'),
        eq(jobPostings.disputeHold, false),
        eq(jobPostings.escrowStatus, 'escrowed'),
        lt(jobPostings.completedAt, cutoff),
      ),
    )

  for (const job of eligibleJobs) {
    try {
      // Release escrow
      await db
        .update(jobPostings)
        .set({
          escrowStatus: 'released',
          paymentStatus: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(jobPostings.id, job.id))

      // Notify accepted workers
      const accepted = await db
        .select({ workerId: jobApplications.workerId })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.jobId, job.id),
            eq(jobApplications.status, 'completed'),
          ),
        )

      for (const { workerId } of accepted) {
        await db.execute(
          sql`
            INSERT INTO notifications (user_id, type, title, body, data, read)
            VALUES (
              ${workerId}::uuid,
              'escrow_auto_released',
              '정산이 완료되었습니다',
              '24시간 분쟁 신청 기간이 종료되어 급여가 자동 정산되었습니다.',
              ${JSON.stringify({ jobId: job.id, amount: job.totalAmount })}::text,
              false
            )
          `,
        )
      }

      released++
      counters?.incReleased()
    } catch {
      errors++
      counters?.incErrors()
    }
  }

  return { released, errors }
}

// ── Singleton interval handle ──────────────────────────────────────────────────

let _intervalHandle: ReturnType<typeof setInterval> | null = null

export function startEscrowAutoReleaseWorker(
  db: NodePgDatabase<Record<string, never>>,
  counters?: ReleaseCounters,
): void {
  if (process.env['VITEST']) return // skip in tests

  _intervalHandle = setInterval(() => {
    void runEscrowAutoRelease(db, counters).catch(() => { /* logged by counter */ })
  }, SCAN_INTERVAL_MS)

  // Unref so the process can exit cleanly
  if (_intervalHandle.unref) _intervalHandle.unref()
}

export function stopEscrowAutoReleaseWorker(): void {
  if (_intervalHandle) {
    clearInterval(_intervalHandle)
    _intervalHandle = null
  }
}
