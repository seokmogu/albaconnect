import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── DB mock (hoisted so vi.mock factory can reference it) ────────────────────
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }))

vi.mock("../db", () => ({
  db: { execute: mockExecute },
  jobPostings: {},
  jobApplications: {},
}))

import { processExpiredJobs, type EmitFn } from "../services/jobExpiry"

// ─────────────────────────────────────────────────────────────────────────────

const EXPIRED_JOB_ROW = {
  id: "job-1",
  employer_id: "emp-1",
  escrow_status: "escrowed",
  matched_count: 0,
}

const ACCEPTED_APP_ROW = { worker_id: "worker-1" }

/** Set up mock DB call sequence for a single expired job with one accepted worker */
function mockSingleExpiredJob() {
  mockExecute
    .mockResolvedValueOnce({ rows: [EXPIRED_JOB_ROW] })   // SELECT FOR UPDATE SKIP LOCKED
    .mockResolvedValueOnce({ rows: [] })                    // UPDATE job_postings
    .mockResolvedValueOnce({ rows: [ACCEPTED_APP_ROW] })   // SELECT accepted applications
    .mockResolvedValueOnce({ rows: [] })                    // UPDATE job_applications
}

// ─────────────────────────────────────────────────────────────────────────────

describe("processExpiredJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns zero counts when no expired jobs found", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] })

    const result = await processExpiredJobs()

    expect(result.expiredCount).toBe(0)
    expect(result.noshowCount).toBe(0)
    expect(mockExecute).toHaveBeenCalledTimes(1) // only the SELECT
  })

  it("returns correct counts for one expired job with one noshow", async () => {
    mockSingleExpiredJob()

    const result = await processExpiredJobs()

    expect(result.expiredCount).toBe(1)
    expect(result.noshowCount).toBe(1)
  })

  it("refunds escrow when matched_count=0 and escrow_status=escrowed", async () => {
    mockSingleExpiredJob()

    await processExpiredJobs()

    // processExpiredJobs sets shouldRefund=true → passes "refunded" as a param to db.execute
    // We verify it was called 4 times (select, update, select-apps, update-apps)
    expect(mockExecute).toHaveBeenCalledTimes(4)
    // The UPDATE call (index 1) should include the refunded value as a bound param
    const updateCall = mockExecute.mock.calls[1][0]
    // drizzle sql tag: values are in .queryChunks or as interpolated params
    const callStr = JSON.stringify(updateCall)
    expect(callStr).toContain("refunded")
  })

  it("does NOT refund escrow when matched_count > 0", async () => {
    const jobWithMatches = { ...EXPIRED_JOB_ROW, matched_count: 2, escrow_status: "escrowed" }
    mockExecute
      .mockResolvedValueOnce({ rows: [jobWithMatches] }) // SELECT
      .mockResolvedValueOnce({ rows: [] })                // UPDATE job_postings
      .mockResolvedValueOnce({ rows: [] })                // SELECT accepted (none)

    await processExpiredJobs()

    // shouldRefund=false → passes job.escrow_status ("escrowed") not "refunded"
    const updateCall = mockExecute.mock.calls[1][0]
    const callStr = JSON.stringify(updateCall)
    expect(callStr).not.toContain("refunded")
    expect(callStr).toContain("escrowed")
  })

  it("calls emitFn with job_expired event for employer and worker", async () => {
    mockSingleExpiredJob()

    const emitFn = vi.fn<EmitFn>()
    await processExpiredJobs(emitFn)

    expect(emitFn).toHaveBeenCalledWith(
      "job_expired",
      expect.arrayContaining(["emp-1", "worker-1"]),
      expect.objectContaining({ jobId: "job-1" })
    )
  })

  it("does not call emitFn when no expired jobs", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] })

    const emitFn = vi.fn<EmitFn>()
    await processExpiredJobs(emitFn)

    expect(emitFn).not.toHaveBeenCalled()
  })

  it("does not throw when emitFn is undefined (optional param guard)", async () => {
    mockSingleExpiredJob()

    await expect(processExpiredJobs(undefined)).resolves.toMatchObject({
      expiredCount: 1,
      noshowCount: 1,
    })
  })

  it("continues processing remaining jobs after single-job failure", async () => {
    const job2 = { ...EXPIRED_JOB_ROW, id: "job-2", employer_id: "emp-2" }
    mockExecute
      .mockResolvedValueOnce({ rows: [EXPIRED_JOB_ROW, job2] }) // SELECT returns 2
      .mockRejectedValueOnce(new Error("DB error on job-1"))     // UPDATE fails for job-1
      .mockResolvedValueOnce({ rows: [] })                        // UPDATE succeeds for job-2
      .mockResolvedValueOnce({ rows: [] })                        // SELECT accepted for job-2

    // Should not throw, should count the successful one
    const result = await processExpiredJobs()
    expect(result.expiredCount).toBe(1) // only job-2 succeeded
  })
})
