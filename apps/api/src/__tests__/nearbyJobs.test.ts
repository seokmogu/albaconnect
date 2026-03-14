/**
 * nearbyJobs.test.ts — location-based job discovery with radius filter
 *
 * Tests:
 *  1. GET /jobs/nearby — returns jobs within radius sorted by distance
 *  2. GET /jobs/nearby — excludes jobs outside radius (400 on missing lat/lng)
 *  3. GET /jobs/nearby — distance_label formatting (m vs km)
 *  4. GET /jobs/nearby/count — returns correct count
 *  5. GET /jobs/nearby — 400 on missing lat/lng
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

// ── DB mock ────────────────────────────────────────────────────────────────────
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
  const jobPostingsTable = {
    id: 'id',
    employerId: 'employer_id',
    title: 'title',
    category: 'category',
    status: 'status',
    hourlyRate: 'hourly_rate',
    totalAmount: 'total_amount',
    headcount: 'headcount',
    matchedCount: 'matched_count',
    address: 'address',
    description: 'description',
    startAt: 'start_at',
    endAt: 'end_at',
    location: 'location',
    escrowStatus: 'escrow_status',
    planTier: 'plan_tier',
    disputeHold: 'dispute_hold',
    paymentStatus: 'payment_status',
    createdAt: 'created_at',
  }
  const workerProfilesTable = {
    userId: 'user_id',
    categories: 'categories',
    bio: 'bio',
    ratingAvg: 'rating_avg',
    ratingCount: 'rating_count',
    isAvailable: 'is_available',
    isSuspended: 'is_suspended',
    isPhoneVerified: 'is_phone_verified',
    inviteCode: 'invite_code',
    location: 'location',
    lastSeenAt: 'last_seen_at',
    lastAlertSentAt: 'last_alert_sent_at',
    updatedAt: 'updated_at',
    pushSubscription: 'push_subscription',
  }
  return {
    db: dbMock,
    jobPostings: jobPostingsTable,
    jobApplications: { id: 'id', workerId: 'worker_id', jobId: 'job_id', status: 'status', createdAt: 'created_at' },
    users: { id: 'id', email: 'email', role: 'role', name: 'name', phone: 'phone' },
    workerProfiles: workerProfilesTable,
    employerProfiles: { userId: 'user_id', companyName: 'company_name', planTier: 'plan_tier' },
    penalties: { id: 'id', workerId: 'worker_id', amount: 'amount' },
    workerCertifications: { id: 'id', workerId: 'worker_id', type: 'type', status: 'status' },
    workerAvailability: { id: 'id', workerId: 'worker_id', dayOfWeek: 'day_of_week', startTime: 'start_time', endTime: 'end_time', validFrom: 'valid_from', validUntil: 'valid_until' },
    workerBlackout: { id: 'id', workerId: 'worker_id', blackoutDate: 'blackout_date' },
    reviews: { id: 'id', reviewerId: 'reviewer_id', revieweeId: 'reviewee_id', rating: 'rating' },
    referrals: { id: 'id', referrerId: 'referrer_id', refereeId: 'referee_id', status: 'status' },
    payments: { id: 'id', jobId: 'job_id', workerId: 'worker_id', amount: 'amount', status: 'status' },
    jobDisputes: { id: 'id', jobId: 'job_id', status: 'status' },
    workerCertifications: { id: 'id', workerId: 'worker_id', type: 'type', status: 'status' },
    employerFavorites: { id: 'id', employerId: 'employer_id', workerId: 'worker_id' },
  }
})

vi.mock('../services/matching', () => ({
  dispatchJob: vi.fn(),
  workerSockets: new Map(),
  setSocketServer: vi.fn(),
  findNearbyWorkers: vi.fn().mockResolvedValue([]),
  invalidateNearbyWorkersCache: vi.fn().mockResolvedValue(undefined),
  distanceKm: vi.fn().mockReturnValue(0),
}))

vi.mock('../services/kakaoAlimTalk', () => ({
  sendAlimTalk: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../services/escrowAutoRelease', () => ({
  startEscrowWorker: vi.fn(),
  stopEscrowWorker: vi.fn(),
}))

vi.mock('../services/jobAlertWorker', () => ({
  startWorkerAlertWorker: vi.fn(),
  stopWorkerAlertWorker: vi.fn(),
}))

const WORKER_ID = 'aaaa0000-0000-0000-0000-aaaaaaaaaaaa'

// Simulated job rows with distance
const makeJobRow = (id: string, distanceM: number) => ({
  id,
  title: `Job ${id}`,
  category: 'food',
  start_at: new Date('2026-04-01T09:00:00Z'),
  end_at: new Date('2026-04-01T17:00:00Z'),
  hourly_rate: 12000,
  total_amount: 96000,
  headcount: 2,
  matched_count: 0,
  address: '서울시 강남구',
  description: 'test job',
  status: 'open',
  lat: 37.5,
  lng: 127.0,
  distance_m: distanceM,
  company_name: '테스트 회사',
})

describe('Nearby Jobs', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
  })

  // ── Test 1: Returns jobs within radius sorted by distance ─────────────────
  it('GET /jobs/nearby — returns jobs within radius sorted by distance', async () => {
    const workerToken = app.jwt.sign({ id: WORKER_ID, role: 'worker' })

    const jobsInRadius = [
      makeJobRow('job-close', 800),
      makeJobRow('job-mid', 2500),
      makeJobRow('job-far', 4900),
    ]

    dbMock.execute.mockResolvedValueOnce({ rows: jobsInRadius })

    const res = await app.inject({
      method: 'GET',
      url: '/jobs/nearby?lat=37.5665&lng=126.9780&radius_km=5',
      headers: { authorization: `Bearer ${workerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.jobs).toHaveLength(3)
    // Sorted by distance ascending
    expect(body.jobs[0].id).toBe('job-close')
    expect(body.jobs[0].distance_m).toBe(800)
    expect(body.jobs[2].id).toBe('job-far')
    expect(body.radiusKm).toBe(5)
  })

  // ── Test 2: Excludes jobs outside radius ──────────────────────────────────
  it('GET /jobs/nearby — excludes jobs outside radius (DB only returns within ST_DWithin)', async () => {
    const workerToken = app.jwt.sign({ id: WORKER_ID, role: 'worker' })

    // DB returns no results (PostGIS filtered them out)
    dbMock.execute.mockResolvedValueOnce({ rows: [] })

    const res = await app.inject({
      method: 'GET',
      url: '/jobs/nearby?lat=37.5665&lng=126.9780&radius_km=1',
      headers: { authorization: `Bearer ${workerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.jobs).toHaveLength(0)
    expect(body.count).toBe(0)
    expect(body.hasMore).toBe(false)
  })

  // ── Test 3: distance_label formatting (m vs km) ───────────────────────────
  it('GET /jobs/nearby — distance_label uses m below 1000m and km above', async () => {
    const workerToken = app.jwt.sign({ id: WORKER_ID, role: 'worker' })

    const jobs = [
      makeJobRow('job-meters', 350),
      makeJobRow('job-km', 1200),
    ]
    dbMock.execute.mockResolvedValueOnce({ rows: jobs })

    const res = await app.inject({
      method: 'GET',
      url: '/jobs/nearby?lat=37.5665&lng=126.9780&radius_km=5',
      headers: { authorization: `Bearer ${workerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.jobs[0].distance_label).toBe('350m')
    expect(body.jobs[1].distance_label).toBe('1.2km')
  })

  // ── Test 4: Count endpoint returns correct total ──────────────────────────
  it('GET /jobs/nearby/count — returns count of open jobs within radius', async () => {
    const workerToken = app.jwt.sign({ id: WORKER_ID, role: 'worker' })

    dbMock.execute.mockResolvedValueOnce({ rows: [{ total: '7' }] })

    const res = await app.inject({
      method: 'GET',
      url: '/jobs/nearby/count?lat=37.5665&lng=126.9780&radius_km=5',
      headers: { authorization: `Bearer ${workerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.count).toBe(7)
    expect(body.radiusKm).toBe(5)
  })

  // ── Test 5: 400 on missing lat/lng ────────────────────────────────────────
  it('GET /jobs/nearby — 400 when lat or lng missing', async () => {
    const workerToken = app.jwt.sign({ id: WORKER_ID, role: 'worker' })

    const res = await app.inject({
      method: 'GET',
      url: '/jobs/nearby?radius_km=5',
      headers: { authorization: `Bearer ${workerToken}` },
    })

    expect(res.statusCode).toBe(400)

    const res2 = await app.inject({
      method: 'GET',
      url: '/jobs/nearby/count?radius_km=5',
      headers: { authorization: `Bearer ${workerToken}` },
    })

    expect(res2.statusCode).toBe(400)
  })
})
