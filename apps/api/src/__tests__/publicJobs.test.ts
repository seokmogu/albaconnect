import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildApp } from "../index"

// ─── Shared mocks ─────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const executeMock = vi.fn()
  const selectLimitMock = vi.fn()
  const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }))
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }))
  const selectMock = vi.fn(() => ({ from: selectFromMock }))
  return { executeMock, selectMock, selectLimitMock, selectWhereMock, selectFromMock }
})

vi.mock("../db", () => ({
  db: {
    execute: mocks.executeMock,
    select: mocks.selectMock,
  },
  jobPostings: { id: "id", employerId: "employerId", status: "status" },
  jobApplications: { id: "id", jobId: "jobId", status: "status", workerId: "workerId" },
  users: {},
  penalties: {},
  workerProfiles: {},
}))

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn((_req: any, _rep: any, done: () => void) => done()),
  requireEmployer: vi.fn((_req: any, _rep: any, done: () => void) => done()),
  requireWorker: vi.fn((_req: any, _rep: any, done: () => void) => done()),
  requireAdmin: vi.fn((_req: any, _rep: any, done: () => void) => done()),
}))

vi.mock("../services/matching", () => ({
  dispatchJob: vi.fn(),
  distanceKm: vi.fn(),
  workerSockets: new Map(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
  handleRejectOffer: vi.fn(),
}))

vi.mock("../plugins/socket", () => ({
  setupSocketIO: vi.fn().mockResolvedValue(null),
  io: null,
}))

vi.mock("../lib/redis", () => ({
  checkRedisHealth: vi.fn().mockResolvedValue("ok"),
}))

vi.mock("../services/kakaoAlimTalk.js", () => ({
  initKakaoAlimTalk: vi.fn(),
}))

vi.mock("../plugins/rateLimit", () => ({
  setupRateLimit: vi.fn().mockImplementation(async (app: any) => {
    // No-op rate limiting in tests
  }),
}))

// ─── Test data ─────────────────────────────────────────────────────────────────
const OPEN_JOBS = [
  {
    id: "123e4567-e89b-12d3-a456-426614174000",
    title: "카페 아르바이트",
    category: "카페",
    hourly_rate: 12000,
    total_amount: 96000,
    address: "서울 강남구 테헤란로 123",
    start_at: new Date("2026-04-01T09:00:00Z"),
    end_at: new Date("2026-04-01T17:00:00Z"),
    headcount: 2,
    company_name: "스타벅스 강남점",
  },
]

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe("GET /api/v2/jobs/public", () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    // Mock execute: first call = jobs list, second = count
    mocks.executeMock
      .mockResolvedValueOnce({ rows: OPEN_JOBS })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
    app = await buildApp()
  })

  it("returns 200 with jobs array without Authorization header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/jobs/public",
      // No Authorization header — unauthenticated
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body.jobs)).toBe(true)
    expect(body.page).toBe(1)
    expect(typeof body.total).toBe("number")
  })

  it("does NOT include businessNumber or employerId in response", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/jobs/public",
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    const raw = res.body

    // PII fields must not appear anywhere in the response body
    expect(raw).not.toContain("businessNumber")
    expect(raw).not.toContain("business_number")
    expect(raw).not.toContain("employerId")
    expect(raw).not.toContain("employer_id")

    // Correct safe fields are present
    if (body.jobs.length > 0) {
      const job = body.jobs[0]
      expect(job).toHaveProperty("id")
      expect(job).toHaveProperty("title")
      expect(job).toHaveProperty("company_name")
      expect(job).toHaveProperty("hourly_rate")
    }
  })

  it("returns 400 for invalid UUID on public detail endpoint", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v2/jobs/public/not-a-valid-uuid",
    })

    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error).toBeDefined()
  })
})
