/**
 * AlbaConnect Matching Score Calculator
 *
 * Scoring formula (0–100):
 *   - Distance score (40%): closer = higher
 *   - Rating score   (25%): higher avg rating = higher
 *   - Category match (20%): worker's categories include job category
 *   - Activity score (15%): recently active = higher
 */

export interface ScoringInput {
  distanceMeters: number
  ratingAvg: number
  ratingCount: number
  workerCategories: string[]
  jobCategory: string
  lastSeenAt?: Date | null
  matchRadius: number // meters
}

export function computeMatchScore(input: ScoringInput): number {
  const { distanceMeters, ratingAvg, ratingCount, workerCategories, jobCategory, lastSeenAt, matchRadius } = input

  // Distance score (40 pts) — linear decay from matchRadius to 0
  const distanceScore = Math.max(0, (1 - distanceMeters / matchRadius)) * 40

  // Rating score (25 pts)
  // - No ratings: neutral (12.5 pts)
  // - Rating 5.0: 25pts; Rating 1.0: 5pts
  const ratingScore = ratingCount > 0
    ? ((Number(ratingAvg) - 1) / 4) * 20 + 5
    : 12.5

  // Category match (20 pts)
  const categoryScore = workerCategories.includes(jobCategory) ? 20 : 0

  // Activity score (15 pts) — last seen within 24h: 15pts, within 7d: 7pts, older: 0
  let activityScore = 0
  if (lastSeenAt) {
    const hoursAgo = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60)
    if (hoursAgo < 1) activityScore = 15
    else if (hoursAgo < 24) activityScore = 12
    else if (hoursAgo < 168) activityScore = 7
    else activityScore = 2
  }

  const total = distanceScore + ratingScore + categoryScore + activityScore
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
      }),
    }))
    .sort((a, b) => b.score - a.score)
}
