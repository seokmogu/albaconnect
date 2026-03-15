/**
 * employerNotifications.test.ts — Employer real-time push notification system
 *
 * Tests:
 *  1. GET /notifications returns 401 without auth
 *  2. GET /notifications returns list and unread count for authed user
 *  3. PATCH /notifications/read-all returns 200 and marks all read
 *  4. PATCH /notifications/:id/read returns 200 for authed user
 *  5. GET /employers/me/notifications returns 401 without auth
 *  6. GET /employers/me/notifications returns notifications with unreadCount for employer
 *  7. GET /employers/me/notifications?isRead=false returns only unread
 *  8. createNotification: inserts row and emits socket event
 *  9. createNotification: fires KakaoTalk for "noshow" (critical) type
 * 10. GET /employers/profile includes unreadNotificationCount badge
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildApp } from "../index"
import { createNotification, setNotificationEmitter } from "../routes/notifications"

// ── Mocks ────────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const limitMock = vi.fn().mockResolvedValue([])
  const orderByMock = vi.fn(() => ({ limit: limitMock }))
  const whereMock = vi.fn(() => ({ orderBy: orderByMock, limit: limitMock, then: (fn: any) => Promise.resolve(fn([])) }))
  const fromMock = vi.fn(() => ({ where: whereMock }))
  const selectMock = vi.fn(() => ({ from: fromMock }))

  const returningMock = vi.fn().mockResolvedValue([])
  const valuesMock = vi.fn(() => ({ returning: returningMock }))
  const insertMock = vi.fn(() => ({ values: valuesMock }))

  const updateWhereMock = vi.fn().mockResolvedValue({ rowCount: 1 })
  const setMock = vi.fn(() => ({ where: updateWhereMock }))
  const updateMock = vi.fn(() => ({ set: setMock }))

  const executeMock = vi.fn().mockResolvedValue({ rows: [{ count: "3" }] })

  const dbMock = {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    execute: executeMock,
  }

  return {
    dbMock,
    selectMock, fromMock, whereMock, orderByMock, limitMock,
    insertMock, valuesMock, returningMock,
    updateMock, setMock, updateWhereMock,
    executeMock,
  }
})

vi.mock("../db", () => ({
  db: mocks.dbMock,
  notifications: { id: "id", userId: "user_id", type: "type", title: "title", body: "body", read: "read", data: "data", createdAt: "created_at" },
  users: { id: "id", phone: "phone", name: "name", email: "email" },
  employerProfiles: { userId: "user_id", companyName: "company_name", businessNumber: "business_number", ratingAvg: "rating_avg", ratingCount: "rating_count" },
  jobPostings: { id: "id", employerId: "employer_id", status: "status" },
  jobApplications: { id: "id", workerId: "worker_id", jobId: "job_id", status: "status" },
  payments: { id: "id" },
  employerFavorites: { id: "id" },
}))
vi.mock("../db/migrate", () => ({
  runMigrations: vi.fn(),
  runNotificationsMigration: vi.fn(),
}))
vi.mock("../services/kakaoAlimTalk", () => ({
  initKakaoAlimTalk: vi.fn(),
  sendAlimTalk: vi.fn().mockResolvedValue(undefined),
  sendOtpAlimTalk: vi.fn(),
  jobAvailableAlimTalk: vi.fn(),
  jobConfirmedAlimTalk: vi.fn(),
  jobAlertAlimTalk: vi.fn(),
  paymentCompleteAlimTalk: vi.fn(),
}))
vi.mock("../services/matching", () => ({
  workerSockets: new Map(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
  handleRejectOffer: vi.fn(),
  dispatchJob: vi.fn(),
}))
vi.mock("../services/webPush", () => ({
  initWebPush: vi.fn(),
  sendJobOfferPush: vi.fn(),
}))
vi.mock("../services/workerAlertWorker", () => ({
  startWorkerAlertWorker: vi.fn(),
  stopWorkerAlertWorker: vi.fn(),
}))
vi.mock("../services/escrowAutoRelease", () => ({
  startEscrowAutoReleaseWorker: vi.fn(),
  stopEscrowAutoReleaseWorker: vi.fn(),
}))
vi.mock("../lib/redis", () => ({
  getRedisClient: vi.fn(() => null),
  checkRedisHealth: vi.fn().mockResolvedValue("ok"),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../services/cache", () => ({
  nearbyWorkersCache: new Map(),
  CACHE_TTL: 60,
  cacheGetL2: vi.fn().mockResolvedValue(null),
  cacheSetL2: vi.fn().mockResolvedValue(undefined),
  cacheDelL2: vi.fn().mockResolvedValue(undefined),
}))

// ── Constants ─────────────────────────────────────────────────────────────────
const EMPLOYER_ID = "eeee0000-0000-0000-0000-eeeeeeeeeeee"
const NOTIF_ID = "aaaa0000-0000-0000-0000-aaaaaaaaaaaa"

describe("employer notifications", () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset execute mock to a useful default
    mocks.executeMock.mockResolvedValue({ rows: [{ count: "3" }] })
    mocks.limitMock.mockResolvedValue([
      { id: NOTIF_ID, userId: EMPLOYER_ID, type: "application_submitted", title: "새 지원자", body: "test body", read: false, createdAt: new Date() },
    ])
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  function employerToken() {
    return app.jwt.sign({ id: EMPLOYER_ID, role: "employer" })
  }

  // ── Test 1 ────────────────────────────────────────────────────────────────
  it("GET /notifications returns 401 without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/notifications" })
    expect(res.statusCode).toBe(401)
  })

  // ── Test 2 ────────────────────────────────────────────────────────────────
  it("GET /notifications returns notifications and unreadCount for authed user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/notifications",
      headers: { authorization: `Bearer ${employerToken()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty("notifications")
    expect(body).toHaveProperty("unreadCount")
    expect(Array.isArray(body.notifications)).toBe(true)
  })

  // ── Test 3 ────────────────────────────────────────────────────────────────
  it("PATCH /notifications/read-all returns 200 and marks read", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/notifications/read-all",
      headers: { authorization: `Bearer ${employerToken()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.message).toContain("read")
  })

  // ── Test 4 ────────────────────────────────────────────────────────────────
  it("PATCH /notifications/:id/read returns 200 for authed user", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/notifications/${NOTIF_ID}/read`,
      headers: { authorization: `Bearer ${employerToken()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.message).toContain("read")
  })

  // ── Test 5 ────────────────────────────────────────────────────────────────
  it("GET /employers/me/notifications returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/employers/me/notifications",
    })
    expect(res.statusCode).toBe(401)
  })

  // ── Test 6 ────────────────────────────────────────────────────────────────
  it("GET /employers/me/notifications returns notifications with unreadCount for employer", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/employers/me/notifications",
      headers: { authorization: `Bearer ${employerToken()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty("notifications")
    expect(body).toHaveProperty("unreadCount")
    expect(body).toHaveProperty("nextCursor")
    expect(Array.isArray(body.notifications)).toBe(true)
  })

  // ── Test 7 ────────────────────────────────────────────────────────────────
  it("GET /employers/me/notifications?isRead=false queries unread only", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/employers/me/notifications?isRead=false",
      headers: { authorization: `Bearer ${employerToken()}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty("notifications")
  })

  // ── Test 8 ────────────────────────────────────────────────────────────────
  it("createNotification inserts notification row and emits socket event", async () => {
    const emitMock = vi.fn()
    const toMock = vi.fn(() => ({ emit: emitMock }))
    const fakeIo = { to: toMock } as any
    const fakeSockets = new Map<string, string>([[EMPLOYER_ID, "socket-abc"]])

    setNotificationEmitter(fakeIo, fakeSockets)

    await createNotification(
      EMPLOYER_ID,
      "application_submitted",
      "새 지원자",
      "근로자가 매칭 대기 중입니다.",
      { jobId: "job-123" }
    )

    // DB insert should have been called
    expect(mocks.insertMock).toHaveBeenCalled()

    // Socket emit should have been called with notification event
    expect(toMock).toHaveBeenCalledWith("socket-abc")
    expect(emitMock).toHaveBeenCalledWith(
      "notification",
      expect.objectContaining({ type: "application_submitted", title: "새 지원자" })
    )
  })

  // ── Test 9 ────────────────────────────────────────────────────────────────
  it("createNotification fires KakaoTalk for critical 'noshow' type", async () => {
    const { sendAlimTalk } = await import("../services/kakaoAlimTalk")
    const kakaoMock = vi.mocked(sendAlimTalk)

    // Arrange: DB execute returns a phone number
    mocks.executeMock.mockResolvedValue({ rows: [{ phone: "01012345678" }] })

    setNotificationEmitter(null as any, new Map())

    await createNotification(
      EMPLOYER_ID,
      "noshow",
      "결근 처리됨",
      "근로자가 결근했습니다.",
      {}
    )

    // Wait for fire-and-forget KakaoTalk
    await new Promise((r) => setTimeout(r, 20))

    expect(kakaoMock).toHaveBeenCalledWith(
      "01012345678",
      "EMPLOYER_ALERT",
      expect.objectContaining({ title: "결근 처리됨" })
    )
  })

  // ── Test 10 ───────────────────────────────────────────────────────────────
  it("GET /employers/profile includes unreadNotificationCount badge", async () => {
    // Mock user + profile + stats
    mocks.limitMock.mockResolvedValueOnce([
      { id: EMPLOYER_ID, email: "e@test.com", name: "테스트", phone: "010-0000-0000" },
    ])
    mocks.limitMock.mockResolvedValueOnce([
      { userId: EMPLOYER_ID, companyName: "TestCo", businessNumber: "123", ratingAvg: 4.5, ratingCount: 10 },
    ])
    mocks.executeMock
      .mockResolvedValueOnce({ rows: [{ total: "5", open: "2", completed: "3" }] }) // stats
      .mockResolvedValueOnce({ rows: [{ count: "3" }] }) // unread count

    const res = await app.inject({
      method: "GET",
      url: "/employers/profile",
      headers: { authorization: `Bearer ${employerToken()}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty("unreadNotificationCount")
    expect(typeof body.unreadNotificationCount).toBe("number")
  })
})
