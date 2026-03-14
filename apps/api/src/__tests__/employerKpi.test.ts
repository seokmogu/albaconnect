/**
 * Employer KPI dashboard — unit tests
 * Covers GET /api/employer/dashboard/kpi and GET /api/employer/jobs/:id/analytics
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"

// ── Mocks (hoisted) ───────────────────────────────────────────────────────────
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }))
const { mockGet, mockSet } = vi.hoisted(() => ({
  mockGet: vi.fn().mockResolvedValue(null),
  mockSet: vi.fn().mockResolvedValue("OK"),
}))

vi.mock("../db", () => ({
  db: {
    execute: mockExecute,
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
  },
  users: {}, employerProfiles: {}, jobPostings: {}, jobApplications: {},
  eq: vi.fn(),
}))

vi.mock("../lib/redis", () => ({
  getRedisClient: vi.fn(() => ({ get: mockGet, set: mockSet })),
}))

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn(),
  requireEmployer: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
type Handler = (req: any, reply: any) => Promise<void>

function buildAppStub() {
  const routes: Record<string, Handler> = {}
  const app = {
    get:    (path: string, _opts: any, handler: Handler) => { routes[`GET:${path}`] = handler },
    post:   (path: string, _opts: any, handler: Handler) => { routes[`POST:${path}`] = handler },
    put:    (path: string, _opts: any, handler: Handler) => { routes[`PUT:${path}`] = handler },
    delete: (path: string, _opts: any, handler: Handler) => { routes[`DELETE:${path}`] = handler },
    decorateRequest: vi.fn(),
    addHook: vi.fn(),
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }
  return { app: app as any, routes }
}

function makeReq(params: Record<string, string> = {}) {
  return { user: { id: "emp-1" }, query: {}, params }
}

function makeReply() {
  const r = { _code: 200, _body: undefined as any }
  const rr = r as any
  rr.status = (c: number) => { r._code = c; return rr }
  rr.send   = (b: any)    => { r._body = b; return rr }
  return rr
}

import { employerRoutes } from "../routes/employer"

let routes: Record<string, Handler>

beforeAll(async () => {
  const stub = buildAppStub()
  await employerRoutes(stub.app)
  routes = stub.routes
})

// ── KPI endpoint tests ────────────────────────────────────────────────────────
describe("GET /api/employer/dashboard/kpi", () => {
  beforeEach(() => { vi.clearAllMocks(); mockGet.mockResolvedValue(null) })

  it("returns KPI aggregation with correct fill_rate and noshow_rate", async () => {
    mockExecute
      // agg (total_jobs=10, filled=8, accepted=20, noshow=2, budget=500000)
      .mockResolvedValueOnce({ rows: [{ total_jobs: "10", filled_jobs: "8", accepted_apps: "20", noshow_apps: "2", total_budget_spent: "500000" }] })
      // time-to-match avg
      .mockResolvedValueOnce({ rows: [{ avg_hours: "1.5" }] })
      // avg worker rating
      .mockResolvedValueOnce({ rows: [{ avg_rating: "4.2" }] })
      // open disputes
      .mockResolvedValueOnce({ rows: [{ open_count: "3" }] })

    const reply = makeReply()
    await routes["GET:/api/employer/dashboard/kpi"](makeReq(), reply)

    expect(reply._body.total_jobs).toBe(10)
    expect(reply._body.total_budget_spent).toBe(500000)
    expect(reply._body.fill_rate_pct).toBe(80)
    expect(reply._body.noshow_rate_pct).toBe(10)
    expect(reply._body.avg_time_to_match_hours).toBe(1.5)
    expect(reply._body.avg_worker_rating).toBe(4.2)
    expect(reply._body.open_dispute_count).toBe(3)
  })

  it("returns cached result without hitting DB on cache hit", async () => {
    const cachedKpi = { total_jobs: 5, fill_rate_pct: 60, cached: true }
    mockGet.mockResolvedValue(JSON.stringify(cachedKpi))

    const reply = makeReply()
    await routes["GET:/api/employer/dashboard/kpi"](makeReq(), reply)

    expect(reply._body.total_jobs).toBe(5)
    expect(reply._body.fill_rate_pct).toBe(60)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it("returns zeros gracefully when employer has no jobs", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ total_jobs: "0", filled_jobs: "0", accepted_apps: "0", noshow_apps: "0", total_budget_spent: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ open_count: "0" }] })

    const reply = makeReply()
    await routes["GET:/api/employer/dashboard/kpi"](makeReq(), reply)

    expect(reply._body.fill_rate_pct).toBe(0)
    expect(reply._body.noshow_rate_pct).toBe(0)
    expect(reply._body.avg_worker_rating).toBe(0)
    expect(reply._body.open_dispute_count).toBe(0)
  })
})

// ── Per-job analytics tests ───────────────────────────────────────────────────
describe("GET /api/employer/jobs/:id/analytics", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 404 when job not owned by employer", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] })

    const reply = makeReply()
    await routes["GET:/api/employer/jobs/:id/analytics"](makeReq({ id: "no-job" }), reply)
    expect(reply._code).toBe(404)
  })

  it("returns per-job analytics with dispute_count, escrow_status, payout_status, ratings", async () => {
    mockExecute
      // job ownership
      .mockResolvedValueOnce({ rows: [{ id: "j1", status: "completed", escrow_status: "released", payment_status_job: "completed" }] })
      // application stats
      .mockResolvedValueOnce({ rows: [{ application_count: "8", accepted_count: "5", noshow_count: "1", avg_ttm_hours: "2.0" }] })
      // dispute count
      .mockResolvedValueOnce({ rows: [{ dispute_count: "2" }] })
      // worker ratings
      .mockResolvedValueOnce({ rows: [{ worker_ratings_avg: "4.5" }] })

    const reply = makeReply()
    await routes["GET:/api/employer/jobs/:id/analytics"](makeReq({ id: "j1" }), reply)

    expect(reply._body.jobId).toBe("j1")
    expect(reply._body.status).toBe("completed")
    expect(reply._body.escrow_status).toBe("released")
    expect(reply._body.payout_status).toBe("completed")
    expect(reply._body.application_count).toBe(8)
    expect(reply._body.accepted_count).toBe(5)
    expect(reply._body.noshow_count).toBe(1)
    expect(reply._body.time_to_match_hours).toBe(2)
    expect(reply._body.dispute_count).toBe(2)
    expect(reply._body.worker_ratings_avg).toBe(4.5)
  })
})
