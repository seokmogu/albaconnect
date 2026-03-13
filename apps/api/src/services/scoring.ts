/**
 * AlbaConnect Matching Score Calculator
 *
 * Scoring formula (0–100):
 *   - Distance score    (35%): closer = higher
 *   - Rating score      (25%): higher avg rating = higher
 *   - Skill/category    (20%): category match + experience in category
 *   - Reliability score (15%): completion rate, no-show penalty
 *   - Activity score     (5%): recently active = higher
 */

export interface ScoringInput {
  distanceMeters: number
  ratingAvg: number
  ratingCount: number
  workerCategories: string[]
  jobCategory: string
  lastSeenAt?: Date | null
  matchRadius: number // meters
  /** Number of completed jobs in this exact category */
  completedJobsInCategory?: number
  /** Total completed jobs across all categories */
  totalCompletedJobs?: number
  /** Number of no-show events in job history */
  noShowCount?: number
  /** Whether worker has any schedule declared (from worker_availability table) */
  hasScheduleDeclared?: boolean
}

export function computeMatchScore(input: ScoringInput): number {
  const {
    distanceMeters,
    ratingAvg,
    ratingCount,
    workerCategories,
    jobCategory,
    lastSeenAt,
    matchRadius,
    completedJobsInCategory = 0,
    totalCompletedJobs = 0,
    noShowCount = 0,
    hasScheduleDeclared = false,
  } = input

  // ── Distance score (32 pts) — linear decay from matchRadius to 0 ──
  const distanceScore = Math.max(0, (1 - distanceMeters / matchRadius)) * 32

  // ── Rating score (23 pts) ──
  // No ratings: neutral baseline. Rating 5.0: 23 pts; Rating 1.0: 5 pts
  const ratingScore = ratingCount > 0
    ? ((Number(ratingAvg) - 1) / 4) * 18 + 5
    : 11.5

  // ── Skill / category score (18 pts) ──
  // Category match (10 pts) + experience in category (8 pts, log-scale)
  const hasCategory = workerCategories.includes(jobCategory)
  const categoryMatchScore = hasCategory ? 10 : 0
  // log(1) = 0, log(2) ≈ 0.69, log(11) ≈ 2.4 → scale to max 8 pts at ~10 jobs
  const experienceScore = completedJobsInCategory > 0
    ? Math.min(8, (Math.log(completedJobsInCategory + 1) / Math.log(11)) * 8)
    : 0
  const skillScore = categoryMatchScore + experienceScore

  // ── Reliability score (13 pts) ──
  // Based on completion rate and no-show penalty
  const totalJobs = totalCompletedJobs + noShowCount
  let reliabilityScore = 6.5 // neutral when no history
  if (totalJobs > 0) {
    const completionRate = totalCompletedJobs / totalJobs
    reliabilityScore = completionRate * 13
  }
  // Additional no-show penalty: each no-show reduces score by 1 pt (max -4)
  const noShowPenalty = Math.min(4, noShowCount)
  const finalReliabilityScore = Math.max(0, reliabilityScore - noShowPenalty)

  // ── Activity score (6 pts) — last seen ──
  let activityScore = 1
  if (lastSeenAt) {
    const hoursAgo = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60)
    if (hoursAgo < 1) activityScore = 6
    else if (hoursAgo < 24) activityScore = 5
    else if (hoursAgo < 168) activityScore = 3
    else activityScore = 1
  }

  const availabilityScore = hasScheduleDeclared ? 8 : 4

  const total = distanceScore + ratingScore + skillScore + finalReliabilityScore + activityScore + availabilityScore
  return Math.round(total * 10) / 10
}

/**
 * Sort worker candidates by composite score (highest first)
 */
export function rankWorkers<T extends {
  distance: number
  ratingAvg: number
  ratingCount: number
  categories: string[]
  lastSeenAt: Date | null
  completedJobsInCategory?: number
  totalCompletedJobs?: number
  noShowCount?: number
  hasScheduleDeclared?: boolean
}>(
  workers: T[],
  jobCategory: string,
  matchRadiusMeters: number
): (T & { score: number })[] {
  return workers
    .map(w => ({
      ...w,
      score: computeMatchScore({
        distanceMeters: w.distance,
        ratingAvg: Number(w.ratingAvg),
        ratingCount: w.ratingCount,
        workerCategories: w.categories ?? [],
        jobCategory,
        lastSeenAt: w.lastSeenAt,
        matchRadius: matchRadiusMeters,
        completedJobsInCategory: w.completedJobsInCategory ?? 0,
        totalCompletedJobs: w.totalCompletedJobs ?? 0,
        noShowCount: w.noShowCount ?? 0,
        hasScheduleDeclared: w.hasScheduleDeclared ?? false,
      }),
    }))
    .sort((a, b) => b.score - a.score)
}
