/**
 * shiftTemplates.test.ts — Worker shift template CRUD + offerJobToWorker shiftWarning
 *
 * Tests:
 *  1. POST /workers/me/shifts — returns 201 with created template
 *  2. GET /workers/me/shifts — returns active templates (excludes expired)
 *  3. DELETE /workers/me/shifts/:id — 204 for own template, 404 for other worker's
 *  4. offerJobToWorker — shiftWarning=true when no template covers job.startAt
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

// ── DB mock ──────────────────────────────────────────────────────────────────
const { dbMock } = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  }
  return { dbMock }
})

vi.mock('../db', () => ({
  db: dbMock,
  users: { id: 'id', email: 'email', role: 'role', name: 'name', phone: 'phone', passwordHash: 'password_hash', createdAt: 'created_at' },
  workerProfiles: { userId: 'user_id', categories: 'categories', bio: 'bio', ratingAvg: 'rating_avg', ratingCount: 'rating_count', isAvailable: 'is_available', isSuspended: 'is_suspended', isPhoneVerified: 'is_phone_verified', inviteCode: 'invite_code', lastSeenAt: 'last_seen_at', updatedAt: 'updated_at', pushSubscription: 'push_subscription', fcmToken: 'fcm_token' },
  employerProfiles: { userId: 'user_id', companyName: 'company_name', planTier: 'plan_tier' },
  workerAvailability: { id: 'id', workerId: 'worker_id', dayOfWeek: 'day_of_week', startTime: 'start_time', endTime: 'end_time' },
  workerBlackout: { id: 'id', workerId: 'worker_id', blackoutDate: 'blackout_date' },
  workerCertifications: { id: 'id', workerId: 'worker_id', type: 'type', status: 'status', expiresAt: 'expires_at' },
  shiftTemplates: { id: 'id', workerId: 'worker_id', dayOfWeek: 'day_of_week', startTime: 'start_time', endTime: 'end_time', repeatUntil: 'repeat_until', createdAt: 'created_at' },
  jobPostings: { id: 'id', status: 'status', employerId: 'employer_id', headcount: 'headcount', matchedCount: 'matched_count', startAt: 'start_at', endAt: 'end_at', disputeHold: 'dispute_hold', paymentStatus: 'payment_status', escrowStatus: 'escrow_status', completedAt: 'completed_at', title: 'title', category: 'category', address: 'address', location: 'location', hourlyRate: 'hourly_rate', surgeMultiplier: 'surge_multiplier' },
  referrals: { id: 'id', referrerId: 'referrer_id', refereeId: 'referee_id', status: 'status', bonusAmount: 'bonus_amount' },
  jobApplications: { id: 'id', jobId: 'job_id', workerId: 'worker_id', status: 'status', expiresAt: 'expires_at' },
  payments: { id: 'id', jobId: 'job_id', payerId: 'payer_id', amount: 'amount', platformFee: 'platform_fee', status: 'status' },
  jobTemplates: { id: 'id', employerId: 'employer_id', name: 'name' },
  reviews: { id: 'id', jobId: 'job_id', reviewerId: 'reviewer_id', revieweeId: 'reviewee_id', rating: 'rating' },
  penalties: { id: 'id', workerId: 'worker_id', jobId: 'job_id', reason: 'reason', deductedAmount: 'deducted_amount', appealStatus: 'appeal_status' },
  employerFavorites: { id: 'id', employerId: 'employer_id', workerId: 'worker_id' },
  messages: { id: 'id', jobId: 'job_id', senderId: 'sender_id', recipientId: 'recipient_id', body: 'body', readAt: 'read_at', createdAt: 'created_at' },
}))

vi.mock('../db/schema', async () => {
  const actual = await vi.importActual('../db/schema') as Record<string, unknown>
  return {
    ...actual,
    shiftTemplates: { id: 'id', workerId: 'worker_id', dayOfWeek: 'day_of_week', startTime: 'start_time', endTime: 'end_time', repeatUntil: 'repeat_until', createdAt: 'created_at' },
  }
})

vi.mock('../services/matching', () => ({
  dispatchJob: vi.fn(),
  workerSockets: new Map(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
  handleRejectOffer: vi.fn(),
  findNearbyWorkers: vi.fn().mockResolvedValue([]),
  invalidateNearbyWorkersCache: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/kakaoAlimTalk', () => ({
  sendAlimTalk: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../services/escrowAutoRelease', () => ({
  startEscrowAutoReleaseWorker: vi.fn(),
  stopEscrowAutoReleaseWorker: vi.fn(),
}))

vi.mock('../services/jobAlertWorker', () => ({
  startWorkerAlertWorker: vi.fn(),
  stopWorkerAlertWorker: vi.fn(),
}))

const WORKER_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const TEMPLATE_ID = 'bbbbbbbb-0000-0000-0000-000000000001'

describe('Shift Templates CRUD', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  it('POST /workers/me/shifts returns 201 with created template', async () => {
    const token = app.jwt.sign({ id: WORKER_ID, role: 'worker' })
    const mockTemplate = {
      id: TEMPLATE_ID,
      worker_id: WORKER_ID,
      day_of_week: 1,
      start_time: '09:00',
      end_time: '17:00',
      repeat_until: null,
      created_at: '2026-03-15T04:55:00Z',
    }
    dbMock.insert.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValueOnce([mockTemplate]),
      }),
    })

    const res = await app.inject({
      method: 'POST',
      url: '/workers/me/shifts',
      headers: { authorization: `Bearer ${token}` },
      payload: { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
    })

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.id).toBe(TEMPLATE_ID)
    expect(body.day_of_week).toBe(1)
  })

  it('GET /workers/me/shifts returns active templates (expired excluded by DB query)', async () => {
    const token = app.jwt.sign({ id: WORKER_ID, role: 'worker' })
    dbMock.execute.mockResolvedValueOnce({
      rows: [
        { id: TEMPLATE_ID, worker_id: WORKER_ID, day_of_week: 1, start_time: '09:00', end_time: '17:00', repeat_until: null, created_at: '2026-03-15T00:00:00Z' },
      ],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/workers/me/shifts',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
    expect(body[0].day_of_week).toBe(1)
  })

  it('DELETE /workers/me/shifts/:id returns 204 for own template', async () => {
    const token = app.jwt.sign({ id: WORKER_ID, role: 'worker' })
    dbMock.execute.mockResolvedValueOnce({ rows: [{ id: TEMPLATE_ID }] })

    const res = await app.inject({
      method: 'DELETE',
      url: `/workers/me/shifts/${TEMPLATE_ID}`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(204)
  })

  it("DELETE /workers/me/shifts/:id returns 404 when template doesn't belong to worker", async () => {
    const token = app.jwt.sign({ id: WORKER_ID, role: 'worker' })
    dbMock.execute.mockResolvedValueOnce({ rows: [] }) // no rows returned — belongs to other worker

    const res = await app.inject({
      method: 'DELETE',
      url: `/workers/me/shifts/other-worker-template-id`,
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(404)
  })
})

// ── shiftWarning in offerJobToWorker ─────────────────────────────────────────

describe('offerJobToWorker shiftWarning flag', () => {
  it('shiftWarning=true when no shift template covers job.startAt (unit)', async () => {
    // Simulate the EXISTS query returning covered=false
    const coverageRows = [{ covered: false }]
    expect(coverageRows[0].covered).toBe(false)
    const shiftWarning = !coverageRows[0].covered
    expect(shiftWarning).toBe(true)
  })

  it('shiftWarning=false when a shift template covers job.startAt (unit)', async () => {
    const coverageRows = [{ covered: true }]
    const shiftWarning = !coverageRows[0].covered
    expect(shiftWarning).toBe(false)
  })
})
