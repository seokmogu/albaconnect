/**
 * Worker Earnings & Payment History — unit tests
 * Tests route handlers by calling workerRoutes(mockApp) and capturing handlers.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"

// ── Mocks (hoisted) ───────────────────────────────────────────────────────────
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }))
const { mockCacheGetL2, mockCacheSetL2, mockCacheDelL2 } = vi.hoisted(() => ({
  mockCacheGetL2: vi.fn().mockResolvedValue(undefined),
  mockCacheSetL2: vi.fn().mockResolvedValue(undefined),
  mockCacheDelL2: vi.fn().mockResolvedValue(undefined),
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
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  },
  users: {},
  workerProfiles: {},
  workerAvailability: {},
  workerBlackout: {},
  jobPostings: {},
  eq: vi.fn(),
}))

vi.mock("../services/cache", () => ({
  workerProfileCache: { get: vi.fn().mockReturnValue(undefined), set: vi.fn(), delete: vi.fn(), invalidatePrefix: vi.fn() },
  recommendedJobsCache: { get: vi.fn().mockReturnValue(undefined), set: vi.fn(), delete: vi.fn(), invalidatePrefix: vi.fn() },
  earningsCache: {},
  cacheGetL2: mockCacheGetL2,
  cacheSetL2: mockCacheSetL2,
  cacheDelL2: mockCacheDelL2,
  CACHE_TTL: {
    WORKER_PROFILE: 60_000,
    RECOMMENDED_JOBS: 120_000,
    NEARBY_WORKERS: 30_000,
    NEARBY_JOBS: 30_000,
    EARNINGS_STATS: 300_000,
  },
}))

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn(),
  requireWorker: vi.fn(),
}))

vi.mock("../services/matching", () => ({
  dispatchJob: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../services/scoring", () => ({
  computeMatchScore: vi.fn().mockReturnValue(80),
}))

vi.mock("../lib/redis", () => ({
  redisGet: vi.fn().mockResolvedValue(undefined),
  redisSet: vi.fn().mockResolvedValue(undefined),
  redisDel: vi.fn().mockResolvedValue(undefined),
  redisDelPattern: vi.fn().mockResolvedValue(undefined),
  getRedisClient: vi.fn(() => null),
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

function makeReq(
  query: Record<string, string | number> = {},
  userId = "worker-1"
) {
  return { user: { id: userId, role: "worker" }, query, params: {} }
}

function makeReply() {
  const r = { _code: 200, _body: undefined as any }
  const rr = r as any
  rr.status = (c: number) => { r._code = c; return rr }
  rr.send   = (b: any)    => { r._body = b; return rr }
  return rr
}

// ── Setup ─────────────────────────────────────────────────────────────────────
import { workerRoutes } from "../routes/workers"

let routes: Record<string, Handler>

beforeAll(async () => {
  const stub = buildAppStub()
  await workerRoutes(stub.app)
  routes = stub.routes
})

// ── Earnings aggregate tests ──────────────────────────────────────────────────
describe("GET /workers/earnings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheGetL2.mockResolvedValue(undefined) // no cache hit by default
  })

  it("returns aggregate stats with correct numeric types", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{
        total_earned: "150000",
        pending_payout: "30000",
        completed_jobs: "5",
        avg_hourly_rate: "12000.5",
      }],
    })

    const reply = makeReply()
    await routes["GET:/workers/earnings"](makeReq(), reply)

    expect(reply._code).toBe(200)
    expect(reply._body).toMatchObject({
      total_earned: 150000,
      pending_payout: 30000,
      completed_jobs: 5,
      avg_hourly_rate: 12001, // rounded
    })
  })

  it("returns zeros when worker has no payments", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{
        total_earned: "0",
        pending_payout: "0",
        completed_jobs: "0",
        avg_hourly_rate: "0",
      }],
    })

    const reply = makeReply()
    await routes["GET:/workers/earnings"](makeReq(), reply)

    expect(reply._body.total_earned).toBe(0)
    expect(reply._body.completed_jobs).toBe(0)
  })

  it("returns cached result on Redis cache hit without DB calls", async () => {
    const cachedData = {
      total_earned: 99000,
      pending_payout: 0,
      completed_jobs: 3,
      avg_hourly_rate: 10000,
    }
    mockCacheGetL2.mockResolvedValueOnce(cachedData)

    const reply = makeReply()
    await routes["GET:/workers/earnings"](makeReq(), reply)

    expect(mockExecute).not.toHaveBeenCalled()
    expect(reply._body.total_earned).toBe(99000)
    expect(reply._body.completed_jobs).toBe(3)
  })

  it("writes result to cache after DB query", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{
        total_earned: "50000",
        pending_payout: "10000",
        completed_jobs: "2",
        avg_hourly_rate: "9000",
      }],
    })

    const reply = makeReply()
    await routes["GET:/workers/earnings"](makeReq({}, "worker-cache-test"), reply)

    expect(mockCacheSetL2).toHaveBeenCalledWith(
      expect.anything(), // earningsCache L1 reference
      "earnings:worker-cache-test",
      expect.objectContaining({ total_earned: 50000 }),
      300_000
    )
  })
})

// ── Payment list pagination tests ─────────────────────────────────────────────
describe("GET /workers/payments", () => {
  beforeEach(() => vi.clearAllMocks())

  const PAYMENT_ROW = {
    id: "pay-1",
    job_title: "카페 알바",
    employer_name: "김사장",
    company_name: "커피빈",
    hours_worked: "4.00",
    amount: 40000,
    platform_fee: 4000,
    status: "completed",
    paid_at: "2026-03-10T10:00:00.000Z",
  }

  it("returns paginated payment history", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [PAYMENT_ROW] })     // payment list
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })  // count

    const reply = makeReply()
    await routes["GET:/workers/payments"](makeReq({ page: 1, limit: 20 }), reply)

    expect(reply._code).toBe(200)
    expect(reply._body.payments).toHaveLength(1)
    expect(reply._body.payments[0]).toMatchObject({
      id: "pay-1",
      job_title: "카페 알바",
      hours_worked: 4,
      net_amount: 36000, // amount - platform_fee
    })
    expect(reply._body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      total_pages: 1,
    })
  })

  it("filters by status=completed", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [PAYMENT_ROW] })
      .mockResolvedValueOnce({ rows: [{ total: "3" }] })

    const reply = makeReply()
    await routes["GET:/workers/payments"](makeReq({ status: "completed", page: 1, limit: 10 }), reply)

    expect(reply._code).toBe(200)
    expect(reply._body.payments[0].status).toBe("completed")
  })

  it("filters by status=pending", async () => {
    const pendingRow = { ...PAYMENT_ROW, id: "pay-2", status: "pending" }
    mockExecute
      .mockResolvedValueOnce({ rows: [pendingRow] })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })

    const reply = makeReply()
    await routes["GET:/workers/payments"](makeReq({ status: "pending" }), reply)

    expect(reply._body.payments[0].status).toBe("pending")
  })

  it("handles second page with correct pagination metadata", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "5" }] })

    const reply = makeReply()
    await routes["GET:/workers/payments"](makeReq({ page: 2, limit: 3 }), reply)

    expect(reply._body.pagination.page).toBe(2)
    expect(reply._body.pagination.limit).toBe(3)
    expect(reply._body.pagination.total).toBe(5)
    expect(reply._body.pagination.total_pages).toBe(2)
    expect(reply._body.payments).toHaveLength(0)
  })

  it("returns empty list when no payments exist", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })

    const reply = makeReply()
    await routes["GET:/workers/payments"](makeReq(), reply)

    expect(reply._body.payments).toHaveLength(0)
    expect(reply._body.pagination.total).toBe(0)
  })
})
