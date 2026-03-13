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
  return { selectLimitMock, selectWhereMock, selectFromMock, selectMock, executeMock, insertReturningMock, insertValuesMock, insertMock }
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
  reviews: { id: "id", jobId: "jobId", reviewerId: "reviewerId", revieweeId: "revieweeId" },
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

describe("POST /jobs/:id/ratings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 201 when employer rates a worker for a completed job", async () => {
    // job lookup
    mocks.selectLimitMock
      .mockResolvedValueOnce([{ id: "job-1", employerId: "emp-1", status: "completed" }])
    // worker lookup from job_applications
    mocks.executeMock.mockResolvedValueOnce({ rows: [{ worker_id: "worker-1" }] })
    // duplicate check
    mocks.selectLimitMock.mockResolvedValueOnce([])
    // insert review
    mocks.insertReturningMock.mockResolvedValueOnce([{ id: "rev-1", rating: 5, revieweeId: "worker-1" }])
    // reviewee role lookup
    mocks.selectLimitMock.mockResolvedValueOnce([{ role: "worker" }])
    // aggregate update (execute)
    mocks.executeMock.mockResolvedValueOnce({ rows: [] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: "emp-1", email: "emp@test.com", role: "employer" })

    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-1/ratings",
      headers: { authorization: `Bearer ${token}` },
      payload: { score: 5, comment: "Great worker!" },
    })

    expect(res.statusCode).toBe(201)
    await app.close()
  })

  it("returns 409 when employer tries to rate the same job twice", async () => {
    mocks.selectLimitMock
      .mockResolvedValueOnce([{ id: "job-1", employerId: "emp-1", status: "completed" }])
    mocks.executeMock.mockResolvedValueOnce({ rows: [{ worker_id: "worker-1" }] })
    // existing review found
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: "existing-review" }])

    const app = await buildApp()
    const token = app.jwt.sign({ id: "emp-1", email: "emp@test.com", role: "employer" })

    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-1/ratings",
      headers: { authorization: `Bearer ${token}` },
      payload: { score: 3 },
    })

    expect(res.statusCode).toBe(409)
    await app.close()
  })

  it("returns 400 when job is not completed", async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: "job-1", employerId: "emp-1", status: "open" }])

    const app = await buildApp()
    const token = app.jwt.sign({ id: "emp-1", email: "emp@test.com", role: "employer" })

    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-1/ratings",
      headers: { authorization: `Bearer ${token}` },
      payload: { score: 4 },
    })

    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it("returns 404 when job does not exist", async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([])

    const app = await buildApp()
    const token = app.jwt.sign({ id: "emp-1", email: "emp@test.com", role: "employer" })

    const res = await app.inject({
      method: "POST",
      url: "/jobs/nonexistent/ratings",
      headers: { authorization: `Bearer ${token}` },
      payload: { score: 4 },
    })

    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it("returns 400 when score is out of range", async () => {
    const app = await buildApp()
    const token = app.jwt.sign({ id: "emp-1", email: "emp@test.com", role: "employer" })

    const res = await app.inject({
      method: "POST",
      url: "/jobs/job-1/ratings",
      headers: { authorization: `Bearer ${token}` },
      payload: { score: 6 },
    })

    expect(res.statusCode).toBe(400)
    await app.close()
  })
})

describe("GET /workers/:id/ratings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns ratings and aggregate for a worker", async () => {
    mocks.executeMock
      .mockResolvedValueOnce({ rows: [{ id: "rev-1", rating: 5, comment: "Good!" }] })
      .mockResolvedValueOnce({ rows: [{ rating_avg: "4.50", rating_count: "3" }] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: "u-1", email: "u@test.com", role: "worker" })

    const res = await app.inject({
      method: "GET",
      url: "/workers/worker-1/ratings",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty("ratings")
    expect(body).toHaveProperty("aggregate")
    await app.close()
  })
})

describe("GET /employers/:id/ratings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns ratings and aggregate for an employer", async () => {
    mocks.executeMock
      .mockResolvedValueOnce({ rows: [{ id: "rev-2", rating: 4, comment: "Fair employer" }] })
      .mockResolvedValueOnce({ rows: [{ rating_avg: "4.00", rating_count: "1" }] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: "emp-1", email: "emp@test.com", role: "employer" })

    const res = await app.inject({
      method: "GET",
      url: "/employers/emp-1/ratings",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty("ratings")
    expect(body).toHaveProperty("aggregate")
    await app.close()
  })
})
