import webpush from "web-push"
import { eq } from "drizzle-orm"
import { db, workerProfiles } from "../db"

export interface JobOfferPushPayload {
  jobId: string
  title: string
  hourlyRate: number
  distanceKm: number
  expiresAt: string
}

let vapidConfigured = false

export function initWebPush(): void {
  if (process.env["VITEST"]) return

  const publicKey = process.env["VAPID_PUBLIC_KEY"]
  const privateKey = process.env["VAPID_PRIVATE_KEY"]
  const email = process.env["VAPID_EMAIL"] ?? "mailto:admin@example.com"

  if (publicKey && privateKey) {
    webpush.setVapidDetails(email, publicKey, privateKey)
    vapidConfigured = true
    console.log("[WebPush] VAPID configured")
  } else {
    console.log("[WebPush] VAPID keys not set — push notifications disabled")
  }
}

export function isWebPushConfigured(): boolean {
  return vapidConfigured
}

/**
 * Send a Web Push job offer notification to a worker.
 *
 * 410 Gone: subscription expired — clears pushSubscription column so future
 * dispatches don't waste VAPID quota on dead subscriptions.
 *
 * Errors are caught internally and logged; this function never throws,
 * so it is safe to call fire-and-forget in a void IIFE.
 */
export async function sendJobOfferPush(
  workerId: string,
  subscription: unknown,
  payload: JobOfferPushPayload,
): Promise<void> {
  if (process.env["VITEST"]) return
  if (!isWebPushConfigured()) return

  try {
    await webpush.sendNotification(
      subscription as webpush.PushSubscription,
      JSON.stringify({ type: "job_offer", ...payload }),
    )
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string }
    if (e.statusCode === 410 || e.statusCode === 404) {
      // Subscription expired or unsubscribed — clear from DB
      await db
        .update(workerProfiles)
        .set({ pushSubscription: null })
        .where(eq(workerProfiles.userId, workerId))
      console.log(`[WebPush] Cleared expired subscription for worker ${workerId}`)
    } else {
      console.warn(`[WebPush] Failed to send to worker ${workerId}:`, e.message)
    }
  }
}
