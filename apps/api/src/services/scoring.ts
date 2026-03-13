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
  } = input

  // ── Distance score (35 pts) — linear decay from matchRadius to 0 ──
  const distanceScore = Math.max(0, (1 - distanceMeters / matchRadius)) * 35

  // ── Rating score (25 pts) ──
  // No ratings: neutral (12.5 pts). Rating 5.0: 25 pts; Rating 1.0: 5 pts
  const ratingScore = ratingCount > 0
    ? ((Number(ratingAvg) - 1) / 4) * 20 + 5
    : 12.5

  // ── Skill / category score (20 pts) ──
  // Category match (12 pts) + experience in category (8 pts, log-scale)
  const hasCategory = workerCategories.includes(jobCategory)
  const categoryMatchScore = hasCategory ? 12 : 0
  // log(1) = 0, log(2) ≈ 0.69, log(11) ≈ 2.4 → scale to max 8 pts at ~10 jobs
  const experienceScore = completedJobsInCategory > 0
    ? Math.min(8, (Math.log(completedJobsInCategory + 1) / Math.log(11)) * 8)
    : 0
  const skillScore = categoryMatchScore + experienceScore

  // ── Reliability score (15 pts) ──
  // Based on completion rate and no-show penalty
  const totalJobs = totalCompletedJobs + noShowCount
  let reliabilityScore = 7.5 // neutral when no history
  if (totalJobs > 0) {
    const completionRate = totalCompletedJobs / totalJobs
    // Scale: 100% completion → 15 pts, 50% → 7.5 pts, 0% → 0 pts
    reliabilityScore = completionRate * 15
  }
  // Additional no-show penalty: each no-show reduces score by 1 pt (max -5)
  const noShowPenalty = Math.min(5, noShowCount)
  const finalReliabilityScore = Math.max(0, reliabilityScore - noShowPenalty)

  // ── Activity score (5 pts) — last seen ──
  let activityScore = 0
  if (lastSeenAt) {
    const hoursAgo = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60)
    if (hoursAgo < 1) activityScore = 5
    else if (hoursAgo < 24) activityScore = 4
    else if (hoursAgo < 168) activityScore = 2
    else activityScore = 0.5
  }

  const total = distanceScore + ratingScore + skillScore + finalReliabilityScore + activityScore
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
      }),
    }))
    .sort((a, b) => b.score - a.score)
}
