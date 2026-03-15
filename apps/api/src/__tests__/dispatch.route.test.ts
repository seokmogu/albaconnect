import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildApp } from "../index.js"

const mocks = vi.hoisted(() => {
  const selectLimitMock = vi.fn()
  const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }))
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }))
  const selectMock = vi.fn(() => ({ from: selectFromMock }))
  const dispatchJobMock = vi.fn()
  return { selectLimitMock, selectWhereMock, selectFromMock, selectMock, dispatchJobMock }
})

vi.mock("../db", () => ({
  db: {
    select: mocks.selectMock,
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  },
  jobPostings: { id: "id", employerId: "employerId", status: "status" },
  jobApplications: {},
  users: {},
  penalties: {},
  workerProfiles: {},
  employerProfiles: {},
}))

vi.mock("../services/matching", () => ({
  dispatchJob: mocks.dispatchJobMock,
  distanceKm: vi.fn(),
  workerSockets: new Map(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
  handleRejectOffer: vi.fn(),
}))

vi.mock("../routes/notifications", () => ({
  notificationRoutes: vi.fn(),
  createNotification: vi.fn(),
  setNotificationEmitter: vi.fn(),
  notifications: {},
}))

describe("POST /jobs/:id/dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 202 when employer triggers dispatch on their own open job", async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([{
      id: "job-1",
      employerId: "employer-1",
      status: "open",
      title: "Barista Help",
      hourlyRate: 15000,
      headcount: 2,
      matchedCount: 0,
    }])

    const app = await buildApp()
    const token = app.jwt.sign({ id: "employer-1", email: "boss@test.com", role: "employer" })

    const response = await app.inject({
      method: "POST",
      url: "/jobs/job-1/dispatch",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(202)
    expect(JSON.parse(response.body)).toMatchObject({ message: "Dispatch triggered" })
    await app.close()
  })

  it("returns 403 when employer does not own the job", async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([{
      id: "job-1",
      employerId: "other-employer",
      status: "open",
    }])

    const app = await buildApp()
    const token = app.jwt.sign({ id: "employer-1", email: "boss@test.com", role: "employer" })

    const response = await app.inject({
      method: "POST",
      url: "/jobs/job-1/dispatch",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })

  it("returns 404 when job does not exist", async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([])

    const app = await buildApp()
    const token = app.jwt.sign({ id: "employer-1", email: "boss@test.com", role: "employer" })

    const response = await app.inject({
      method: "POST",
      url: "/jobs/nonexistent/dispatch",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it("returns 409 when job is not open", async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([{
      id: "job-1",
      employerId: "employer-1",
      status: "cancelled",
    }])

    const app = await buildApp()
    const token = app.jwt.sign({ id: "employer-1", email: "boss@test.com", role: "employer" })

    const response = await app.inject({
      method: "POST",
      url: "/jobs/job-1/dispatch",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(409)
    await app.close()
  })

  it("returns 401 when no auth token provided", async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: "POST",
      url: "/jobs/job-1/dispatch",
    })

    expect(response.statusCode).toBe(401)
    await app.close()
  })
})
