import { describe, it, expect, vi, beforeEach } from "vitest"
import Fastify from "fastify"
import { applicationRoutes } from "../routes/applications"

// ─── Mocks ───────────────────────────────────────────────────────────────────
vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn((req, _rep, done) => { req.user = { id: "worker-1", role: "worker" }; done() }),
  requireWorker: vi.fn((req, _rep, done) => { req.user = { id: "worker-1", role: "worker" }; done() }),
  requireEmployer: vi.fn((req, _rep, done) => { req.user = { id: "emp-1", role: "employer" }; done() }),
  requireAdmin: vi.fn((req, _rep, done) => { req.user = { id: "admin-1", role: "admin" }; done() }),
}))

vi.mock("../services/otpService.js", () => ({ sendOtp: vi.fn(), verifyOtp: vi.fn() }))
vi.mock("../services/scoring", () => ({ computeMatchScore: vi.fn().mockReturnValue(0.5) }))
vi.mock("../services/cache", () => ({
  workerProfileCache: new Map(),
  recommendedJobsCache: new Map(),
  earningsCache: new Map(),
  cacheGetL2: vi.fn().mockResolvedValue(null),
  cacheSetL2: vi.fn().mockResolvedValue(undefined),
  cacheDelL2: vi.fn().mockResolvedValue(undefined),
  CACHE_TTL: { profile: 60, earnings: 300 },
}))
vi.mock("../services/matching", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/matching")>()
  return {
    ...actual,
    // Keep real distanceKm (we want accurate Haversine)
    handleAcceptOffer: vi.fn(),
    handleRejectOffer: vi.fn(),
    dispatchJob: vi.fn(),
  }
})
vi.mock("./notifications", () => ({ createNotification: vi.fn() }))
vi.mock("@albaconnect/shared", () => ({ PLATFORM_FEE_RATE: 0.1 }))

// Job coordinates: Gangnam Station (37.498095, 127.027610)
const JOB_LAT = 37.498095
const JOB_LON = 127.027610

// In-range worker: ~50m away (same block)
const NEARBY_LAT = 37.498500
const NEARBY_LON = 127.027800

// Out-of-range worker: ~2km away (Seocho-dong)
const FAR_LAT = 37.483500
const FAR_LON = 127.031000

const { mockExecute, mockSelect } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>()
  return {
    ...actual,
    db: {
      execute: mockExecute,
      select: mockSelect,
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
      }),
    },
    sql: actual.sql,
  }
})

function buildApp() {
  const app = Fastify()
  app.register(applicationRoutes)
  return app
}

// Helper: application select chain
function mockApplicationAndJob(
  app: { checkin_at: null | string } = { checkin_at: null },
  job: { locationLat: string | null; locationLon: string | null; checkinRadiusMeters: number; locationEnforcement: boolean } | null = null
) {
  mockSelect
    // 1st select: find job_application
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "app-1", jobId: "job-1", workerId: "worker-1", status: "accepted", checkin_at: app.checkin_at }]),
        }),
      }),
    })
    // 2nd select: find job_postings geofence config
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(job ? [job] : []),
        }),
      }),
    })
}

describe("POST /jobs/:jobId/checkin — geofence enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecute.mockResolvedValue({ rows: [] })
  })

  it("in-range check-in succeeds (200) and records distance", async () => {
    mockApplicationAndJob({ checkin_at: null }, {
      locationLat: String(JOB_LAT),
      locationLon: String(JOB_LON),
      checkinRadiusMeters: 300,
      locationEnforcement: true,
    })

    const app = buildApp()
    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-1/checkin",
      payload: { latitude: NEARBY_LAT, longitude: NEARBY_LON },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty("checkedInAt")
    expect(body).toHaveProperty("distance_m")
    expect(body.distance_m).toBeLessThan(300)
  })

  it("out-of-range check-in returns 422 with CHECKIN_OUT_OF_RANGE and distances", async () => {
    mockApplicationAndJob({ checkin_at: null }, {
      locationLat: String(JOB_LAT),
      locationLon: String(JOB_LON),
      checkinRadiusMeters: 300,
      locationEnforcement: true,
    })

    const app = buildApp()
    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-1/checkin",
      payload: { latitude: FAR_LAT, longitude: FAR_LON },
    })

    expect(res.statusCode).toBe(422)
    const body = res.json()
    expect(body.code).toBe("CHECKIN_OUT_OF_RANGE")
    expect(body).toHaveProperty("distance_m")
    expect(body).toHaveProperty("allowed_m", 300)
    expect(body.distance_m).toBeGreaterThan(300)
  })

  it("no job location = bypass geofence (check-in succeeds without GPS)", async () => {
    mockApplicationAndJob({ checkin_at: null }, {
      locationLat: null,
      locationLon: null,
      checkinRadiusMeters: 300,
      locationEnforcement: true,
    })

    const app = buildApp()
    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-1/checkin",
      // No lat/lon provided — should still succeed
      payload: {},
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty("checkedInAt")
    // No distance in response when no geofence
    expect(body.distance_m).toBeUndefined()
  })

  it("admin override (location_enforcement=false) allows out-of-range check-in", async () => {
    mockApplicationAndJob({ checkin_at: null }, {
      locationLat: String(JOB_LAT),
      locationLon: String(JOB_LON),
      checkinRadiusMeters: 300,
      locationEnforcement: false, // admin disabled enforcement
    })

    const app = buildApp()
    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-1/checkin",
      payload: { latitude: FAR_LAT, longitude: FAR_LON }, // far away but enforcement off
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty("checkedInAt")
    // Distance is still recorded for audit
    expect(body.distance_m).toBeGreaterThan(300)
  })

  it("distance calculation accuracy (Haversine ~50m range)", async () => {
    // Seoul City Hall (37.566535, 126.977969) → Gyeongbokgung (~2.5km)
    const seoulHallLat = 37.566535
    const seoulHallLon = 126.977969
    const gyeongbokLat = 37.579617
    const gyeongbokLon = 126.977041

    mockApplicationAndJob({ checkin_at: null }, {
      locationLat: String(seoulHallLat),
      locationLon: String(seoulHallLon),
      checkinRadiusMeters: 3000, // 3km — should be in range for 2.5km dist
      locationEnforcement: true,
    })

    const app = buildApp()
    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-1/checkin",
      payload: { latitude: gyeongbokLat, longitude: gyeongbokLon },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    // ~1.45km between Seoul City Hall and Gyeongbokgung
    expect(body.distance_m).toBeGreaterThan(1000)
    expect(body.distance_m).toBeLessThan(2000)
  })
})
