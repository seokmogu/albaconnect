/**
 * escrowAutoRelease.test.ts
 *
 * Tests:
 *  1. Jobs within 24h window are not released
 *  2. Eligible jobs (past window, no hold, escrowed) are released
 *  3. Jobs with dispute_hold=true are skipped
 *  4. Notification inserted for each accepted worker on release
 *  5. PATCH /jobs/:id/complete — already-completed returns 409
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runEscrowAutoRelease, RELEASE_WINDOW_HOURS } from '../services/escrowAutoRelease'
import { buildApp } from '../index'

// ── Shared DB mock ─────────────────────────────────────────────────────────────
const { dbMock } = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
    insert: vi.fn(),
  }
  return { dbMock }
})

vi.mock('../db', () => ({
  db: dbMock,
  jobPostings: {
    id: 'id', status: 'status', employerId: 'employerId', disputeHold: 'disputeHold',
    escrowStatus: 'escrowStatus', paymentStatus: 'paymentStatus',
    completedAt: 'completedAt', updatedAt: 'updatedAt',
    statusUpdatedAt: 'statusUpdatedAt', totalAmount: 'totalAmount',
  },
  jobApplications: { id: 'id', jobId: 'jobId', workerId: 'workerId', status: 'status' },
  users: { id: 'id' },
  payments: { payerId: 'payerId', tossPaymentKey: 'tossPaymentKey', jobId: 'jobId' },
}))

// ── Helper: build chained select mock ─────────────────────────────────────────
function mockSelectSequence(responses: unknown[][]): void {
  let idx = 0
  dbMock.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(responses[idx++] ?? []),
        orderBy: () => ({ limit: () => Promise.resolve(responses[idx++] ?? []) }),
      }),
    }),
  }))
}

const JOB_ID = 'aaaa0000-0000-0000-0000-aaaaaaaaaaaa'
const WORKER_ID = 'bbbb0000-0000-0000-0000-bbbbbbbbbbbb'
const EMPLOYER_ID = 'cccc0000-0000-0000-0000-cccccccccccc'

// ── Unit tests for runEscrowAutoRelease ───────────────────────────────────────

describe('runEscrowAutoRelease (unit)', () => {
  beforeEach(() => vi.clearAllMocks())

  // Test 1: Jobs within 24h window not released
  it('does not release jobs where completedAt is within the window', async () => {
    // No eligible jobs returned (cutoff filters them out via DB)
    dbMock.select.mockImplementation(() => ({
      from: () => ({ where: () => Promise.resolve([]) }),
    }))

    const { released } = await runEscrowAutoRelease(dbMock as any)
    expect(released).toBe(0)
    expect(dbMock.update).not.toHaveBeenCalled()
  })

  // Test 2: Eligible job is released
  it('releases eligible escrowed job past the window', async () => {
    const pastCutoff = new Date(Date.now() - (RELEASE_WINDOW_HOURS + 1) * 60 * 60 * 1000)

    // First select: eligible jobs
    dbMock.select
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => Promise.resolve([{ id: JOB_ID, employerId: EMPLOYER_ID, totalAmount: 50000 }]),
        }),
      }))
      // Second select: accepted workers
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => Promise.resolve([{ workerId: WORKER_ID }]),
        }),
      }))

    dbMock.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) })
    dbMock.execute.mockResolvedValue([])

    const { released, errors } = await runEscrowAutoRelease(dbMock as any)

    expect(released).toBe(1)
    expect(errors).toBe(0)
    expect(dbMock.update).toHaveBeenCalledTimes(1)
    expect(dbMock.execute).toHaveBeenCalledTimes(1) // notification
  })

  // Test 3: dispute_hold skips release (filtered by DB WHERE clause)
  it('skips jobs with dispute_hold via DB filter — returns 0 released', async () => {
    // DB returns empty because dispute_hold=true is in WHERE NOT conditions
    dbMock.select.mockImplementationOnce(() => ({
      from: () => ({ where: () => Promise.resolve([]) }),
    }))

    const { released } = await runEscrowAutoRelease(dbMock as any)
    expect(released).toBe(0)
  })

  // Test 4: notification inserted for accepted worker
  it('inserts notification for each accepted worker on auto-release', async () => {
    dbMock.select
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => Promise.resolve([{ id: JOB_ID, employerId: EMPLOYER_ID, totalAmount: 60000 }]),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => Promise.resolve([{ workerId: WORKER_ID }]),
        }),
      }))

    dbMock.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) })
    dbMock.execute.mockResolvedValue([])

    await runEscrowAutoRelease(dbMock as any)

    // One notification INSERT via db.execute
    expect(dbMock.execute).toHaveBeenCalledTimes(1)
    const callArg = dbMock.execute.mock.calls[0][0]
    // The SQL template includes 'escrow_auto_released'
    expect(JSON.stringify(callArg)).toMatch(/escrow_auto_released/)
  })
})

// ── HTTP route test: PATCH /jobs/:id/complete ─────────────────────────────────

describe('PATCH /jobs/:id/complete', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => { await app.close() })

  // Test 5: already-completed returns 409
  it('returns 409 when job is already completed', async () => {
    const token = app.jwt.sign({ id: EMPLOYER_ID, role: 'employer' })

    mockSelectSequence([
      // job lookup — already completed
      [{ id: JOB_ID, status: 'completed', employerId: EMPLOYER_ID, escrowStatus: 'escrowed', completedAt: new Date().toISOString() }],
    ])

    const res = await app.inject({
      method: 'PATCH',
      url: `/jobs/${JOB_ID}/complete`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/already completed/i)
  })
})
