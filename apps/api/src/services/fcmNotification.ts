/**
 * fcmNotification.ts — Firebase Cloud Messaging (FCM) HTTP v1 push delivery
 *
 * Uses Google FCM HTTP v1 API with service account JWT auth.
 * FCM_PROJECT_ID and GOOGLE_SERVICE_ACCOUNT_JSON env vars are required.
 * Gracefully no-ops if not configured (VITEST / missing env).
 *
 * Exports:
 *   sendFcmNotification(token, title, body, data?)  — single push
 *   sendFcmToWorker(db, workerId, title, body, data?) — DB-backed; falls back to KakaoTalk
 */

import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { workerProfiles } from '../db/schema'

export interface FcmPayload {
  title: string
  body: string
  data?: Record<string, string>
}

export interface FcmResult {
  success: boolean
  messageId?: string
  error?: string
  channel: 'fcm' | 'kakao' | 'none'
}

// ── Google Service Account JWT ────────────────────────────────────────────────

let _accessToken: string | null = null
let _tokenExpiry = 0

async function getServiceAccountToken(): Promise<string | null> {
  const now = Date.now()
  if (_accessToken && now < _tokenExpiry - 60_000) return _accessToken

  const serviceAccountJson = process.env['GOOGLE_SERVICE_ACCOUNT_JSON']
  if (!serviceAccountJson) return null

  let sa: Record<string, string>
  try {
    sa = JSON.parse(serviceAccountJson)
  } catch {
    return null
  }

  const { createSign } = await import('node:crypto')

  const iat = Math.floor(now / 1000)
  const exp = iat + 3600
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: sa['client_email'],
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
  })).toString('base64url')

  const signingInput = `${header}.${payload}`

  try {
    const sign = createSign('RSA-SHA256')
    sign.update(signingInput)
    const signature = sign.sign(sa['private_key'], 'base64url')
    const jwt = `${signingInput}.${signature}`

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    if (!res.ok) return null
    const tokenData = await res.json() as { access_token: string; expires_in: number }
    _accessToken = tokenData.access_token
    _tokenExpiry = now + tokenData.expires_in * 1000
    return _accessToken
  } catch {
    return null
  }
}

// ── FCM HTTP v1 send ──────────────────────────────────────────────────────────

/**
 * Send a push notification via FCM HTTP v1 API.
 * Returns success=false (no throw) if FCM is not configured or on error.
 */
export async function sendFcmNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<FcmResult> {
  if (process.env['VITEST']) return { success: false, channel: 'none' }

  const projectId = process.env['FCM_PROJECT_ID']
  if (!projectId) return { success: false, error: 'FCM_PROJECT_ID not set', channel: 'none' }

  const accessToken = await getServiceAccountToken()
  if (!accessToken) return { success: false, error: 'Could not obtain service account token', channel: 'none' }

  const message: Record<string, unknown> = {
    token,
    notification: { title, body },
  }
  if (data) message['data'] = data

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      },
    )

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return { success: false, error: `FCM ${res.status}: ${errText}`, channel: 'fcm' }
    }

    const result = await res.json() as { name: string }
    return { success: true, messageId: result.name, channel: 'fcm' }
  } catch (err) {
    return { success: false, error: String(err), channel: 'fcm' }
  }
}

// ── DB-backed send with KakaoTalk fallback ────────────────────────────────────

/**
 * Send push to a worker by userId.
 * - If worker has fcm_token → try FCM
 * - On FCM failure or no token → KakaoTalk AlimTalk fallback
 */
export async function sendFcmToWorker(
  db: NodePgDatabase<Record<string, never>>,
  workerId: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<FcmResult> {
  const [worker] = await (db as any)
    .select({ fcmToken: workerProfiles.fcmToken })
    .from(workerProfiles)
    .where(eq((workerProfiles as any).userId, workerId))
    .limit(1)

  if (!worker) return { success: false, error: 'Worker not found', channel: 'none' }

  if (worker.fcmToken) {
    const result = await sendFcmNotification(worker.fcmToken, title, body, data)
    if (result.success) return result
  }

  // KakaoTalk fallback via existing worker alert service
  try {
    const { sendFcmFallbackAlimTalk } = await import('./kakaoAlimTalk.js').catch(() => ({ sendFcmFallbackAlimTalk: null })) as any
    if (typeof sendFcmFallbackAlimTalk === 'function') {
      await sendFcmFallbackAlimTalk(workerId, title, body)
      return { success: true, channel: 'kakao' }
    }
    return { success: false, error: 'FCM failed, no KakaoTalk fallback available', channel: 'none' }
  } catch {
    return { success: false, error: 'Both FCM and KakaoTalk failed', channel: 'none' }
  }
}
