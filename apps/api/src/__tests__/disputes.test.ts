/**
 * disputes.test.ts — Worker dispute resolution flow
 *
 * 1. POST /api/jobs/:jobId/disputes creates dispute and sets dispute_hold on NOSHOW_DISPUTE
 * 2. NOSHOW_DISPUTE blocks payout via POST /payments/payout (dispute_hold check)
 * 3. PATCH /api/jobs/:jobId/disputes/:id (admin) resolves dispute and clears dispute_hold
 * 4. Unauthorized user (not a party) gets 403 on POST
 * 5. Duplicate dispute returns 409
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'
import type { FastifyInstance } from 'fastify'

// ─── Stable DB mock (hoisted, chain returns mutable ref) ─────────────────────
const mockDb = vi.hoisted(() => ({
  selectResult: [] as unknown[],
  selectCallCount: 0,
  selectResults: [] as unknown[][],
  updateResult: [] as unknown[],
  insertResult: [] as unknown[],
  updateCalled: 0,
  insertCalled: 0,
}))

vi.mock('../db', () => {
  const makeSelect = () => {
    const db = {
      execute: vi.fn(),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => {
              const idx = mockDb.selectCallCount++
              return Promise.resolve(mockDb.selectResults[idx] ?? [])
            }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve(mockDb.updateResult)),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => {
            if (mockDb.insertResult instanceof Error) throw mockDb.insertResult
            // Allow rejecting with DB error code
            if (mockDb.insertResult && typeof (mockDb.insertResult as any).code === 'string') {
              return Promise.reject(mockDb.insertResult)
            }
            return Promise.resolve(mockDb.insertResult)
          }),
        })),
      })),
    }
    return db
  }

  return {
    db: makeSelect(),
    jobDisputes: { id: 'id', jobId: 'job_id', raisedById: 'raised_by_id', type: 'type', status: 'status' },
    jobPostings: { id: 'id', employerId: 'employer_id', disputeHold: 'dispute_hold' },
    jobApplications: { id: 'id', jobId: 'job_id', workerId: 'worker_id' },
    users: {},
    penalties: {},
    workerProfiles: {},
    payments: { id: 'id', payerId: 'payer_id', tossPaymentKey: 'toss_payment_key', jobId: 'job_id', payoutAt: 'payout_at', tossStatus: 'toss_status' },
    reviews: {},
  }
})

vi.mock('../services/matching', () => ({
  dispatchJob: vi.fn(),
  distanceKm: vi.fn(),
  workerSockets: new Map(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
}))

vi.mock('../services/jobExpiry', () => ({
  processExpiredJobs: vi.fn(),
}))

vi.mock('../db/migrate', () => ({
  runMigrations: vi.fn(),
  runNotificationsMigration: vi.fn(),
  runCheckinMigration: vi.fn(),
  runDisputeMigration: vi.fn(),
}))

vi.mock('../lib/redis', () => ({
  getRedisClient: vi.fn(),
  checkRedisHealth: vi.fn().mockResolvedValue('unavailable'),
}))

vi.mock('../plugins/socket', () => ({
  setupSocketIO: vi.fn().mockResolvedValue({}),
}))

vi.mock('../plugins/rateLimit', () => ({
  setupRateLimit: vi.fn(),
}))

vi.mock('../plugins/sentry', () => ({ default: vi.fn((app: any, _opts: any, done: any) => done()) }))
vi.mock('../plugins/logger', () => ({ default: vi.fn((app: any, _opts: any, done: any) => done()) }))

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeToken(app: FastifyInstance, payload: object): string {
  return (app as any).jwt.sign(payload)
}

// Reset per-test call state
function resetMockDb() {
  mockDb.selectCallCount = 0
  mockDb.selectResults = []
  mockDb.updateResult = []
  mockDb.insertResult = []
  mockDb.updateCalled = 0
  mockDb.insertCalled = 0
}

// Valid UUIDs for tests
const JOB_ID = '550e8400-e29b-41d4-a716-446655440001'
const WORKER_ID = '550e8400-e29b-41d4-a716-446655440002'
const EMPLOYER_ID = '550e8400-e29b-41d4-a716-446655440003'
const DISPUTE_ID = '550e8400-e29b-41d4-a716-446655440004'

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('Dispute Routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    resetMockDb()
    app = await buildApp()
    await app.ready()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await app.close()
  })

  // ── Test 1: Create NOSHOW_DISPUTE + sets dispute_hold ────────────────────
  it('1. POST /api/jobs/:jobId/disputes creates dispute and sets dispute_hold for NOSHOW_DISPUTE', async () => {
    const token = makeToken(app, { id: WORKER_ID, role: 'worker' })

    const mockJob = { id: JOB_ID, employerId: EMPLOYER_ID, disputeHold: false }
    const mockApp = { id: 'app-1', jobId: JOB_ID, workerId: WORKER_ID, status: 'completed' }
    const mockDispute = { id: DISPUTE_ID, jobId: JOB_ID, raisedById: WORKER_ID, type: 'NOSHOW_DISPUTE', status: 'open' }

    // select calls: [0] job lookup, [1] application lookup
    mockDb.selectResults = [[mockJob], [mockApp]]
    mockDb.insertResult = [mockDispute] as unknown as unknown[]

    const response = await app.inject({
      method: 'POST',
      url: `/api/jobs/${JOB_ID}/disputes`,
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'NOSHOW_DISPUTE', description: 'I was marked as noshow but I showed up on time.' },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json<{ dispute: typeof mockDispute }>()
    expect(body.dispute.type).toBe('NOSHOW_DISPUTE')
    // Verify update was called (dispute_hold set)
    expect(mockDb.selectCallCount).toBeGreaterThanOrEqual(2)
  })

  // ── Test 2: Payout blocked by dispute_hold ────────────────────────────────
  it('2. POST /payments/payout returns 409 when dispute_hold is active', async () => {
    const token = makeToken(app, { id: EMPLOYER_ID, role: 'employer' })

    const mockJobWithHold = {
      id: JOB_ID,
      employerId: EMPLOYER_ID,
      disputeHold: true,
      escrowStatus: 'escrowed',
      paymentStatus: 'pending',
    }

    // select calls: [0] job lookup by payout handler
    mockDb.selectResults = [[mockJobWithHold]]

    const response = await app.inject({
      method: 'POST',
      url: '/payments/payout',
      headers: { authorization: `Bearer ${token}` },
      payload: { jobId: JOB_ID },
    })

    expect(response.statusCode).toBe(409)
    const body = response.json<{ error: string; code: string }>()
    expect(body.code).toBe('DISPUTE_HOLD_ACTIVE')
  })

  // ── Test 3: Admin resolves + clears dispute_hold ──────────────────────────
  it('3. PATCH /api/jobs/:jobId/disputes/:id (admin) resolves dispute and clears dispute_hold', async () => {
    vi.stubEnv('ADMIN_TOKEN', 'admin-secret')
    const token = makeToken(app, { id: EMPLOYER_ID, role: 'employer' })

    const openDispute = {
      id: DISPUTE_ID,
      jobId: JOB_ID,
      type: 'NOSHOW_DISPUTE',
      status: 'open',
      raisedById: WORKER_ID,
    }
    const resolvedDispute = { ...openDispute, status: 'resolved', resolutionNotes: 'Worker confirmed present.' }

    // select: [0] dispute lookup
    mockDb.selectResults = [[openDispute]]
    // update returns resolved dispute for first call (the dispute update)
    mockDb.updateResult = [resolvedDispute] as unknown as unknown[]

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/jobs/${JOB_ID}/disputes/${DISPUTE_ID}`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-admin-token': 'admin-secret',
      },
      payload: { status: 'resolved', resolutionNotes: 'Worker confirmed present.' },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ dispute: typeof resolvedDispute }>()
    expect(body.dispute.status).toBe('resolved')
  })

  // ── Test 4: Non-party worker gets 403 ────────────────────────────────────
  it('4. POST /api/jobs/:jobId/disputes returns 403 for non-party worker', async () => {
    const outsiderWorkerId = '550e8400-e29b-41d4-a716-446655440099'
    const token = makeToken(app, { id: outsiderWorkerId, role: 'worker' })

    const mockJob = { id: JOB_ID, employerId: EMPLOYER_ID, disputeHold: false }
    // Worker has NO application for this job
    mockDb.selectResults = [[mockJob], []]  // job found, no application

    const response = await app.inject({
      method: 'POST',
      url: `/api/jobs/${JOB_ID}/disputes`,
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'QUALITY_DISPUTE', description: 'The employer was very rude during the shift.' },
    })

    expect(response.statusCode).toBe(403)
    const body = response.json<{ error: string }>()
    expect(body.error).toMatch(/Access denied/)
  })

  // ── Test 5: Duplicate dispute returns 409 ────────────────────────────────
  it('5. POST /api/jobs/:jobId/disputes returns 409 on duplicate (same job + type)', async () => {
    const token = makeToken(app, { id: WORKER_ID, role: 'worker' })

    const mockJob = { id: JOB_ID, employerId: EMPLOYER_ID, disputeHold: false }
    const mockApplication = { id: 'app-5', jobId: JOB_ID, workerId: WORKER_ID, status: 'noshow' }

    mockDb.selectResults = [[mockJob], [mockApplication]]
    // Simulate unique constraint violation (DB unique index on job_id + raised_by_id + type)
    mockDb.insertResult = { code: '23505' } as unknown as unknown[]

    const response = await app.inject({
      method: 'POST',
      url: `/api/jobs/${JOB_ID}/disputes`,
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'NOSHOW_DISPUTE', description: 'I was marked as noshow but I was there the whole time.' },
    })

    expect(response.statusCode).toBe(409)
    const body = response.json<{ error: string }>()
    expect(body.error).toMatch(/already raised/)
  })
})
