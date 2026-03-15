import { describe, it, expect, vi, beforeEach } from "vitest"
import Fastify from "fastify"
import { workerRoutes } from "../routes/workers"

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn((req, _rep, done) => { req.user = { id: "worker-uuid-1", role: "worker" }; done() }),
  requireWorker: vi.fn((req, _rep, done) => { req.user = { id: "worker-uuid-1", role: "worker" }; done() }),
  requireAdmin: vi.fn((req, _rep, done) => { req.user = { id: "admin-uuid-1", role: "admin" }; done() }),
  requireEmployer: vi.fn((req, _rep, done) => { req.user = { id: "employer-uuid-1", role: "employer" }; done() }),
}))

vi.mock("../services/reportCard", () => ({
  computeReportCard: vi.fn(),
}))

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>()
  return {
    ...actual,
    db: {
      execute: vi.fn().mockResolvedValue({ rows: [{ name: "Test Worker" }] }),
      select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    },
    sql: actual.sql,
  }
})

// pdfkit mock: regular function (not arrow) so `new PDFDocument()` works;
// fires 'end' event when doc.end() is called so buffer Promise resolves
vi.mock("pdfkit", () => {
  const MockPDFDocument = vi.fn(function PDFDocumentMock(
    this: Record<string, unknown>
  ) {
    const callbacks: Record<string, Array<(...args: unknown[]) => void>> = {}
    const self = this
    self.pipe = vi.fn().mockReturnThis()
    self.end = vi.fn(function () {
      ;(callbacks["end"] ?? []).forEach((cb) => cb())
    })
    self.text = vi.fn().mockReturnThis()
    self.font = vi.fn().mockReturnThis()
    self.fontSize = vi.fn().mockReturnThis()
    self.moveDown = vi.fn().mockReturnThis()
    self.rect = vi.fn().mockReturnThis()
    self.fill = vi.fn().mockReturnThis()
    self.on = vi.fn(function (event: string, cb: (...args: unknown[]) => void) {
      if (!callbacks[event]) callbacks[event] = []
      callbacks[event].push(cb)
      return self
    })
  })
  return { default: MockPDFDocument }
})

vi.mock("../services/matching", () => ({ dispatchJob: vi.fn() }))
vi.mock("../services/cache", () => ({
  workerProfileCache: new Map(),
  recommendedJobsCache: new Map(),
  earningsCache: new Map(),
  cacheGetL2: vi.fn().mockResolvedValue(null),
  cacheSetL2: vi.fn().mockResolvedValue(undefined),
  cacheDelL2: vi.fn().mockResolvedValue(undefined),
  CACHE_TTL: { profile: 60, earnings: 300 },
}))
vi.mock("../services/scoring", () => ({ computeMatchScore: vi.fn().mockReturnValue(0.5) }))
vi.mock("../services/otpService.js", () => ({ sendOtp: vi.fn(), verifyOtp: vi.fn() }))

import { computeReportCard } from "../services/reportCard"

const mockComputeReportCard = vi.mocked(computeReportCard)

function buildApp() {
  const app = Fastify()
  app.register(workerRoutes)
  return app
}

describe("Report Card", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns report card JSON with correct shape", async () => {
    const mockData = {
      month: "2026-03",
      total_jobs_completed: 5,
      total_earnings_won: 250000,
      avg_rating: 4.5,
      on_time_rate_pct: 80.0,
      noshow_count: 0,
      certifications_verified_count: 2,
      top_job_categories: [
        { category: "delivery", count: 3 },
        { category: "retail", count: 2 },
      ],
    }
    mockComputeReportCard.mockResolvedValue(mockData)

    const app = buildApp()
    const res = await app.inject({ method: "GET", url: "/workers/me/report-card?month=2026-03" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty("total_jobs_completed", 5)
    expect(body).toHaveProperty("total_earnings_won", 250000)
    expect(body).toHaveProperty("avg_rating", 4.5)
    expect(body).toHaveProperty("on_time_rate_pct", 80.0)
    expect(body).toHaveProperty("noshow_count", 0)
    expect(body).toHaveProperty("certifications_verified_count", 2)
    expect(body).toHaveProperty("top_job_categories")
    expect(body.top_job_categories).toHaveLength(2)
    expect(body).toHaveProperty("month", "2026-03")
  })

  it("on_time_rate_pct is 0 when no checkins exist (zero data)", async () => {
    mockComputeReportCard.mockResolvedValue({
      month: "2026-01",
      total_jobs_completed: 0,
      total_earnings_won: 0,
      avg_rating: 0,
      on_time_rate_pct: 0,
      noshow_count: 0,
      certifications_verified_count: 0,
      top_job_categories: [],
    })

    const app = buildApp()
    const res = await app.inject({ method: "GET", url: "/workers/me/report-card?month=2026-01" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.on_time_rate_pct).toBe(0)
    expect(body.total_jobs_completed).toBe(0)
    expect(body.total_earnings_won).toBe(0)
  })

  it("returns zeros for a month with no job activity", async () => {
    mockComputeReportCard.mockResolvedValue({
      month: "2026-02",
      total_jobs_completed: 0,
      total_earnings_won: 0,
      avg_rating: 0,
      on_time_rate_pct: 0,
      noshow_count: 0,
      certifications_verified_count: 0,
      top_job_categories: [],
    })

    const app = buildApp()
    const res = await app.inject({ method: "GET", url: "/workers/me/report-card?month=2026-02" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total_jobs_completed).toBe(0)
    expect(body.total_earnings_won).toBe(0)
    expect(body.on_time_rate_pct).toBe(0)
    expect(body.top_job_categories).toEqual([])
  })

  it("returns 400 for invalid month format", async () => {
    const app = buildApp()
    const res1 = await app.inject({ method: "GET", url: "/workers/me/report-card?month=2026-13" })
    expect(res1.statusCode).toBe(400)
    expect(res1.json()).toHaveProperty("error")

    const res2 = await app.inject({ method: "GET", url: "/workers/me/report-card?month=26-03" })
    expect(res2.statusCode).toBe(400)

    const res3 = await app.inject({ method: "GET", url: "/workers/me/report-card/pdf?month=bad-format" })
    expect(res3.statusCode).toBe(400)
  })

  it("PDF endpoint returns application/pdf content-type", async () => {
    mockComputeReportCard.mockResolvedValue({
      month: "2026-03",
      total_jobs_completed: 3,
      total_earnings_won: 150000,
      avg_rating: 4.2,
      on_time_rate_pct: 66.7,
      noshow_count: 1,
      certifications_verified_count: 1,
      top_job_categories: [{ category: "delivery", count: 3 }],
    })

    const { db } = await import("../db")
    vi.mocked(db.execute)
      .mockResolvedValueOnce({ rows: [{ name: "Test Worker" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)

    const app = buildApp()
    const res = await app.inject({ method: "GET", url: "/workers/me/report-card/pdf?month=2026-03" })
    expect(res.statusCode, `PDF route 500 body: ${res.body}`).toBe(200)
    expect(res.headers["content-type"]).toMatch(/application\/pdf/)
  })
})
