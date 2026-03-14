/**
 * Employer Favorites (Worker Shortlist) — unit tests
 *
 * Tests:
 *  (a) POST toggle adds favorite (INSERT succeeds → 201 {favorited:true})
 *  (b) POST toggle removes favorite (INSERT conflict, rowCount=0 → DELETE → 200 {favorited:false})
 *  (c) GET /employers/favorites returns correct shape
 *  (d) GET /jobs/:id applications include is_favorited for employer
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest"

// ── Mocks (hoisted) ───────────────────────────────────────────────────────────
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }))

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
      values: vi.fn().mockResolvedValue([]),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    }),
  },
  users: {},
  employerProfiles: {},
  jobPostings: {},
  jobApplications: {},
  payments: {},
  employerFavorites: {},
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, __isSql: true })),
}))

vi.mock("../lib/redis", () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  })),
}))

vi.mock("../middleware/auth", () => ({
  requireAdmin: vi.fn(),
  authenticate: vi.fn(),
  requireEmployer: vi.fn(),
  requireWorker: vi.fn(),
}))

vi.mock("../services/matching", () => ({
  dispatchJob: vi.fn(),
  workerSockets: new Map(),
}))

vi.mock("../services/jobLifecycle", () => ({
  validateTransition: vi.fn().mockReturnValue(true),
  getValidTransitions: vi.fn().mockReturnValue([]),
}))

vi.mock("@albaconnect/shared", () => ({
  LATE_CANCEL_PENALTY_RATE: 0.3,
  PLATFORM_FEE_RATE: 0.05,
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
    patch:  (path: string, _opts: any, handler: Handler) => { routes[`PATCH:${path}`] = handler },
    decorateRequest: vi.fn(),
    addHook: vi.fn(),
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }
  return { app: app as any, routes }
}

function makeReply() {
  const reply: any = {
    _status: 200,
    _body: null,
    _headers: {} as Record<string, string>,
    status(code: number) { this._status = code; return this },
    send(body: any) { this._body = body; return this },
    header(k: string, v: string) { this._headers[k] = v; return this },
  }
  return reply
}

// ─────────────────────────────────────────────────────────────────────────────

describe("Employer Favorites — POST /employers/favorites/:workerId", () => {
  let routes: Record<string, Handler>

  beforeAll(async () => {
    const { employerRoutes } = await import("../routes/employer")
    const stub = buildAppStub()
    await employerRoutes(stub.app)
    routes = stub.routes
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("(a) adds favorite when no existing row — returns 201 {favorited:true}", async () => {
    // INSERT ON CONFLICT DO NOTHING returns rowCount=1 (inserted)
    mockExecute.mockResolvedValueOnce({ rows: [{ id: "fav-uuid-1" }], rowCount: 1 })

    const req = { user: { id: "emp-1" }, params: { workerId: "worker-2" } }
    const reply = makeReply()

    await routes["POST:/employers/favorites/:workerId"](req, reply)

    expect(reply._status).toBe(201)
    expect(reply._body).toEqual({ favorited: true, workerId: "worker-2" })
    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it("(b) removes favorite when row already exists — returns 200 {favorited:false}", async () => {
    // INSERT ON CONFLICT DO NOTHING returns rowCount=0 (conflict, no insert)
    mockExecute.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    // DELETE returns success
    mockExecute.mockResolvedValueOnce({ rows: [], rowCount: 1 })

    const req = { user: { id: "emp-1" }, params: { workerId: "worker-2" } }
    const reply = makeReply()

    await routes["POST:/employers/favorites/:workerId"](req, reply)

    expect(reply._status).toBe(200)
    expect(reply._body).toEqual({ favorited: false, workerId: "worker-2" })
    expect(mockExecute).toHaveBeenCalledTimes(2)
  })
})

describe("Employer Favorites — GET /employers/favorites", () => {
  let routes: Record<string, Handler>

  beforeAll(async () => {
    // Re-import with fresh module state
    const { employerRoutes } = await import("../routes/employer")
    const stub = buildAppStub()
    await employerRoutes(stub.app)
    routes = stub.routes
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("(c) returns paginated favorites list with correct shape", async () => {
    const fakeRow = {
      worker_id: "worker-42",
      note: null,
      created_at: new Date().toISOString(),
      name: "홍길동",
      rating_avg: "4.5",
      rating_count: 3,
      certifications: ["FOOD_HANDLER"],
      completed_jobs: 5,
      last_job_at: new Date().toISOString(),
    }
    mockExecute.mockResolvedValueOnce({ rows: [fakeRow], rowCount: 1 })

    const req = { user: { id: "emp-1" }, query: { page: "1", limit: "20" } }
    const reply = makeReply()

    await routes["GET:/employers/favorites"](req, reply)

    expect(reply._status).toBe(200)
    expect(reply._body).toMatchObject({
      favorites: expect.arrayContaining([
        expect.objectContaining({
          worker_id: "worker-42",
          name: "홍길동",
          certifications: expect.arrayContaining(["FOOD_HANDLER"]),
        }),
      ]),
      page: 1,
      limit: 20,
    })
  })
})

describe("Employer Favorites — is_favorited in GET /jobs/:id applications", () => {
  let routes: Record<string, Handler>

  beforeAll(async () => {
    const { jobRoutes } = await import("../routes/jobs")
    const stub = buildAppStub()
    await jobRoutes(stub.app)
    routes = stub.routes
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("(d) applications include is_favorited when employer views own job", async () => {
    const jobRow = {
      id: "job-1",
      employer_id: "emp-1",
      status: "open",
      employer_name: "Test Co",
      company_name: "Test Company",
      employer_rating: "4.8",
      lat: 37.5, lng: 127.0,
    }
    const appRow = {
      id: "app-1",
      worker_id: "worker-2",
      worker_name: "김철수",
      worker_rating: "4.2",
      worker_categories: ["food"],
      is_favorited: true,
    }

    // First execute: job detail query
    mockExecute.mockResolvedValueOnce({ rows: [jobRow], rowCount: 1 })
    // Second execute: applications with is_favorited
    mockExecute.mockResolvedValueOnce({ rows: [appRow], rowCount: 1 })

    const req = {
      user: { id: "emp-1", role: "employer" },
      params: { id: "job-1" },
    }
    const reply = makeReply()

    await routes["GET:/jobs/:id"](req, reply)

    expect(reply._status).toBe(200)
    expect(reply._body.applications).toHaveLength(1)
    expect(reply._body.applications[0]).toMatchObject({
      is_favorited: true,
      worker_name: "김철수",
    })
  })
})
