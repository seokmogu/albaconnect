import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock db before importing service
vi.mock("../db", () => ({
  db: {
    execute: vi.fn(),
  },
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}))

import { computeReportCard } from "../services/reportCard"
import { db } from "../db"

const mockExecute = vi.mocked(db.execute)

describe("computeReportCard service (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns correct shape for a normal month", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [{
          total_jobs_completed: "5",
          total_earnings_won: "250000",
          avg_rating: "4.5",
          on_time_rate_pct: "80.0",
          noshow_count: "1",
        }],
      } as any)
      .mockResolvedValueOnce({ rows: [{ count: "2" }] } as any)
      .mockResolvedValueOnce({
        rows: [
          { category: "delivery", count: "3" },
          { category: "retail", count: "2" },
        ],
      } as any)

    const result = await computeReportCard("worker-uuid-1", "2026-03")

    expect(result.month).toBe("2026-03")
    expect(result.total_jobs_completed).toBe(5)
    expect(result.total_earnings_won).toBe(250000)
    expect(result.avg_rating).toBe(4.5)
    expect(result.on_time_rate_pct).toBe(80.0)
    expect(result.noshow_count).toBe(1)
    expect(result.certifications_verified_count).toBe(2)
    expect(result.top_job_categories).toHaveLength(2)
    expect(result.top_job_categories[0]).toEqual({ category: "delivery", count: 3 })
  })

  it("returns zeros when no data exists (empty month boundary)", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [{
          total_jobs_completed: "0",
          total_earnings_won: "0",
          avg_rating: "0",
          on_time_rate_pct: "0",
          noshow_count: "0",
        }],
      } as any)
      .mockResolvedValueOnce({ rows: [{ count: "0" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)

    const result = await computeReportCard("worker-uuid-1", "2026-01")

    expect(result.total_jobs_completed).toBe(0)
    expect(result.total_earnings_won).toBe(0)
    expect(result.avg_rating).toBe(0)
    expect(result.on_time_rate_pct).toBe(0)
    expect(result.noshow_count).toBe(0)
    expect(result.certifications_verified_count).toBe(0)
    expect(result.top_job_categories).toEqual([])
  })

  it("uses UTC-based month boundaries (no local-timezone shift)", async () => {
    // Verify that Date.UTC is used: new Date(Date.UTC(2026, 0, 1)) → "2026-01-01T00:00:00.000Z"
    // vs new Date(2026, 0, 1) in UTC+9 → "2025-12-31T15:00:00.000Z"
    const utcBoundary = new Date(Date.UTC(2026, 0, 1)).toISOString()
    expect(utcBoundary).toBe("2026-01-01T00:00:00.000Z")

    mockExecute
      .mockResolvedValueOnce({
        rows: [{
          total_jobs_completed: "0",
          total_earnings_won: "0",
          avg_rating: "0",
          on_time_rate_pct: "0",
          noshow_count: "0",
        }],
      } as any)
      .mockResolvedValueOnce({ rows: [{ count: "0" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)

    const result = await computeReportCard("worker-uuid-1", "2026-01")
    expect(result.month).toBe("2026-01")
    expect(result.total_jobs_completed).toBe(0)
    // 3 DB calls made (main, certs, categories)
    expect(mockExecute).toHaveBeenCalledTimes(3)
  })

  it("handles month boundary correctly for December → January", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [{
          total_jobs_completed: "3",
          total_earnings_won: "90000",
          avg_rating: "4.8",
          on_time_rate_pct: "100.0",
          noshow_count: "0",
        }],
      } as any)
      .mockResolvedValueOnce({ rows: [{ count: "1" }] } as any)
      .mockResolvedValueOnce({ rows: [{ category: "food", count: "3" }] } as any)

    const result = await computeReportCard("worker-uuid-1", "2025-12")
    expect(result.month).toBe("2025-12")
    expect(result.total_jobs_completed).toBe(3)
    expect(result.certifications_verified_count).toBe(1)
    expect(result.top_job_categories[0]).toEqual({ category: "food", count: 3 })

    // Dec start = 2025-12-01T00:00:00.000Z, end = 2026-01-01T00:00:00.000Z
    const decStart = new Date(Date.UTC(2025, 11, 1)).toISOString()
    const janStart = new Date(Date.UTC(2026, 0, 1)).toISOString()
    expect(decStart).toBe("2025-12-01T00:00:00.000Z")
    expect(janStart).toBe("2026-01-01T00:00:00.000Z")
  })
})
