/**
 * workerSchedule.test.ts — Worker availability schedule CRUD
 *
 * Tests:
 *  1. POST /workers/schedule — upsert schedule via ON CONFLICT → 201
 *  2. PUT /workers/schedule/:dayOfWeek — 404 when no record for that day
 *  3. DELETE /workers/schedule/:dayOfWeek — 404 when no record for that day
 *  4. GET /workers/schedule/:workerId — public endpoint returns schedule (no auth)
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

vi.mock('../db', () => {
  const mockAvail = {
    id: 'id',
    workerId: 'worker_id',
    dayOfWeek: 'day_of_week',
    startTime: 'start_time',
    endTime: 'end_time',
    timezone: 'timezone',
    validFrom: 'valid_from',
    validUntil: 'valid_until',
    createdAt: 'created_at',
  }
  return {
    db: dbMock,
    users: { id: 'id', email: 'email', role: 'role', name: 'name', phone: 'phone', passwordHash: 'password_hash', createdAt: 'created_at' },
    workerProfiles: { userId: 'user_id', categories: 'categories', bio: 'bio', ratingAvg: 'rating_avg', ratingCount: 'rating_count', isAvailable: 'is_available', isSuspended: 'is_suspended', isPhoneVerified: 'is_phone_verified', inviteCode: 'invite_code', lastSeenAt: 'last_seen_at', updatedAt: 'updated_at', pushSubscription: 'push_subscription' },
    employerProfiles: { userId: 'user_id', companyName: 'company_name', planTier: 'plan_tier' },
    workerAvailability: mockAvail,
    workerBlackout: { id: 'id', workerId: 'worker_id', blackoutDate: 'blackout_date' },
    workerCertifications: { id: 'id', workerId: 'worker_id', type: 'type', status: 'status', expiresAt: 'expires_at' },
    jobPostings: { id: 'id', status: 'status', employerId: 'employer_id', headcount: 'headcount', matchedCount: 'matched_count', startAt: 'start_at', endAt: 'end_at', disputeHold: 'dispute_hold', paymentStatus: 'payment_status', escrowStatus: 'escrow_status', completedAt: 'completed_at' },
    referrals: { id: 'id', referrerId: 'referrer_id', refereeId: 'referee_id', status: 'status', bonusAmount: 'bonus_amount' },
    jobApplications: { id: 'id', jobId: 'job_id', workerId: 'worker_id', status: 'status' },
    payments: { id: 'id', jobId: 'job_id', payerId: 'payer_id', amount: 'amount', platformFee: 'platform_fee', status: 'status' },
    disputes: { id: 'id', jobId: 'job_id', raisedById: 'raised_by_id', type: 'type', status: 'status' },
    jobTemplates: { id: 'id', employerId: 'employer_id', name: 'name' },
    reviews: { id: 'id', jobId: 'job_id', reviewerId: 'reviewer_id', revieweeId: 'reviewee_id', rating: 'rating' },
  }
})

const WORKER_ID = '11110000-0000-0000-0000-000000000001'

describe('Worker Schedule CRUD', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  it('POST /workers/schedule returns 201 with upserted schedule row', async () => {
    const token = app.jwt.sign({ id: WORKER_ID, role: 'worker' })
    dbMock.execute.mockResolvedValueOnce({
      rows: [{ id: 'abc', day_of_week: 1, start_time: '09:00', end_time: '17:00', timezone: 'Asia/Seoul' }]
    })
    const res = await app.inject({
      method: 'POST',
      url: '/workers/schedule',
      headers: { authorization: `Bearer ${token}` },
      payload: { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.day_of_week).toBe(1)
    expect(body.start_time).toBe('09:00')
  })

  it('PUT /workers/schedule/:dayOfWeek returns 404 when no schedule for that day', async () => {
    const token = app.jwt.sign({ id: WORKER_ID, role: 'worker' })
    dbMock.execute.mockResolvedValueOnce({ rows: [] })
    const res = await app.inject({
      method: 'PUT',
      url: '/workers/schedule/3',
      headers: { authorization: `Bearer ${token}` },
      payload: { startTime: '10:00', endTime: '18:00' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toMatch(/not found/i)
  })

  it('DELETE /workers/schedule/:dayOfWeek returns 404 when no schedule for that day', async () => {
    const token = app.jwt.sign({ id: WORKER_ID, role: 'worker' })
    dbMock.execute.mockResolvedValueOnce({ rows: [] })
    const res = await app.inject({
      method: 'DELETE',
      url: '/workers/schedule/5',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('GET /workers/schedule/:workerId returns public schedule without auth', async () => {
    dbMock.execute.mockResolvedValueOnce({
      rows: [
        { day_of_week: 1, start_time: '09:00', end_time: '17:00', timezone: 'Asia/Seoul' },
        { day_of_week: 3, start_time: '10:00', end_time: '16:00', timezone: 'Asia/Seoul' },
      ]
    })
    // No authorization header — public endpoint
    const res = await app.inject({
      method: 'GET',
      url: `/workers/schedule/${WORKER_ID}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.schedule).toHaveLength(2)
    expect(body.schedule[0]).not.toHaveProperty('id')
    expect(body.schedule[0].day_of_week).toBe(1)
  })
})
