import { db } from "../db"
import { sql } from "drizzle-orm"

export interface ReportCardData {
  month: string
  total_jobs_completed: number
  total_earnings_won: number
  avg_rating: number
  on_time_rate_pct: number
  noshow_count: number
  certifications_verified_count: number
  top_job_categories: Array<{ category: string; count: number }>
}

export async function computeReportCard(workerId: string, month: string): Promise<ReportCardData> {
  const [year, mon] = month.split("-").map(Number)
  // Use UTC-based dates to avoid local-timezone boundary shift
  const startDate = new Date(Date.UTC(year, mon - 1, 1))
  const endDate = new Date(Date.UTC(year, mon, 1))

  const mainResult = await db.execute<{
    total_jobs_completed: string
    total_earnings_won: string
    avg_rating: string
    on_time_rate_pct: string
    noshow_count: string
  }>(sql`
    SELECT
      COUNT(ja.id) FILTER (WHERE ja.status = 'completed') AS total_jobs_completed,
      COALESCE(SUM(jp.total_amount) FILTER (WHERE ja.status = 'completed'), 0) AS total_earnings_won,
      COALESCE(AVG(r.rating), 0) AS avg_rating,
      COALESCE(
        COUNT(ja.id) FILTER (WHERE ja.status = 'completed' AND ja.checkin_at IS NOT NULL AND ja.checkin_at <= jp.start_at + INTERVAL '15 minutes')
        * 100.0
        / NULLIF(COUNT(ja.id) FILTER (WHERE ja.status = 'completed' AND ja.checkin_at IS NOT NULL), 0),
        0
      ) AS on_time_rate_pct,
      COUNT(ja.id) FILTER (WHERE ja.status = 'noshow') AS noshow_count
    FROM job_applications ja
    JOIN job_postings jp ON jp.id = ja.job_id
    LEFT JOIN reviews r ON r.reviewee_id = ${workerId}::uuid AND r.job_id = ja.job_id
    WHERE ja.worker_id = ${workerId}::uuid
      AND jp.start_at >= ${startDate.toISOString()}::timestamptz
      AND jp.start_at < ${endDate.toISOString()}::timestamptz
  `)

  const main = mainResult.rows[0] ?? {}

  const certResult = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) AS count FROM worker_certifications
    WHERE worker_id = ${workerId}::uuid AND status = 'verified'
  `)
  const certsCount = parseInt(certResult.rows[0]?.count ?? "0", 10)

  const catResult = await db.execute<{ category: string; count: string }>(sql`
    SELECT jp.category, COUNT(ja.id) AS count
    FROM job_applications ja
    JOIN job_postings jp ON jp.id = ja.job_id
    WHERE ja.worker_id = ${workerId}::uuid
      AND ja.status = 'completed'
      AND jp.start_at >= ${startDate.toISOString()}::timestamptz
      AND jp.start_at < ${endDate.toISOString()}::timestamptz
    GROUP BY jp.category
    ORDER BY count DESC
    LIMIT 3
  `)

  return {
    month,
    total_jobs_completed: parseInt(main.total_jobs_completed ?? "0", 10),
    total_earnings_won: parseInt(main.total_earnings_won ?? "0", 10),
    avg_rating: parseFloat(parseFloat(main.avg_rating ?? "0").toFixed(2)),
    on_time_rate_pct: parseFloat(parseFloat(main.on_time_rate_pct ?? "0").toFixed(1)),
    noshow_count: parseInt(main.noshow_count ?? "0", 10),
    certifications_verified_count: certsCount,
    top_job_categories: catResult.rows.map(r => ({ category: r.category, count: parseInt(r.count, 10) })),
  }
}
