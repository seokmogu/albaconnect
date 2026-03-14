/**
 * otpService.ts — Redis-backed OTP generation and verification
 *
 * - OTP stored at key `otp:{workerId}` with TTL 300s
 * - Attempt counter at `otp:attempts:{workerId}` (atomic INCR before read)
 * - Max 3 attempts before lockout; lockout TTL reset to 300s on each trigger
 * - verifyOtp throws when Redis is unavailable — no silent bypass in
 *   misconfigured environments (staging without REDIS_URL, etc.)
 * - Uses native GETDEL (ioredis v5+) for atomic check-and-delete,
 *   preventing two concurrent correct submissions from both passing
 */

import crypto from "node:crypto"
import { getRedisClient } from "../lib/redis.js"
import { sendOtpAlimTalk } from "./kakaoAlimTalk.js"

const OTP_TTL_SEC = 300
const MAX_ATTEMPTS = 3

/** Generate a cryptographically random 6-digit OTP. */
export function generateOtp(): string {
  return crypto.randomInt(100_000, 1_000_000).toString()
}

/**
 * Generate and send an OTP to the given worker's phone number.
 * Falls back to console.log when Redis is unavailable (dev/test).
 * Resets the attempt counter so each resend starts a fresh window.
 */
export async function sendOtp(workerId: string, phone: string): Promise<void> {
  const otp = generateOtp()
  const redis = getRedisClient()

  if (redis) {
    await redis.set(`otp:${workerId}`, otp, "EX", OTP_TTL_SEC)
    await redis.del(`otp:attempts:${workerId}`)
  } else {
    console.log(`[OTP:dev] Code for worker ${workerId}: ${otp}`)
  }

  await sendOtpAlimTalk(phone, otp)
}

/**
 * Verify a submitted OTP code.
 *
 * Returns:
 *  - "ok"      — code matched, keys cleaned up
 *  - "wrong"   — code did not match (attempt counted)
 *  - "locked"  — too many failed attempts (>MAX_ATTEMPTS)
 *  - "expired" — OTP not found in Redis (expired or never sent)
 *
 * Throws if Redis is unavailable — verification MUST NOT silently pass in a
 * misconfigured environment (e.g. staging deployed without REDIS_URL).
 * Unlike sendOtp (console fallback is acceptable for dev), bypassing
 * verifyOtp would allow setting isPhoneVerified=true without a real check.
 *
 * Atomicity: INCR is used before the read so the attempt gate is atomic.
 * GETDEL atomically reads-and-deletes the OTP key in one round-trip,
 * preventing a race where two concurrent requests both see the correct OTP
 * before either DEL fires and both return "ok".
 */
export async function verifyOtp(
  workerId: string,
  code: string
): Promise<"ok" | "wrong" | "locked" | "expired"> {
  const redis = getRedisClient()

  // Hard fail if Redis is unavailable — never silently bypass OTP verification.
  if (!redis) {
    throw new Error(
      "OTP verification requires Redis. Set REDIS_URL or REDIS_HOST in your environment."
    )
  }

  // INCR is atomic — gate on attempt count before touching the OTP key
  const attempts = await redis.incr(`otp:attempts:${workerId}`)
  if (attempts > MAX_ATTEMPTS) {
    await redis.expire(`otp:attempts:${workerId}`, OTP_TTL_SEC)
    return "locked"
  }

  // GETDEL atomically reads and deletes the OTP key in one round-trip
  const stored = await redis.getdel(`otp:${workerId}`)
  if (!stored) return "expired"
  if (stored !== code) return "wrong"

  // Success — clean up attempt counter
  await redis.del(`otp:attempts:${workerId}`)
  return "ok"
}
