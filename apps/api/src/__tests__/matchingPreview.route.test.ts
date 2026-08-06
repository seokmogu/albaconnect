import { beforeEach, describe, expect, it, vi } from "vitest"
import { buildApp } from "../index"

const dbMocks = vi.hoisted(() => {
  const selectLimit = vi.fn()
  const selectWhere = vi.fn(() => ({ limit: selectLimit }))
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  const select = vi.fn(() => ({ from: selectFrom }))
  return { select, selectLimit }
})

const matchingMocks = vi.hoisted(() => ({
  dispatchJob: vi.fn(),
  workerSockets: new Map<string, string>(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
  handleRejectOffer: vi.fn(),
}))

const previewMocks = vi.hoisted(() => ({
  previewJobMatches: vi.fn(),
}))

vi.mock("../db", () => ({
  db: {
    select: dbMocks.select,
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
  jobPostings: { id: "id", employerId: "employerId" },
  jobApplications: { id: "id", jobId: "jobId", status: "status" },
  users: {},
  penalties: {},
  workerProfiles: {},
  employerProfiles: {},
  payments: { payerId: "payerId" },
}))

vi.mock("../services/matching", () => matchingMocks)
vi.mock("../services/matchingPreview", () => previewMocks)

describe("GET /jobs/:id/match-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a read-only preview for the job owner", async () => {
    dbMocks.selectLimit.mockResolvedValueOnce([{ id: "job-1", employerId: "employer-1" }])
    previewMocks.previewJobMatches.mockResolvedValueOnce({
      mode: "read_only",
      quality: { totalCandidates: 12 },
      warnings: [],
      candidates: [],
    })
    const app = await buildApp()
    const token = app.jwt.sign({ id: "employer-1", role: "employer" })

    const response = await app.inject({
      method: "GET",
      url: "/jobs/job-1/match-preview?limit=3",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().mode).toBe("read_only")
    expect(previewMocks.previewJobMatches).toHaveBeenCalledWith("job-1", 3)
    await app.close()
  })

  it("does not expose a preview to another employer", async () => {
    dbMocks.selectLimit.mockResolvedValueOnce([{ id: "job-1", employerId: "employer-2" }])
    const app = await buildApp()
    const token = app.jwt.sign({ id: "employer-1", role: "employer" })

    const response = await app.inject({
      method: "GET",
      url: "/jobs/job-1/match-preview",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(403)
    expect(previewMocks.previewJobMatches).not.toHaveBeenCalled()
    await app.close()
  })

  it("rejects a preview limit outside the supported range", async () => {
    const app = await buildApp()
    const token = app.jwt.sign({ id: "employer-1", role: "employer" })

    const response = await app.inject({
      method: "GET",
      url: "/jobs/job-1/match-preview?limit=21",
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(400)
    expect(dbMocks.select).not.toHaveBeenCalled()
    await app.close()
  })
})
