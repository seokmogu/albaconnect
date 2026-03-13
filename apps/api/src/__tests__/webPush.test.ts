import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock web-push before any imports
const mockSendNotification = vi.fn()
const mockSetVapidDetails = vi.fn()
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: mockSetVapidDetails,
    sendNotification: mockSendNotification,
  },
  setVapidDetails: mockSetVapidDetails,
  sendNotification: mockSendNotification,
}))

// Mock DB for 410 cleanup
const mockUpdate = vi.fn()
const mockSet = vi.fn()
const mockWhere = vi.fn().mockResolvedValue({})
mockUpdate.mockReturnValue({ set: mockSet })
mockSet.mockReturnValue({ where: mockWhere })

vi.mock("../db", () => ({
  db: { update: mockUpdate },
  workerProfiles: { userId: "user_id" },
}))

vi.mock("drizzle-orm", async (importOriginal) => {
  const orig = await importOriginal<typeof import("drizzle-orm")>()
  return { ...orig, eq: vi.fn((a, b) => `eq(${String(a)},${b})`) }
})

// Must delete VITEST so webPush functions don't early-return in tests
const ORIGINAL_VITEST = process.env["VITEST"]

describe("webPush service", () => {
  beforeEach(() => {
    delete process.env["VITEST"]
    delete process.env["VAPID_PUBLIC_KEY"]
    delete process.env["VAPID_PRIVATE_KEY"]
    delete process.env["VAPID_EMAIL"]
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    process.env["VITEST"] = ORIGINAL_VITEST
  })

  it("isWebPushConfigured returns false when VAPID keys not set", async () => {
    const { initWebPush, isWebPushConfigured } = await import("../services/webPush.js")
    initWebPush()
    expect(isWebPushConfigured()).toBe(false)
    expect(mockSetVapidDetails).not.toHaveBeenCalled()
  })

  it("initWebPush calls setVapidDetails when VAPID keys present", async () => {
    process.env["VAPID_PUBLIC_KEY"] = "BG_test_public_key"
    process.env["VAPID_PRIVATE_KEY"] = "test_private_key"
    process.env["VAPID_EMAIL"] = "mailto:test@example.com"
    const { initWebPush, isWebPushConfigured } = await import("../services/webPush.js")
    initWebPush()
    expect(mockSetVapidDetails).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "BG_test_public_key",
      "test_private_key",
    )
    expect(isWebPushConfigured()).toBe(true)
  })

  it("sendJobOfferPush returns early when VAPID not configured", async () => {
    const { initWebPush, sendJobOfferPush } = await import("../services/webPush.js")
    initWebPush() // keys not set → not configured
    await sendJobOfferPush("worker-1", { endpoint: "https://fcm.example.com", keys: { p256dh: "k", auth: "a" } }, {
      jobId: "job-1", title: "카페", hourlyRate: 12000, distanceKm: 1.5, expiresAt: "2026-03-14T10:00:00Z",
    })
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it("sendJobOfferPush calls sendNotification with correct payload when configured", async () => {
    process.env["VAPID_PUBLIC_KEY"] = "BG_pub"
    process.env["VAPID_PRIVATE_KEY"] = "priv"
    mockSendNotification.mockResolvedValueOnce({ statusCode: 201 })
    const { initWebPush, sendJobOfferPush } = await import("../services/webPush.js")
    initWebPush()
    const sub = { endpoint: "https://push.example.com/sub/1", keys: { p256dh: "p256", auth: "authkey" } }
    const payload = { jobId: "job-1", title: "알바", hourlyRate: 10000, distanceKm: 2.0, expiresAt: "2026-03-14T10:00:00Z" }
    await sendJobOfferPush("worker-1", sub, payload)
    expect(mockSendNotification).toHaveBeenCalledOnce()
    const [calledSub, calledPayload] = mockSendNotification.mock.calls[0]
    expect(calledSub).toEqual(sub)
    const parsed = JSON.parse(calledPayload as string)
    expect(parsed.type).toBe("job_offer")
    expect(parsed.jobId).toBe("job-1")
    expect(parsed.hourlyRate).toBe(10000)
  })

  it("sendJobOfferPush clears DB subscription on 410 Gone", async () => {
    process.env["VAPID_PUBLIC_KEY"] = "BG_pub"
    process.env["VAPID_PRIVATE_KEY"] = "priv"
    const error410 = Object.assign(new Error("Gone"), { statusCode: 410 })
    mockSendNotification.mockRejectedValueOnce(error410)
    const { initWebPush, sendJobOfferPush } = await import("../services/webPush.js")
    initWebPush()
    await sendJobOfferPush("worker-stale", { endpoint: "https://x.com", keys: { p256dh: "k", auth: "a" } }, {
      jobId: "j", title: "t", hourlyRate: 1, distanceKm: 1, expiresAt: "now",
    })
    expect(mockUpdate).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith({ pushSubscription: null })
  })

  it("sendJobOfferPush does NOT clear DB on non-410 errors", async () => {
    process.env["VAPID_PUBLIC_KEY"] = "BG_pub"
    process.env["VAPID_PRIVATE_KEY"] = "priv"
    const error500 = Object.assign(new Error("Server error"), { statusCode: 500 })
    mockSendNotification.mockRejectedValueOnce(error500)
    const { initWebPush, sendJobOfferPush } = await import("../services/webPush.js")
    initWebPush()
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    await sendJobOfferPush("worker-1", { endpoint: "https://x.com", keys: { p256dh: "k", auth: "a" } }, {
      jobId: "j", title: "t", hourlyRate: 1, distanceKm: 1, expiresAt: "now",
    })
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
