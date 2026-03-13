/**
 * AlbaConnect Job Expiry Service
 *
 * Runs periodically to cancel stale jobs and mark no-shows.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED so multi-instance deploys
 * don't double-process the same expired jobs.
 *
 * processExpiredJobs() is idempotent: safe to call multiple times.
 */

import { sql } from "drizzle-orm"
import { db } from "../db"

/** Caller-supplied socket emit function — keeps this service free of socket.io imports. */
export type EmitFn = (event: string, userIds: string[], payload: unknown) => void

interface ExpiredJobRow extends Record<string, unknown> {
  id: string
  employer_id: string
  escrow_status: string
  matched_count: number
}

interface AcceptedApplicationRow extends Record<string, unknown> {
  worker_id: string
}

export interface ExpiryResult {
  expiredCount: number
  noshowCount: number
}

/**
 * Find and process all jobs whose start_at has passed and are still open/matched.
 *
 * @param emitFn - Optional socket emit callback. Pass undefined if no socket context.
 */
export async function processExpiredJobs(emitFn?: EmitFn): Promise<ExpiryResult> {
  let expiredCount = 0
  let noshowCount = 0

  // 1. Claim expired jobs with SKIP LOCKED — safe under horizontal scale
  const expiredJobs = await db.execute<ExpiredJobRow>(sql`
    SELECT id, employer_id, escrow_status, matched_count
    FROM job_postings
    WHERE status IN ('open', 'matched')
      AND start_at < NOW()
    FOR UPDATE SKIP LOCKED
  `)

  if (expiredJobs.rows.length === 0) {
    return { expiredCount: 0, noshowCount: 0 }
  }

  for (const job of expiredJobs.rows) {
    try {
      // 2. Cancel the job; refund escrow only when no workers were matched
      const shouldRefund = Number(job.matched_count) === 0 && job.escrow_status === "escrowed"
      await db.execute(sql`
        UPDATE job_postings
        SET
          status = 'cancelled',
          escrow_status = ${shouldRefund ? "refunded" : job.escrow_status},
          updated_at = NOW()
        WHERE id = ${job.id}
      `)

      // 3. Find accepted applications for this job
      const accepted = await db.execute<AcceptedApplicationRow>(sql`
        SELECT worker_id
        FROM job_applications
        WHERE job_id = ${job.id}
          AND status = 'accepted'
      `)

      const workerIds = accepted.rows.map(r => r.worker_id)

      // 4. Mark accepted applications as no-show
      if (workerIds.length > 0) {
        await db.execute(sql`
          UPDATE job_applications
          SET status = 'noshow', updated_at = NOW()
          WHERE job_id = ${job.id}
            AND status = 'accepted'
        `)
        noshowCount += workerIds.length
      }

      // 5. Emit socket event to employer + affected workers
      const notifyIds = [job.employer_id, ...workerIds]
      emitFn?.("job_expired", notifyIds, {
        jobId: job.id,
        expiredAt: new Date().toISOString(),
        refunded: shouldRefund,
      })

      expiredCount++
    } catch (err) {
      console.error(`[Expiry] Failed processing job ${job.id}:`, err)
      // Continue processing remaining jobs — partial failure is logged
    }
  }

  return { expiredCount, noshowCount }
}
