/**
 * Employer plan tier definitions and limit enforcement.
 * Tiers: free (3 active jobs), basic (20 active jobs), premium (unlimited).
 */

export type PlanTier = "free" | "basic" | "premium"

export const PLAN_LIMITS: Record<PlanTier, number | null> = {
  free: 3,
  basic: 20,
  premium: null, // unlimited
}

export const PLAN_UPGRADE_URL = "/employer/upgrade"

/**
 * Returns the job limit for the given tier, or null if unlimited.
 */
export function getPlanJobLimit(tier: PlanTier): number | null {
  const limit = PLAN_LIMITS[tier]
  // Use undefined check (not ??), since null is a valid value meaning "unlimited"
  return limit !== undefined ? limit : (PLAN_LIMITS.free ?? 3)
}

/**
 * Checks whether an employer has reached their active job limit.
 * Returns { allowed: true } or { allowed: false, current, limit, tier }.
 */
export function checkPlanLimit(
  tier: PlanTier,
  activeJobCount: number
): { allowed: true } | { allowed: false; current: number; limit: number; tier: PlanTier } {
  const limit = getPlanJobLimit(tier)
  if (limit === null) return { allowed: true }
  if (activeJobCount >= limit) {
    return { allowed: false, current: activeJobCount, limit, tier }
  }
  return { allowed: true }
}
