/**
 * tossWebhook.ts — Toss Payments webhook handler and payment reconciliation worker
 *
 * Features:
 *   - HMAC-SHA256 signature verification of raw request body
 *   - Idempotent event processing via toss_webhook_events table
 *   - PAYMENT_STATUS_CHANGED: DONE → escrow confirm, CANCELED/PARTIAL_CANCELED → refund
 *   - VIRTUAL_ACCOUNT_DEPOSIT → trigger escrow confirmation
 *   - Reconciliation worker: scan pending payments >30min → verify with Toss API
 *
 * Counters (in-process, reset on restart):
 *   alba_toss_webhook_events_total (by eventType + status)
 *   alba_payments_pending_reconciliation (gauge)
 */

import crypto from "crypto"
import { db, sql } from "../db"
import { eq, and, lt, sql as drizzleSql } from "drizzle-orm"
import { payments, jobPostings, tossWebhookEvents } from "../db/schema"

// ─── In-process counters (Prometheus-compatible labels) ─────────────────────
const _webhookCounters: Record<string, number> = {}
export function incrementWebhookCounter(eventType: string, status: "processed" | "skipped" | "error"): void {
  const key = `alba_toss_webhook_events_total{event_type="${eventType}",status="${status}"}`
  _webhookCounters[key] = (_webhookCounters[key] ?? 0) + 1
}
export function getWebhookCounters(): Record<string, number> {
  return { ..._webhookCounters }
}

let _pendingReconciliationGauge = 0
export function getPendingReconciliationGauge(): number {
  return _pendingReconciliationGauge
}

// ─── HMAC-SHA256 Signature Verification ─────────────────────────────────────

/**
 * Verify Toss webhook signature.
 * Toss sends: Authorization: Basic base64(secret:)
 * We must verify against the raw request body HMAC-SHA256 with TOSS_WEBHOOK_SECRET.
 *
 * Toss v2 spec: header "TossPayments-Signature" = HMAC-SHA256(rawBody, secret)
 * If TOSS_WEBHOOK_SECRET is unset, skip verification (dev/test).
 */
export function verifyTossSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.TOSS_WEBHOOK_SECRET
  if (!secret) return true // dev/test: no secret configured
  if (!signature) return false

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")

  // Constant-time compare to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))
  } catch {
    return false
  }
}

// ─── Idempotent Event Processing ─────────────────────────────────────────────

/**
 * Returns true if event was newly inserted (should be processed).
 * Returns false if duplicate (orderKey already exists → skip).
 */
export async function recordWebhookEvent(
  orderKey: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const result = await db.execute(drizzleSql`
    INSERT INTO toss_webhook_events (order_key, event_type, payload, processed_at, created_at)
    VALUES (${orderKey}, ${eventType}, ${JSON.stringify(payload)}::jsonb, NOW(), NOW())
    ON CONFLICT (order_key) DO NOTHING
    RETURNING id
  `)
  return (result.rows?.length ?? 0) > 0
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

export interface TossWebhookPayload {
  eventType: string
  data: {
    paymentKey?: string
    orderId?: string
    status?: string
    cancels?: Array<{ cancelAmount: number; cancelReason: string }>
    [key: string]: unknown
  }
}

export async function handlePaymentStatusChanged(data: TossWebhookPayload["data"]): Promise<void> {
  const { paymentKey, orderId, status } = data
  const lookupKey = paymentKey ?? orderId
  if (!lookupKey) return

  if (status === "DONE") {
    // Mark payment confirmed → update escrow
    const field = paymentKey ? payments.tossPaymentKey : payments.tossOrderId
    await db.update(payments)
      .set({ tossStatus: "DONE", status: "completed" })
      .where(eq(field, lookupKey))

    const [updated] = await db.select({ id: payments.id, jobId: payments.jobId })
      .from(payments)
      .where(eq(field, lookupKey))
      .limit(1)

    if (updated) {
      await db.update(jobPostings)
        .set({ escrowStatus: "escrowed", updatedAt: new Date() })
        .where(eq(jobPostings.id, updated.jobId))
    }
  } else if (status === "CANCELED" || status === "PARTIAL_CANCELED") {
    const field = paymentKey ? payments.tossPaymentKey : payments.tossOrderId
    await db.update(payments)
      .set({ tossStatus: status, status: "cancelled" })
      .where(eq(field, lookupKey))

    const [updated] = await db.select({ id: payments.id, jobId: payments.jobId })
      .from(payments)
      .where(eq(field, lookupKey))
      .limit(1)

    if (updated) {
      await db.update(jobPostings)
        .set({ escrowStatus: "released", updatedAt: new Date() })
        .where(eq(jobPostings.id, updated.jobId))
    }
  }
}

export async function handleVirtualAccountDeposit(data: TossWebhookPayload["data"]): Promise<void> {
  const { paymentKey, orderId } = data
  const lookupKey = paymentKey ?? orderId
  if (!lookupKey) return

  const field = paymentKey ? payments.tossPaymentKey : payments.tossOrderId
  await db.update(payments)
    .set({ tossStatus: "VIRTUAL_ACCOUNT_DEPOSIT", status: "pending" })
    .where(eq(field, lookupKey))

  // Confirm escrow on deposit
  const [updated] = await db.select({ id: payments.id, jobId: payments.jobId })
    .from(payments)
    .where(eq(field, lookupKey))
    .limit(1)

  if (updated) {
    await db.update(jobPostings)
      .set({ escrowStatus: "escrowed", updatedAt: new Date() })
      .where(eq(jobPostings.id, updated.jobId))
  }
}

// ─── Reconciliation Worker ────────────────────────────────────────────────────

const RECON_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const STALE_THRESHOLD_MIN = 30

let _reconTimer: ReturnType<typeof setInterval> | null = null

export async function runPaymentReconciliation(testMode = false): Promise<{ checked: number; updated: number; errors: number }> {
  const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MIN * 60 * 1000)

  let stalePayments: Array<{ id: string; tossPaymentKey: string | null; tossOrderId: string | null }> = []
  try {
    const result = await db.execute<{ id: string; toss_payment_key: string | null; toss_order_id: string | null }>(drizzleSql`
      SELECT id, toss_payment_key, toss_order_id
      FROM payments
      WHERE status = 'pending'
        AND created_at < ${staleThreshold.toISOString()}::timestamptz
      LIMIT 50
    `)
    stalePayments = result.rows.map(r => ({
      id: r.id,
      tossPaymentKey: r.toss_payment_key,
      tossOrderId: r.toss_order_id,
    }))
  } catch {
    return { checked: 0, updated: 0, errors: 1 }
  }

  _pendingReconciliationGauge = stalePayments.length

  if (stalePayments.length === 0) return { checked: 0, updated: 0, errors: 0 }

  let updated = 0
  let errors = 0

  const secretKey = process.env.TOSS_SECRET_KEY
  if (!secretKey || testMode) {
    return { checked: stalePayments.length, updated: 0, errors: 0 }
  }

  const authHeader = "Basic " + Buffer.from(secretKey + ":").toString("base64")

  for (const payment of stalePayments) {
    const lookupId = payment.tossOrderId ?? payment.tossPaymentKey
    if (!lookupId) continue

    try {
      const res = await fetch(
        `https://api.tosspayments.com/v1/payments/orders/${payment.tossOrderId ?? lookupId}`,
        { headers: { Authorization: authHeader } }
      )
      if (!res.ok) { errors++; continue }

      const tossData = await res.json() as { status?: string }
      const tossStatus = tossData.status

      if (tossStatus === "DONE") {
        await db.update(payments)
          .set({ tossStatus: "DONE", status: "completed" })
          .where(eq(payments.id, payment.id))
        updated++
      } else if (tossStatus === "CANCELED" || tossStatus === "PARTIAL_CANCELED") {
        await db.update(payments)
          .set({ tossStatus, status: "cancelled" })
          .where(eq(payments.id, payment.id))
        updated++
      }
    } catch {
      errors++
    }
  }

  return { checked: stalePayments.length, updated, errors }
}

export function startReconciliationWorker(): void {
  if (_reconTimer || process.env.VITEST) return
  _reconTimer = setInterval(() => {
    void runPaymentReconciliation().catch(console.error)
  }, RECON_INTERVAL_MS)
  _reconTimer.unref?.()
}

export function stopReconciliationWorker(): void {
  if (_reconTimer) {
    clearInterval(_reconTimer)
    _reconTimer = null
  }
}
