/**
 * invoices.test.ts — Employer invoice generation and PDF routes
 *
 * Tests:
 *  1. GET /api/employers/invoices — returns invoice list for employer
 *  2. GET /api/employers/invoices/:jobId/pdf — streams application/pdf for completed job
 *  3. GET /api/employers/invoices/:jobId/pdf — returns 403 for non-owner employer
 *  4. GET /api/employers/invoices/:jobId/pdf — returns 404 for pending (non-completed) job
 *  5. POST /api/admin/invoices/bulk-generate — admin returns count of completed jobs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildApp } from "../index"

// ── DB mock ───────────────────────────────────────────────────────────────────
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
  jobPostings: {
    id: "id",
    employerId: "employerId",
    status: "status",
    completedAt: "completedAt",
    totalAmount: "totalAmount",
    escrowStatus: "escrowStatus",
    paymentStatus: "paymentStatus",
    invoiceDownloadedAt: "invoiceDownloadedAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    startAt: "startAt",
    endAt: "endAt",
    title: "title",
  },
  payments: { jobId: "jobId", amount: "amount", platformFee: "platformFee" },
  employerProfiles: { userId: "userId", companyName: "companyName" },
  users: { id: "id" },
}))

vi.mock("../db/migrate", () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
  runNotificationsMigration: vi.fn().mockResolvedValue(undefined),
  runInvoiceMigration: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../lib/redis", () => ({
  getRedisClient: vi.fn().mockReturnValue(null),
  checkRedisHealth: vi.fn().mockResolvedValue("unavailable"),
}))

vi.mock("../services/escrowAutoRelease", () => ({
  startEscrowAutoReleaseWorker: vi.fn(),
  stopEscrowAutoReleaseWorker: vi.fn(),
}))

vi.mock("../services/workerAlertWorker", () => ({
  startWorkerAlertWorker: vi.fn(),
  stopWorkerAlertWorker: vi.fn(),
}))

vi.mock("../services/jobExpiry", () => ({
  processExpiredJobs: vi.fn(),
}))

vi.mock("../services/matching", () => ({
  workerSockets: new Map(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
  handleRejectOffer: vi.fn(),
}))

vi.mock("../routes/notifications", () => ({
  notificationRoutes: vi.fn(async () => {}),
  createNotification: vi.fn().mockResolvedValue(undefined),
  setNotificationEmitter: vi.fn(),
}))

vi.mock("../plugins/sentry", () => ({
  default: async (app: any) => {},
}))

vi.mock("../services/kakaoAlimTalk.js", () => ({
  initKakaoAlimTalk: vi.fn(),
  sendAlimTalk: vi.fn().mockResolvedValue(true),
}))

// ── token helpers ─────────────────────────────────────────────────────────────
const EMPLOYER_ID = "emp-user-1111-1111-111111111111"
const OTHER_EMPLOYER_ID = "emp-user-2222-2222-222222222222"
const JOB_ID = "job-id-1111-1111-111111111111"

function makeEmployerToken(app: any, userId = EMPLOYER_ID) {
  return app.jwt.sign({ userId, role: "employer" })
}

function makeAdminHeaders(app: any) {
  const token = app.jwt.sign({ userId: "admin-user-id", role: "employer" })
  return {
    authorization: `Bearer ${token}`,
    "x-admin-key": process.env.ADMIN_KEY ?? "test-admin-key",
  }
}

// ── test suite ────────────────────────────────────────────────────────────────
describe("Invoice routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.ADMIN_KEY = "test-admin-key"
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ── Test 1: Invoice list ──────────────────────────────────────────────────
  it("GET /api/employers/invoices returns paginated invoice list", async () => {
    const now = new Date("2026-03-14T12:00:00Z")
    dbMock.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: JOB_ID,
                title: "카페 홀서빙",
                completedAt: now,
                totalAmount: 80000,
                escrowStatus: "released",
                paymentStatus: "completed",
                invoiceDownloadedAt: null,
                createdAt: now,
              },
            ]),
          }),
        }),
      }),
    })

    const token = makeEmployerToken(app)
    const res = await app.inject({
      method: "GET",
      url: "/api/employers/invoices",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0]!.jobId).toBe(JOB_ID)
    expect(body.data[0]!.invoiceNumber).toMatch(/^INV-[A-Z0-9]{8}-\d{8}$/)
    expect(body.data[0]!.downloadUrl).toBe(`/api/employers/invoices/${JOB_ID}/pdf`)
    expect(body.nextCursor).toBeNull()
  })

  // ── Test 2: PDF stream for completed job ──────────────────────────────────
  it("GET /api/employers/invoices/:jobId/pdf streams PDF for completed job", async () => {
    const now = new Date("2026-03-14T12:00:00Z")
    const jobRow = {
      id: JOB_ID,
      employerId: EMPLOYER_ID,
      title: "카페 홀서빙",
      status: "completed",
      startAt: new Date("2026-03-10T09:00:00Z"),
      endAt: new Date("2026-03-10T18:00:00Z"),
      hourlyRate: 10000,
      totalAmount: 80000,
      completedAt: now,
      invoiceDownloadedAt: null,
    }

    // select: job → employer → payment → update
    dbMock.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([jobRow]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ companyName: "테스트 카페" }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { amount: 80000, platformFee: 4000 },
            ]),
          }),
        }),
      })

    dbMock.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    })

    const token = makeEmployerToken(app)
    const res = await app.inject({
      method: "GET",
      url: `/api/employers/invoices/${JOB_ID}/pdf`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toBe("application/pdf")
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="invoice-INV-/)
    expect(res.rawPayload.length).toBeGreaterThan(100) // PDF has content
  })

  // ── Test 3: Non-owner gets 404 ────────────────────────────────────────────
  it("GET /api/employers/invoices/:jobId/pdf returns 404 for non-owner", async () => {
    dbMock.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]), // No row → not owner
        }),
      }),
    })

    const token = makeEmployerToken(app, OTHER_EMPLOYER_ID)
    const res = await app.inject({
      method: "GET",
      url: `/api/employers/invoices/${JOB_ID}/pdf`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(404)
    const body = res.json()
    expect(body.error.code).toBe("NOT_FOUND")
  })

  // ── Test 4: Pending (non-completed) job returns 404 ──────────────────────
  it("GET /api/employers/invoices/:jobId/pdf returns 404 for non-completed job", async () => {
    dbMock.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: JOB_ID,
              employerId: EMPLOYER_ID,
              status: "open", // not completed
              title: "카페 홀서빙",
              startAt: new Date(),
              endAt: new Date(),
              totalAmount: 80000,
              completedAt: null,
            },
          ]),
        }),
      }),
    })

    const token = makeEmployerToken(app)
    const res = await app.inject({
      method: "GET",
      url: `/api/employers/invoices/${JOB_ID}/pdf`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(404)
    const body = res.json()
    expect(body.error.code).toBe("NOT_COMPLETED")
  })

  // ── Test 5: Admin bulk-generate ───────────────────────────────────────────
  it("POST /api/admin/invoices/bulk-generate returns count of completed jobs", async () => {
    const now = new Date("2026-03-14T12:00:00Z")
    dbMock.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: "job-aaa", completedAt: now },
          { id: "job-bbb", completedAt: now },
          { id: "job-ccc", completedAt: new Date("2026-02-01T00:00:00Z") }, // out of default range
        ]),
      }),
    })

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/invoices/bulk-generate?from=2026-03-01&to=2026-03-31",
      headers: makeAdminHeaders(app),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.count).toBeGreaterThanOrEqual(1)
    expect(body.invoices).toBeDefined()
    expect(Array.isArray(body.invoices)).toBe(true)
    if (body.invoices.length > 0) {
      expect(body.invoices[0]!.invoiceNumber).toMatch(/^INV-/)
      expect(body.invoices[0]!.downloadUrl).toMatch(/^\/api\/employers\/invoices\//)
    }
  })
})
