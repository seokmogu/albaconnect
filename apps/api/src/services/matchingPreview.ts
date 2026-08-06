import { sql } from "drizzle-orm"
import { MATCH_RADIUS_KM } from "@albaconnect/shared"
import { db } from "../db"
import { MATCH_CANDIDATE_POOL_LIMIT } from "./matchingConfig"
import { computeMatchScoreBreakdown, rankWorkers, type MatchScoreBreakdown } from "./scoring"

interface PreviewWorkerRow extends Record<string, unknown> {
  user_id: string
  distance: number
  rating_avg: string
  rating_count: number
  categories: string[]
  last_seen_at: Date | null
  completed_in_category: number
  total_completed: number
  no_show_count: number
  has_schedule_declared: boolean
  total_candidates: string
}

export interface MatchingPreviewWarning {
  code: "NO_CANDIDATES" | "POOL_TRUNCATED" | "NO_AVAILABILITY" | "NO_RECENT_ACTIVITY" | "NO_HISTORY"
  message: string
}

export interface MatchingPreviewCandidate {
  candidateRef: string
  score: number
  scoreBreakdown: MatchScoreBreakdown
  distanceKm: number
  ratingAvg: number
  ratingCount: number
  categoryMatch: boolean
  categories: string[]
  completedJobsInCategory: number
  totalCompletedJobs: number
  noShowCount: number
  activitySignal: "within_24h" | "within_7d" | "stale" | "unknown"
  hasScheduleDeclared: boolean
}

export interface MatchingPreviewResult {
  mode: "read_only"
  generatedAt: string
  job: {
    id: string
    title: string
    category: string
    radiusKm: number
  }
  quality: {
    confidence: "low" | "medium" | "high"
    totalCandidates: number
    evaluatedCandidates: number
    poolTruncated: boolean
    categoryMatchRate: number
    ratedRate: number
    recent7dRate: number
    availabilityDeclaredRate: number
    historyRate: number
  }
  warnings: MatchingPreviewWarning[]
  candidates: MatchingPreviewCandidate[]
}

export class MatchingPreviewJobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`)
    this.name = "MatchingPreviewJobNotFoundError"
  }
}

const percentage = (count: number, total: number) => total === 0 ? 0 : Math.round((count / total) * 1000) / 10

function activitySignal(lastSeenAt: Date | null): MatchingPreviewCandidate["activitySignal"] {
  if (!lastSeenAt) return "unknown"
  const hoursAgo = (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60)
  if (hoursAgo < 24) return "within_24h"
  if (hoursAgo < 168) return "within_7d"
  return "stale"
}

export async function previewJobMatches(jobId: string, requestedLimit = 5): Promise<MatchingPreviewResult> {
  const candidateLimit = Math.min(20, Math.max(1, requestedLimit))
  const jobRows = await db.execute<{
    id: string
    title: string
    category: string
    lat: number
    lng: number
  }>(sql`
    SELECT
      id,
      title,
      category,
      ST_Y(location::geometry) AS lat,
      ST_X(location::geometry) AS lng
    FROM job_postings
    WHERE id = ${jobId}
    LIMIT 1
  `)

  const job = jobRows.rows[0]
  if (!job) throw new MatchingPreviewJobNotFoundError(jobId)

  const radiusMeters = MATCH_RADIUS_KM * 1000
  const workerRows = await db.execute<PreviewWorkerRow>(sql`
    SELECT
      wp.user_id,
      ST_Distance(
        wp.location::geography,
        ST_SetSRID(ST_MakePoint(${job.lng}, ${job.lat}), 4326)::geography
      ) AS distance,
      wp.rating_avg,
      wp.rating_count,
      wp.categories,
      wp.last_seen_at,
      COALESCE(stats.completed_in_category, 0) AS completed_in_category,
      COALESCE(stats.total_completed, 0) AS total_completed,
      COALESCE(stats.no_show_count, 0) AS no_show_count,
      EXISTS(
        SELECT 1 FROM worker_availability wa WHERE wa.worker_id = wp.user_id
      ) AS has_schedule_declared,
      COUNT(*) OVER() AS total_candidates
    FROM worker_profiles wp
    LEFT JOIN (
      SELECT
        ja.worker_id,
        COUNT(*) FILTER (WHERE ja.status = 'completed' AND jp.category = ${job.category}) AS completed_in_category,
        COUNT(*) FILTER (WHERE ja.status = 'completed') AS total_completed,
        COUNT(*) FILTER (WHERE ja.status = 'noshow') AS no_show_count
      FROM job_applications ja
      JOIN job_postings jp ON jp.id = ja.job_id
      GROUP BY ja.worker_id
    ) stats ON stats.worker_id = wp.user_id
    WHERE
      wp.is_available = TRUE
      AND wp.location IS NOT NULL
      AND ST_DWithin(
        wp.location::geography,
        ST_SetSRID(ST_MakePoint(${job.lng}, ${job.lat}), 4326)::geography,
        ${radiusMeters}
      )
      AND NOT EXISTS (
        SELECT 1
        FROM job_applications existing
        WHERE existing.job_id = ${jobId}
          AND existing.worker_id = wp.user_id
          AND existing.status NOT IN ('rejected', 'timeout')
      )
    ORDER BY (${job.category} = ANY(wp.categories)) DESC, distance ASC, wp.rating_avg DESC
    LIMIT ${MATCH_CANDIDATE_POOL_LIMIT}
  `)

  const totalCandidates = Number(workerRows.rows[0]?.total_candidates ?? 0)
  const evaluatedCandidates = workerRows.rows.length
  const normalizedWorkers = workerRows.rows.map((row) => ({
    userId: row.user_id,
    distance: Number(row.distance),
    ratingAvg: Number(row.rating_avg),
    ratingCount: Number(row.rating_count),
    categories: row.categories ?? [],
    lastSeenAt: row.last_seen_at,
    completedJobsInCategory: Number(row.completed_in_category),
    totalCompletedJobs: Number(row.total_completed),
    noShowCount: Number(row.no_show_count),
    hasScheduleDeclared: Boolean(row.has_schedule_declared),
  }))

  const categoryMatches = normalizedWorkers.filter((worker) => worker.categories.includes(job.category)).length
  const ratedWorkers = normalizedWorkers.filter((worker) => worker.ratingCount > 0).length
  const recentWorkers = normalizedWorkers.filter((worker) => {
    const signal = activitySignal(worker.lastSeenAt)
    return signal === "within_24h" || signal === "within_7d"
  }).length
  const workersWithAvailability = normalizedWorkers.filter((worker) => worker.hasScheduleDeclared).length
  const workersWithHistory = normalizedWorkers.filter((worker) => worker.totalCompletedJobs + worker.noShowCount > 0).length
  const poolTruncated = totalCandidates > evaluatedCandidates

  const availabilityDeclaredRate = percentage(workersWithAvailability, evaluatedCandidates)
  const recent7dRate = percentage(recentWorkers, evaluatedCandidates)
  const historyRate = percentage(workersWithHistory, evaluatedCandidates)
  const warnings: MatchingPreviewWarning[] = []

  if (totalCandidates === 0) {
    warnings.push({ code: "NO_CANDIDATES", message: "반경 안에 매칭 가능한 후보가 없습니다." })
  }
  if (poolTruncated) {
    warnings.push({ code: "POOL_TRUNCATED", message: `후보가 ${MATCH_CANDIDATE_POOL_LIMIT.toLocaleString()}명을 넘어 일부만 평가했습니다.` })
  }
  if (totalCandidates > 0 && availabilityDeclaredRate === 0) {
    warnings.push({ code: "NO_AVAILABILITY", message: "근무 가능 시간 데이터가 없어 일정 적합도를 중립값으로 계산했습니다." })
  }
  if (totalCandidates > 0 && recent7dRate === 0) {
    warnings.push({ code: "NO_RECENT_ACTIVITY", message: "최근 7일 활동 데이터가 없어 활동 점수로 후보를 구분할 수 없습니다." })
  }
  if (totalCandidates > 0 && historyRate === 0) {
    warnings.push({ code: "NO_HISTORY", message: "완료·노쇼 이력이 없어 신뢰도 점수를 중립값으로 계산했습니다." })
  }

  const missingSignals = [availabilityDeclaredRate, recent7dRate, historyRate].filter((rate) => rate === 0).length
  const confidence: MatchingPreviewResult["quality"]["confidence"] = totalCandidates === 0 || missingSignals >= 2
    ? "low"
    : missingSignals === 1 || poolTruncated
      ? "medium"
      : "high"

  const ranked = rankWorkers(normalizedWorkers, job.category, radiusMeters).slice(0, candidateLimit)
  const candidates = ranked.map((worker, index): MatchingPreviewCandidate => {
    const scoreBreakdown = computeMatchScoreBreakdown({
      distanceMeters: worker.distance,
      ratingAvg: worker.ratingAvg,
      ratingCount: worker.ratingCount,
      workerCategories: worker.categories,
      jobCategory: job.category,
      lastSeenAt: worker.lastSeenAt,
      matchRadius: radiusMeters,
      completedJobsInCategory: worker.completedJobsInCategory,
      totalCompletedJobs: worker.totalCompletedJobs,
      noShowCount: worker.noShowCount,
      hasScheduleDeclared: worker.hasScheduleDeclared,
    })

    return {
      candidateRef: `후보 ${String(index + 1).padStart(2, "0")}`,
      score: worker.score,
      scoreBreakdown,
      distanceKm: Math.round((worker.distance / 1000) * 10) / 10,
      ratingAvg: worker.ratingAvg,
      ratingCount: worker.ratingCount,
      categoryMatch: worker.categories.includes(job.category),
      categories: worker.categories,
      completedJobsInCategory: worker.completedJobsInCategory,
      totalCompletedJobs: worker.totalCompletedJobs,
      noShowCount: worker.noShowCount,
      activitySignal: activitySignal(worker.lastSeenAt),
      hasScheduleDeclared: worker.hasScheduleDeclared,
    }
  })

  return {
    mode: "read_only",
    generatedAt: new Date().toISOString(),
    job: { id: job.id, title: job.title, category: job.category, radiusKm: MATCH_RADIUS_KM },
    quality: {
      confidence,
      totalCandidates,
      evaluatedCandidates,
      poolTruncated,
      categoryMatchRate: percentage(categoryMatches, evaluatedCandidates),
      ratedRate: percentage(ratedWorkers, evaluatedCandidates),
      recent7dRate,
      availabilityDeclaredRate,
      historyRate,
    },
    warnings,
    candidates,
  }
}
