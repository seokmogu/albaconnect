import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import crypto from "crypto"
import Fastify from "fastify"
import { paymentRoutes } from "../routes/payments"

// ─── DB mock ────────────────────────────────────────────────────────────────
vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>()
  return {
    ...actual,
    db: {
      execute: vi.fn().mockResolvedValue({ rows: [{ id: "mock-id" }] }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
          returning: vi.fn().mockResolvedValue([{ jobId: "job-1", amount: 50000 }]),
        }),
      }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "pay-1", jobId: "job-1" }]) }),
        }),
      }),
    },
    sql: actual.sql,
  }
})

// ─── Service mock ────────────────────────────────────────────────────────────
vi.mock("../services/tossWebhook", async () => {
  const actual = await import("../services/tossWebhook")
  return {
    ...actual,
    recordWebhookEvent: vi.fn().mockResolvedValue(true),
    handlePaymentStatusChanged: vi.fn().mockResolvedValue(undefined),
    handleVirtualAccountDeposit: vi.fn().mockResolvedValue(undefined),
    runPaymentReconciliation: vi.fn().mockResolvedValue({ checked: 2, updated: 1, errors: 0 }),
    startReconciliationWorker: vi.fn(),
    stopReconciliationWorker: vi.fn(),
  }
})

vi.mock("../middleware/auth", () => ({
  authenticate: vi.fn((req, _rep, done) => { req.user = { id: "u1", role: "worker" }; done() }),
  requireWorker: vi.fn((req, _rep, done) => { req.user = { id: "u1", role: "worker" }; done() }),
  requireEmployer: vi.fn((req, _rep, done) => { req.user = { id: "e1", role: "employer" }; done() }),
  requireAdmin: vi.fn((req, _rep, done) => { req.user = { id: "a1", role: "admin" }; done() }),
}))

vi.mock("../services/kakaoAlimTalk", () => ({ paymentCompleteAlimTalk: vi.fn() }))
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
vi.mock("../services/otpService.js", () => ({ sendOtp: vi.fn(), verifyOtp: vi.fn() }))
vi.mock("@albaconnect/shared", () => ({ PLATFORM_FEE_RATE: 0.1 }))

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildApp() {
  const app = Fastify()
  app.register(paymentRoutes)
  return app
}

function makeSignature(body: string, secret: string, transmissionTime: string): string {
  const digest = crypto.createHmac("sha256", secret).update(`${body}:${transmissionTime}`).digest("base64")
  return `v1:${digest}`
}

const WEBHOOK_SECRET = "test-secret-abc"
const TRANSMISSION_TIME = "2026-05-20T09:00:00+09:00"

import {
  verifyTossSignature,
  requiresTossSignature,
  verifyPaymentWebhookData,
  recordWebhookEvent,
  runPaymentReconciliation,
  handlePaymentStatusChanged,
  incrementWebhookCounter,
  getWebhookCounters,
} from "../services/tossWebhook"

const mockRecordWebhookEvent = vi.mocked(recordWebhookEvent)
const mockRunPaymentReconciliation = vi.mocked(runPaymentReconciliation)
const mockHandlePaymentStatusChanged = vi.mocked(handlePaymentStatusChanged)

// ─── Unit: verifyTossSignature ───────────────────────────────────────────────
describe("verifyTossSignature (unit)", () => {
  beforeEach(() => {
    process.env.TOSS_WEBHOOK_SECRET = WEBHOOK_SECRET
  })
  afterEach(() => {
    delete process.env.TOSS_WEBHOOK_SECRET
  })

  it("accepts valid HMAC-SHA256 signature", () => {
    const body = '{"eventType":"payout.changed","data":{"orderId":"ord-1","status":"DONE"}}'
    const sig = makeSignature(body, WEBHOOK_SECRET, TRANSMISSION_TIME)
    expect(verifyTossSignature(Buffer.from(body), sig, TRANSMISSION_TIME)).toBe(true)
  })

  it("rejects tampered body (wrong HMAC)", () => {
    const original = '{"eventType":"payout.changed","data":{"orderId":"ord-1","status":"DONE"}}'
    const tampered = '{"eventType":"payout.changed","data":{"orderId":"ord-1","status":"CANCELED"}}'
    const sig = makeSignature(original, WEBHOOK_SECRET, TRANSMISSION_TIME)
    expect(verifyTossSignature(Buffer.from(tampered), sig, TRANSMISSION_TIME)).toBe(false)
  })

  it("rejects missing signature", () => {
    const body = '{"eventType":"payout.changed","data":{}}'
    expect(verifyTossSignature(Buffer.from(body), undefined, TRANSMISSION_TIME)).toBe(false)
  })

  it("rejects missing transmission time", () => {
    const body = '{"eventType":"payout.changed","data":{}}'
    const sig = makeSignature(body, WEBHOOK_SECRET, TRANSMISSION_TIME)
    expect(verifyTossSignature(Buffer.from(body), sig, undefined)).toBe(false)
  })

  it("accepts any body when TOSS_WEBHOOK_SECRET is not set (dev mode)", () => {
    delete process.env.TOSS_WEBHOOK_SECRET
    const body = '{"eventType":"test","data":{}}'
    expect(verifyTossSignature(Buffer.from(body), undefined, undefined)).toBe(true)
  })

  it("requires signatures only for Toss payout and seller webhooks", () => {
    expect(requiresTossSignature("payout.changed")).toBe(true)
    expect(requiresTossSignature("seller.changed")).toBe(true)
    expect(requiresTossSignature("PAYMENT_STATUS_CHANGED")).toBe(false)
  })
})

describe("verifyPaymentWebhookData (unit)", () => {
  const savedEnv = { NODE_ENV: process.env.NODE_ENV, TOSS_SECRET_KEY: process.env.TOSS_SECRET_KEY }

  afterEach(() => {
    vi.restoreAllMocks()
    if (savedEnv.NODE_ENV === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = savedEnv.NODE_ENV
    }
    if (savedEnv.TOSS_SECRET_KEY === undefined) {
      delete process.env.TOSS_SECRET_KEY
    } else {
      process.env.TOSS_SECRET_KEY = savedEnv.TOSS_SECRET_KEY
    }
  })

  it("reconciles payment status with Toss API in production", async () => {
    process.env.NODE_ENV = "production"
    process.env.TOSS_SECRET_KEY = "live_sk_test"
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ paymentKey: "pk-1", orderId: "ord-verified", status: "DONE", totalAmount: 55000 }),
    } as Response)

    const data = await verifyPaymentWebhookData("PAYMENT_STATUS_CHANGED", {
      paymentKey: "pk-1",
      orderId: "ord-webhook",
      status: "CANCELED",
    })

    expect(data).toMatchObject({ paymentKey: "pk-1", orderId: "ord-verified", status: "DONE", totalAmount: 55000 })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tosspayments.com/v1/payments/pk-1",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining("Basic ") }) })
    )
  })
})

// ─── Integration: webhook route ──────────────────────────────────────────────
describe("POST /payments/webhook (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.TOSS_WEBHOOK_SECRET
  })

  it("PAYMENT_STATUS_CHANGED DONE updates payment and returns 200", async () => {
    mockRecordWebhookEvent.mockResolvedValueOnce(true)
    const app = buildApp()
    const payload = { eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: "ord-1", paymentKey: "pk-1", status: "DONE" } }

    const res = await app.inject({
      method: "POST",
      url: "/payments/webhook",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ received: true })
    expect(mockHandlePaymentStatusChanged).toHaveBeenCalledWith(payload.data)
  })

  it("idempotent replay returns 200 with duplicate flag (no double-processing)", async () => {
    mockRecordWebhookEvent.mockResolvedValueOnce(false) // already seen
    const app = buildApp()
    const payload = { eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: "ord-1", status: "DONE" } }

    const res = await app.inject({
      method: "POST",
      url: "/payments/webhook",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ received: true, duplicate: true })
    expect(mockHandlePaymentStatusChanged).not.toHaveBeenCalled()
  })

  it("does not require a signature for general payment webhooks", async () => {
    process.env.TOSS_WEBHOOK_SECRET = WEBHOOK_SECRET
    const app = buildApp()
    const payload = { eventType: "PAYMENT_STATUS_CHANGED", data: { orderId: "ord-1", status: "DONE" } }

    const res = await app.inject({
      method: "POST",
      url: "/payments/webhook",
      headers: { "content-type": "application/json", "tosssignature": "badhash000" },
      body: JSON.stringify(payload),
    })

    expect(res.statusCode).toBe(200)
    delete process.env.TOSS_WEBHOOK_SECRET
  })

  it("returns 401 when a signed Toss webhook signature is invalid", async () => {
    process.env.TOSS_WEBHOOK_SECRET = WEBHOOK_SECRET
    const app = buildApp()
    const payload = { eventType: "payout.changed", data: { orderId: "ord-1", status: "DONE" } }

    const res = await app.inject({
      method: "POST",
      url: "/payments/webhook",
      headers: {
        "content-type": "application/json",
        "tosspayments-webhook-signature": "v1:badhash000",
        "tosspayments-webhook-transmission-time": TRANSMISSION_TIME,
      },
      body: JSON.stringify(payload),
    })

    expect(res.statusCode).toBe(401)
    delete process.env.TOSS_WEBHOOK_SECRET
  })
})

// ─── Integration: admin reconcile route ──────────────────────────────────────
describe("PATCH /payments/admin/reconcile/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_KEY = "admin-secret-key"
  })
  afterEach(() => {
    delete process.env.ADMIN_KEY
  })

  it("reconciliation updates stale pending payments and returns result", async () => {
    mockRunPaymentReconciliation.mockResolvedValueOnce({ checked: 3, updated: 2, errors: 0 })
    const app = buildApp()

    const res = await app.inject({
      method: "PATCH",
      url: "/payments/admin/reconcile/pay-uuid-1",
      headers: { "x-admin-key": "admin-secret-key" },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty("id", "pay-uuid-1")
    expect(body.reconciliation).toMatchObject({ checked: 3, updated: 2, errors: 0 })
  })

  it("returns 401 when admin key is missing", async () => {
    const app = buildApp()
    const res = await app.inject({ method: "PATCH", url: "/payments/admin/reconcile/pay-1" })
    expect(res.statusCode).toBe(401)
  })
})
