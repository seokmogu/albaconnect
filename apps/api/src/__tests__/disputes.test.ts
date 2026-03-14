/**
 * disputes.test.ts — dispute resolution route tests
 *
 * Tests:
 *  1. Worker raises NOSHOW_DISPUTE → 201, hold set on job
 *  2. NOSHOW dispute hold blocks payout → 402 with DISPUTE_HOLD code
 *  3. Admin resolves dispute → 200
 *  4. Non-party worker cannot raise dispute → 403
 *  5. Duplicate dispute same job+user+type → 409
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

// ── DB mock ────────────────────────────────────────────────────────────────────
// Use vi.hoisted so mocks are available before import hoisting
const { dbMock } = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  }
  return { dbMock }
})

vi.mock('../db', () => ({
  db: dbMock,
  // Schema field references (drizzle uses these as identifiers in eq/and)
  jobDisputes: {
    id: 'id', jobId: 'jobId', raisedById: 'raisedById', raisedByRole: 'raisedByRole',
    type: 'type', description: 'description', status: 'status',
    resolutionNotes: 'resolutionNotes', resolvedBy: 'resolvedBy', resolvedAt: 'resolvedAt',
  },
  jobPostings: {
    id: 'id', employerId: 'employerId', disputeHold: 'disputeHold',
    updatedAt: 'updatedAt', status: 'status',
  },
  jobApplications: { id: 'id', jobId: 'jobId', workerId: 'workerId', status: 'status' },
  users: { id: 'id' },
  payments: { payerId: 'payerId', tossPaymentKey: 'tossPaymentKey', jobId: 'jobId' },
}))

// ── Helper: build a chained select mock that returns specific values per call ───
// db.select().from().where().limit() chain
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

// ── Setup ──────────────────────────────────────────────────────────────────────
const JOB_ID = '11111111-1111-1111-1111-111111111111'
const WORKER_ID = '22222222-2222-2222-2222-222222222222'
const DISPUTE_ID = '33333333-3333-3333-3333-333333333333'

describe('dispute routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
    delete process.env['ADMIN_KEY']
  })

  // ── Test 1: Worker raises NOSHOW_DISPUTE → 201, hold set ─────────────────────
  it('POST /jobs/:jobId/disputes — worker raises NOSHOW_DISPUTE → 201', async () => {
    const token = app.jwt.sign({ id: WORKER_ID, role: 'worker' })

    mockSelectSequence([
      // 1st: job lookup
      [{ id: JOB_ID, employerId: 'emp-1', status: 'completed' }],
      // 2nd: application lookup (worker is party)
      [{ id: 'app-1' }],
    ])

    dbMock.insert.mockReturnValue({
      values: () => ({
        returning: () => Promise.resolve([{
          id: DISPUTE_ID,
          jobId: JOB_ID,
          raisedById: WORKER_ID,
          raisedByRole: 'worker',
          type: 'NOSHOW_DISPUTE',
          description: 'I was marked no-show but I was present at the job site',
          status: 'open',
          createdAt: new Date().toISOString(),
        }]),
      }),
    })

    dbMock.update.mockReturnValue({
      set: () => ({ where: () => Promise.resolve() }),
    })

    const res = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/disputes`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: {
        type: 'NOSHOW_DISPUTE',
        description: 'I was marked no-show but I was present at the job site',
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.dispute.type).toBe('NOSHOW_DISPUTE')
    expect(body.dispute.status).toBe('open')
    // disputeHold update was triggered (NOSHOW_DISPUTE path)
    expect(dbMock.update).toHaveBeenCalled()
  })

  // ── Test 2: Dispute hold blocks payout → 402 ────────────────────────────────
  it('POST /payments/payout — 402 when disputeHold is true', async () => {
    const token = app.jwt.sign({ id: 'emp-1', role: 'employer' })

    mockSelectSequence([
      // job lookup with disputeHold=true
      [{ id: JOB_ID, employerId: 'emp-1', status: 'completed', disputeHold: true }],
    ])

    const res = await app.inject({
      method: 'POST',
      url: '/payments/payout',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { jobId: JOB_ID },
    })

    expect(res.statusCode).toBe(402)
    expect(res.json().code).toBe('DISPUTE_HOLD')
  })

  // ── Test 3: Admin resolves dispute → 200 ────────────────────────────────────
  it('PATCH /jobs/:jobId/disputes/:disputeId — admin resolves → 200', async () => {
    process.env['ADMIN_KEY'] = 'test-admin-key'
    const token = app.jwt.sign({ id: 'admin-1', role: 'employer' })

    mockSelectSequence([
      // dispute lookup
      [{ id: DISPUTE_ID, jobId: JOB_ID, type: 'NOSHOW_DISPUTE', status: 'open' }],
      // remaining open NOSHOW disputes → empty (no others)
      [],
    ])

    dbMock.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([{
            id: DISPUTE_ID,
            jobId: JOB_ID,
            type: 'NOSHOW_DISPUTE',
            status: 'resolved',
            resolutionNotes: 'GPS confirms worker was present',
            resolvedBy: 'admin-1',
            resolvedAt: new Date().toISOString(),
          }]),
        }),
      }),
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/jobs/${JOB_ID}/disputes/${DISPUTE_ID}`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-admin-key': 'test-admin-key',
        'content-type': 'application/json',
      },
      payload: {
        status: 'resolved',
        resolutionNotes: 'GPS confirms worker was present',
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.dispute.status).toBe('resolved')
    expect(body.dispute.resolutionNotes).toBe('GPS confirms worker was present')
  })

  // ── Test 4: Non-party worker gets 403 ───────────────────────────────────────
  it('POST /jobs/:jobId/disputes — non-party worker gets 403', async () => {
    const token = app.jwt.sign({ id: 'other-worker', role: 'worker' })

    mockSelectSequence([
      // job exists
      [{ id: JOB_ID, employerId: 'emp-1', status: 'completed' }],
      // no application for this worker
      [],
    ])

    const res = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/disputes`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: {
        type: 'NOSHOW_DISPUTE',
        description: 'I was marked no-show but I was present at the job site',
      },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/party/i)
  })

  // ── Test 5: Duplicate dispute → 409 ─────────────────────────────────────────
  it('POST /jobs/:jobId/disputes — duplicate type returns 409', async () => {
    const token = app.jwt.sign({ id: WORKER_ID, role: 'worker' })

    mockSelectSequence([
      // job exists
      [{ id: JOB_ID, employerId: 'emp-1', status: 'completed' }],
      // worker has application
      [{ id: 'app-1' }],
    ])

    // insert throws unique constraint violation
    dbMock.insert.mockReturnValue({
      values: () => ({
        returning: () => Promise.reject({ code: '23505' }),
      }),
    })

    const res = await app.inject({
      method: 'POST',
      url: `/jobs/${JOB_ID}/disputes`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: {
        type: 'NOSHOW_DISPUTE',
        description: 'I was marked no-show but I was present at the job site',
      },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/already raised/i)
  })
})
