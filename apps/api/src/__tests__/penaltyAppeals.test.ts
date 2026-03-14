/**
 * penaltyAppeals.test.ts — Worker penalty appeal flow tests
 *
 * Tests:
 *  1. Worker submits appeal → 200, appealStatus = pending
 *  2. Duplicate appeal → 409
 *  3. GET /workers/penalties returns list with appealStatus
 *  4. Admin PATCH approve → 200, appealStatus = approved, amount = 0, status = refunded
 *  5. Admin endpoint without token → 401
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildApp } from "../index"

// ── DB mock ────────────────────────────────────────────────────────────────────
const { dbMock } = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }
  return { dbMock }
})

vi.mock("../db", () => ({
  db: dbMock,
  penalties: {
    id: "id",
    jobId: "jobId",
    fromUserId: "fromUserId",
    toUserId: "toUserId",
    type: "type",
    amount: "amount",
    reason: "reason",
    status: "status",
    appealStatus: "appealStatus",
    appealNote: "appealNote",
    appealSubmittedAt: "appealSubmittedAt",
    adminAppealNote: "adminAppealNote",
    createdAt: "createdAt",
  },
  jobApplications: { id: "id", jobId: "jobId", workerId: "workerId" },
  jobPostings: { id: "id", employerId: "employerId" },
  users: { id: "id" },
}))

// ── Mock secondary services to prevent real connections ────────────────────────
vi.mock("../services/matching", () => ({
  dispatchJob: vi.fn(),
  workerSockets: new Map(),
}))
vi.mock("../services/webPush", () => ({ initWebPush: vi.fn(), sendPushNotification: vi.fn() }))
vi.mock("../services/kakaoAlimTalk", () => ({ initKakaoAlimTalk: vi.fn(), sendAlimTalk: vi.fn() }))
vi.mock("../services/jobExpiry", () => ({ processExpiredJobs: vi.fn(), type: "EmitFn" }))
vi.mock("../services/escrowAutoRelease", () => ({
  startEscrowAutoReleaseWorker: vi.fn(),
  stopEscrowAutoReleaseWorker: vi.fn(),
}))
vi.mock("../services/workerAlertWorker", () => ({
  startWorkerAlertWorker: vi.fn(),
  stopWorkerAlertWorker: vi.fn(),
  runWorkerAlerts: vi.fn(),
}))
vi.mock("../lib/redis", () => ({
  getRedisClient: vi.fn(() => null),
  checkRedisHealth: vi.fn(() => "disabled"),
}))
vi.mock("../db/migrate", () => ({
  runMigrations: vi.fn(),
  runNotificationsMigration: vi.fn(),
}))
vi.mock("../plugins/socket", () => ({
  setupSocketIO: vi.fn(() => ({ on: vi.fn(), to: vi.fn(() => ({ emit: vi.fn() })) })),
}))

// ── Constants ─────────────────────────────────────────────────────────────────
const WORKER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const PENALTY_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const ADMIN_TOKEN = "dev-admin-token"

const basePenalty = {
  id: PENALTY_ID,
  jobId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  fromUserId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  toUserId: WORKER_ID,
  type: "worker_noshow",
  amount: 10000,
  reason: "No-show",
  status: "pending",
  appealStatus: "none",
  appealNote: null,
  appealSubmittedAt: null,
  adminAppealNote: null,
  createdAt: new Date().toISOString(),
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeWorkerToken(app: any): string {
  return app.jwt.sign({ id: WORKER_ID, role: "worker" })
}

function chainSelect(responses: unknown[][]): void {
  let idx = 0
  dbMock.select.mockImplementation(() => ({
    from: () => ({
      where: (cond: any) => ({
        limit: () => Promise.resolve(responses[idx++] ?? []),
        orderBy: () => ({
          limit: () => Promise.resolve(responses[idx++] ?? []),
          offset: () => Promise.resolve(responses[idx++] ?? []),
        }),
      }),
      orderBy: () => ({
        limit: () => Promise.resolve(responses[idx++] ?? []),
      }),
    }),
  }))
}

function chainUpdate(returnedRow: unknown): void {
  dbMock.update.mockReturnValue({
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve([returnedRow]),
      }),
    }),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Penalty Appeal Routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ── Test 1: Worker submits appeal successfully ─────────────────────────────
  it("1. Worker submits appeal → 200, appealStatus = pending", async () => {
    // First call: find penalty (to verify ownership and appealStatus = none)
    chainSelect([[basePenalty]])

    const updatedPenalty = {
      ...basePenalty,
      appealStatus: "pending",
      appealNote: "I was there, no-show is incorrect.",
      appealSubmittedAt: new Date().toISOString(),
    }
    chainUpdate(updatedPenalty)

    const token = makeWorkerToken(app)
    const res = await app.inject({
      method: "POST",
      url: `/workers/penalties/${PENALTY_ID}/appeal`,
      headers: { authorization: `Bearer ${token}` },
      payload: { appealNote: "I was there, no-show is incorrect." },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.penalty.appealStatus).toBe("pending")
    expect(body.penalty.appealNote).toBe("I was there, no-show is incorrect.")
  })

  // ── Test 2: Duplicate appeal returns 409 ─────────────────────────────────
  it("2. Duplicate appeal → 409", async () => {
    const pendingPenalty = { ...basePenalty, appealStatus: "pending" }
    chainSelect([[pendingPenalty]])

    const token = makeWorkerToken(app)
    const res = await app.inject({
      method: "POST",
      url: `/workers/penalties/${PENALTY_ID}/appeal`,
      headers: { authorization: `Bearer ${token}` },
      payload: { appealNote: "I was there." },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/already submitted/i)
  })

  // ── Test 3: GET /workers/penalties returns own penalties list ─────────────
  it("3. GET /workers/penalties returns list with appealStatus", async () => {
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([basePenalty]),
        }),
      }),
    })

    const token = makeWorkerToken(app)
    const res = await app.inject({
      method: "GET",
      url: "/workers/penalties",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.penalties)).toBe(true)
    expect(body.penalties[0]).toHaveProperty("appealStatus")
    expect(body.penalties[0].appealStatus).toBe("none")
  })

  // ── Test 4: Admin approves appeal → amount = 0, status = refunded ─────────
  it("4. Admin approve → 200, appealStatus = approved, amount = 0", async () => {
    const pendingAppeal = { ...basePenalty, appealStatus: "pending" }

    let selectIdx = 0
    const selectResponses = [[pendingAppeal]]
    dbMock.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectResponses[selectIdx++] ?? []),
          orderBy: () => ({
            limit: () => Promise.resolve(selectResponses[selectIdx++] ?? []),
          }),
        }),
      }),
    }))

    const approvedPenalty = {
      ...pendingAppeal,
      appealStatus: "approved",
      amount: 0,
      status: "refunded",
      adminAppealNote: "Verified with check-in records.",
    }
    chainUpdate(approvedPenalty)

    const res = await app.inject({
      method: "PATCH",
      url: `/admin/penalties/${PENALTY_ID}/appeal`,
      headers: { "x-admin-token": ADMIN_TOKEN },
      payload: { decision: "approved", adminNote: "Verified with check-in records." },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.penalty.appealStatus).toBe("approved")
    expect(body.penalty.amount).toBe(0)
    expect(body.penalty.status).toBe("refunded")
  })

  // ── Test 5: Admin PATCH appeal without token → 401 ───────────────────────
  it("5. Admin penalties PATCH appeal without token → 401", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/penalties/${PENALTY_ID}/appeal`,
      // No x-admin-token header
      payload: { decision: "approved" },
    })

    expect(res.statusCode).toBe(401)
  })
})
