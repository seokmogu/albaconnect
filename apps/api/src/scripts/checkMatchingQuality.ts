import "dotenv/config"
import { sql } from "drizzle-orm"
import { db, pool } from "../db"
import { previewJobMatches } from "../services/matchingPreview"

const requestedSampleSize = Number(process.env.MATCHING_SAMPLE_LIMIT ?? 20)
const sampleSize = Number.isFinite(requestedSampleSize)
  ? Math.min(100, Math.max(1, Math.floor(requestedSampleSize)))
  : 20

const average = (values: number[]) => values.length === 0
  ? 0
  : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10

async function main() {
  const jobs = await db.execute<{ id: string; start_at: Date }>(sql`
    SELECT id, start_at
    FROM job_postings
    WHERE status = 'open' AND location IS NOT NULL
    ORDER BY created_at DESC
    LIMIT ${sampleSize}
  `)

  const previews = []
  for (const job of jobs.rows) {
    previews.push(await previewJobMatches(job.id, 5))
  }

  const warningCounts: Record<string, number> = {}
  const confidenceCounts = { low: 0, medium: 0, high: 0 }
  for (const preview of previews) {
    confidenceCounts[preview.quality.confidence] += 1
    for (const warning of preview.warnings) {
      warningCounts[warning.code] = (warningCounts[warning.code] ?? 0) + 1
    }
  }

  console.log(JSON.stringify({
    mode: "read_only",
    sampledJobs: previews.length,
    pastStartJobs: jobs.rows.filter((job) => new Date(job.start_at).getTime() < Date.now()).length,
    zeroCandidateJobs: previews.filter((preview) => preview.quality.totalCandidates === 0).length,
    candidatePool: {
      average: average(previews.map((preview) => preview.quality.totalCandidates)),
      min: previews.length === 0 ? 0 : Math.min(...previews.map((preview) => preview.quality.totalCandidates)),
      max: previews.length === 0 ? 0 : Math.max(...previews.map((preview) => preview.quality.totalCandidates)),
    },
    averageTopScore: average(previews.flatMap((preview) => preview.candidates.slice(0, 1).map((candidate) => candidate.score))),
    averageTop5CategoryMatchRate: average(previews.map((preview) => {
      const topCandidates = preview.candidates.slice(0, 5)
      const matched = topCandidates.filter((candidate) => candidate.categoryMatch).length
      return topCandidates.length === 0 ? 0 : (matched / topCandidates.length) * 100
    })),
    averageCategoryMatchRate: average(previews.map((preview) => preview.quality.categoryMatchRate)),
    averageRatedRate: average(previews.map((preview) => preview.quality.ratedRate)),
    averageRecent7dRate: average(previews.map((preview) => preview.quality.recent7dRate)),
    averageAvailabilityDeclaredRate: average(previews.map((preview) => preview.quality.availabilityDeclaredRate)),
    averageHistoryRate: average(previews.map((preview) => preview.quality.historyRate)),
    confidenceCounts,
    warningCounts,
  }, null, 2))
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
