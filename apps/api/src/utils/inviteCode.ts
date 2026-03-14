import { randomBytes } from "node:crypto"

/**
 * Generate a URL-safe 8-character invite code.
 * Uses 6 bytes (48 bits) of entropy → base64url → 8 chars.
 * Collision probability is negligible at typical user scales.
 */
export function generateInviteCode(): string {
  return randomBytes(6).toString("base64url").slice(0, 8)
}
