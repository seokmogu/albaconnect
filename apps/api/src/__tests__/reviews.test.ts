/**
 * Tests for bi-directional review system (POST /jobs/:id/review, GET /workers/:id/reviews, GET /employers/:id/reviews).
 * Covers: worker reviews employer, employer reviews worker, duplicate 409, non-involved 403,
 * worker aggregate, employer aggregate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildApp } from "../index.js"

const mocks = vi.hoisted(() => {
  const selectLimitMock = vi.fn()
  const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }))
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }))
  const selectMock = vi.fn(() => ({ from: selectFromMock }))
  const executeMock = vi.fn().mockResolvedValue({ rows: [] })
  const insertReturningMock = vi.fn()
  const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }))
  const insertMock = vi.fn(() => ({ values: insertValuesMock }))
  return {
    selectLimitMock, selectWhereMock, selectFromMock, selectMock,
    executeMock, insertReturningMock, insertValuesMock, insertMock,
  }
})

vi.mock("../db", () => ({
  db: {
    select: mocks.selectMock,
    execute: mocks.executeMock,
    insert: mocks.insertMock,
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
  jobPostings: { id: "id", employerId: "employerId", status: "status" },
  jobApplications: {},
  reviews: { id: "id", jobId: "jobId", reviewerId: "reviewerId", revieweeId: "revieweeId", reviewerRole: "reviewerRole" },
  users: { id: "id", role: "role" },
  workerProfiles: {},
  employerProfiles: {},
  penalties: {},
  payments: {},
}))

vi.mock("../services/matching", () => ({
  dispatchJob: vi.fn(),
  distanceKm: vi.fn(),
  workerSockets: new Map(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
  handleRejectOffer: vi.fn(),
}))

vi.mock("../routes/notifications", () => ({
  notificationRoutes: vi.fn(),
  createNotification: vi.fn(),
  notifications: {},
}))

// Mock prom-client to avoid metric registration conflicts between test runs
vi.mock("../lib/metrics", () => ({
  reviewSubmittedCounter: { inc: vi.fn() },
  metricsRegistry: { metrics: vi.fn(), contentType: "text/plain" },
}))

describe("POST /jobs/:id/review — bi-directional verified review", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("worker reviews employer for a completed job (201)", async () => {
    // job lookup — completed, employer is emp-1
    mocks.selectLimitMock
      .mockResolvedValueOnce([{ id: "job-1", employerId: "emp-1", status: "completed" }])
    // worker involvement check: job_applications has worker-1 completed
    mocks.executeMock.mockResolvedValueOnce({ rows: [{ worker_id: "worker-1" }] })
    // duplicate check — no existing review
    mocks.selectLimitMock.mockResolvedValueOnce([])
    // insert review
    mocks.insertReturningMock.mockResolvedValueOnce([{
      id: "rev-1", jobId: "job-1", reviewerId: "worker-1", revieweeId: "emp-1",
      rating: 4, comment: "Good pay!", reviewerRole: "worker",
    }])
    // reviewee role lookup (employer)
    mocks.selectLimitMock.mockResolvedValueOnce([{ role: "employer" }])
    // aggregate update
    mocks.executeMock.mockResolvedValueOnce({ rows: [] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: "worker-1", email: "worker@test.com", role: "worker" })

    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-1/review",
      headers: { authorization: `Bearer ${token}` },
      payload: { rating: 4, comment: "Good pay!" },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty("review")
    expect(body.review.reviewerRole).toBe("worker")
    await app.close()
  })

  it("employer reviews worker for a completed job (201)", async () => {
    // job lookup — employer-1 owns this job
    mocks.selectLimitMock
      .mockResolvedValueOnce([{ id: "job-2", employerId: "employer-1", status: "completed" }])
    // worker lookup from job_applications
    mocks.executeMock.mockResolvedValueOnce({ rows: [{ worker_id: "worker-2" }] })
    // duplicate check
    mocks.selectLimitMock.mockResolvedValueOnce([])
    // insert review
    mocks.insertReturningMock.mockResolvedValueOnce([{
      id: "rev-2", jobId: "job-2", reviewerId: "employer-1", revieweeId: "worker-2",
      rating: 5, reviewerRole: "employer",
    }])
    // reviewee role lookup (worker)
    mocks.selectLimitMock.mockResolvedValueOnce([{ role: "worker" }])
    // aggregate update
    mocks.executeMock.mockResolvedValueOnce({ rows: [] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: "employer-1", email: "emp@test.com", role: "employer" })

    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-2/review",
      headers: { authorization: `Bearer ${token}` },
      payload: { rating: 5 },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty("review")
    await app.close()
  })

  it("returns 409 when reviewer tries to review the same job twice (duplicate review)", async () => {
    // job exists and is completed
    mocks.selectLimitMock
      .mockResolvedValueOnce([{ id: "job-3", employerId: "emp-3", status: "completed" }])
    // worker involvement check
    mocks.executeMock.mockResolvedValueOnce({ rows: [{ worker_id: "worker-3" }] })
    // existing review found (duplicate)
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: "existing-rev" }])

    const app = await buildApp()
    const token = app.jwt.sign({ id: "worker-3", email: "w@test.com", role: "worker" })

    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-3/review",
      headers: { authorization: `Bearer ${token}` },
      payload: { rating: 3 },
    })

    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe("DUPLICATE")
    await app.close()
  })

  it("returns 403 when worker was not involved in the job (non-involved user)", async () => {
    // job exists and is completed
    mocks.selectLimitMock
      .mockResolvedValueOnce([{ id: "job-4", employerId: "emp-4", status: "completed" }])
    // worker involvement check returns no rows (stranger worker)
    mocks.executeMock.mockResolvedValueOnce({ rows: [] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: "stranger-worker", email: "s@test.com", role: "worker" })

    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-4/review",
      headers: { authorization: `Bearer ${token}` },
      payload: { rating: 1 },
    })

    expect(res.statusCode).toBe(403)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe("FORBIDDEN")
    await app.close()
  })
})

describe("GET /workers/:id/reviews — worker review aggregate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns paginated reviews and correct aggregate for a worker", async () => {
    mocks.executeMock
      .mockResolvedValueOnce({
        rows: [
          { id: "rev-10", rating: 5, comment: "Excellent!", reviewer_role: "employer", created_at: "2026-01-01" },
          { id: "rev-11", rating: 4, comment: "Good", reviewer_role: "employer", created_at: "2026-01-02" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ rating_avg: "4.50", rating_count: "2" }] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: "u-1", email: "u@test.com", role: "worker" })

    const res = await app.inject({
      method: "GET",
      url: "/workers/worker-10/reviews",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty("reviews")
    expect(body).toHaveProperty("aggregate")
    expect(body.aggregate.avg).toBe(4.5)
    expect(body.aggregate.count).toBe(2)
    await app.close()
  })
})

describe("GET /employers/:id/reviews — employer review aggregate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns paginated reviews and correct aggregate for an employer", async () => {
    mocks.executeMock
      .mockResolvedValueOnce({
        rows: [
          { id: "rev-20", rating: 3, comment: "Decent", reviewer_role: "worker", created_at: "2026-02-01" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ rating_avg: "3.00", rating_count: "1" }] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: "emp-20", email: "e@test.com", role: "employer" })

    const res = await app.inject({
      method: "GET",
      url: "/employers/emp-20/reviews",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty("reviews")
    expect(body).toHaveProperty("aggregate")
    expect(body.aggregate.avg).toBe(3.0)
    expect(body.aggregate.count).toBe(1)
    await app.close()
  })
})
