/**
 * Employer Analytics — unit tests
 * Tests route handlers by calling employerRoutes(mockApp) and capturing handlers.
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
  requireAdmin: vi.fn(),
  authenticate: vi.fn(),
  requireEmployer: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
type Handler = (req: any, reply: any) => Promise<void>

/** Build a minimal Fastify-like app stub that captures route handlers */
function buildAppStub() {
  const routes: Record<string, Handler> = {}
  const app = {
    get:    (path: string, _opts: any, handler: Handler) => { routes[`GET:${path}`] = handler },
    post:   (path: string, _opts: any, handler: Handler) => { routes[`POST:${path}`] = handler },
    put:    (path: string, _opts: any, handler: Handler) => { routes[`PUT:${path}`] = handler },
    delete: (path: string, _opts: any, handler: Handler) => { routes[`DELETE:${path}`] = handler },
    patch:  (path: string, _opts: any, handler: Handler) => { routes[`PATCH:${path}`] = handler },
    decorateRequest: vi.fn(),
    addHook: vi.fn(),
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }
  return { app: app as any, routes }
}

function makeReq(query: Record<string, string> = {}, params: Record<string, string> = {}) {
  return { user: { id: "emp-1" }, query, params }
}

function makeReply() {
  const r = { _code: 200, _body: undefined as any }
  const rr = r as any
  rr.status = (c: number) => { r._code = c; return rr }
  rr.send   = (b: any)    => { r._body = b; return rr }
  return rr
}

// ── Test Data ─────────────────────────────────────────────────────────────────
const AGG_ROW = {
  total_jobs: "10", filled_jobs: "7",
  total_applications: "50", accepted_applications: "20", noshow_applications: "2",
}
const TIME_ROW  = { avg_minutes: "45.0" }
const STATUS_ROWS = [{ status: "completed", count: "5" }, { status: "open", count: "2" }]
const DAILY_ROWS  = [{ date: "2026-03-01", count: "2" }, { date: "2026-03-02", count: "3" }]

function mockFull() {
  mockExecute
    .mockResolvedValueOnce({ rows: [AGG_ROW] })
    .mockResolvedValueOnce({ rows: [TIME_ROW] })
    .mockResolvedValueOnce({ rows: STATUS_ROWS })
    .mockResolvedValueOnce({ rows: DAILY_ROWS })
}

// ── Setup ─────────────────────────────────────────────────────────────────────
import { employerRoutes } from "../routes/employer"

let routes: Record<string, Handler>

beforeAll(async () => {
  const stub = buildAppStub()
  await employerRoutes(stub.app)
  routes = stub.routes
})

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("GET /employers/analytics", () => {
  beforeEach(() => { vi.clearAllMocks(); mockGet.mockResolvedValue(null) })

  it("rejects invalid range param with 400", async () => {
    const reply = makeReply()
    await routes["GET:/employers/analytics"](makeReq({ range: "999d" }), reply)
    expect(reply._code).toBe(400)
    expect(reply._body).toMatchObject({ error: expect.stringContaining("range") })
  })

  it("returns fill_rate_pct=70 and noshow_rate_pct=10", async () => {
    mockFull()
    const reply = makeReply()
    await routes["GET:/employers/analytics"](makeReq({ range: "30d" }), reply)
    expect(reply._body.fill_rate_pct).toBe(70)
    expect(reply._body.noshow_rate_pct).toBe(10)
  })

  it("returns avg_time_to_match_minutes=45", async () => {
    mockFull()
    const reply = makeReply()
    await routes["GET:/employers/analytics"](makeReq({ range: "30d" }), reply)
    expect(reply._body.avg_time_to_match_minutes).toBe(45)
  })

  it("returns jobs_by_status breakdown", async () => {
    mockFull()
    const reply = makeReply()
    await routes["GET:/employers/analytics"](makeReq({ range: "30d" }), reply)
    expect(reply._body.jobs_by_status).toEqual({ completed: 5, open: 2 })
  })

  it("returns daily_jobs_posted array", async () => {
    mockFull()
    const reply = makeReply()
    await routes["GET:/employers/analytics"](makeReq({ range: "30d" }), reply)
    expect(reply._body.daily_jobs_posted).toEqual([
      { date: "2026-03-01", count: 2 },
      { date: "2026-03-02", count: 3 },
    ])
  })

  it("returns cached result without DB calls on cache hit", async () => {
    mockGet.mockResolvedValue(JSON.stringify({ fill_rate_pct: 42, cached: true }))
    const reply = makeReply()
    await routes["GET:/employers/analytics"](makeReq({ range: "30d" }), reply)
    expect(reply._body.fill_rate_pct).toBe(42)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it("handles zero jobs gracefully (fill_rate=0, noshow_rate=0)", async () => {
    const empty = { total_jobs: "0", filled_jobs: "0", total_applications: "0", accepted_applications: "0", noshow_applications: "0" }
    mockExecute
      .mockResolvedValueOnce({ rows: [empty] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const reply = makeReply()
    await routes["GET:/employers/analytics"](makeReq({ range: "7d" }), reply)
    expect(reply._body.fill_rate_pct).toBe(0)
    expect(reply._body.noshow_rate_pct).toBe(0)
  })

  it("defaults to 30d when no range param provided", async () => {
    mockFull()
    const reply = makeReply()
    await routes["GET:/employers/analytics"](makeReq({}), reply)
    expect(reply._body.range).toBe("30d")
  })
})

describe("GET /employers/analytics/jobs/:jobId", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 404 when job not found or not owned", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] })
    const reply = makeReply()
    await routes["GET:/employers/analytics/jobs/:jobId"](makeReq({}, { jobId: "no-job" }), reply)
    expect(reply._code).toBe(404)
  })

  it("returns per-job stats", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ id: "j1", status: "completed", created_at: "2026-03-10" }] })
      .mockResolvedValueOnce({ rows: [{ applicant_count: "5", accepted_count: "3", noshow_count: "1", avg_minutes_to_first_accept: "20.0" }] })
    const reply = makeReply()
    await routes["GET:/employers/analytics/jobs/:jobId"](makeReq({}, { jobId: "j1" }), reply)
    expect(reply._body.applicant_count).toBe(5)
    expect(reply._body.accepted_count).toBe(3)
    expect(reply._body.noshow_count).toBe(1)
    expect(reply._body.avg_minutes_to_first_accept).toBe(20)
  })
})
