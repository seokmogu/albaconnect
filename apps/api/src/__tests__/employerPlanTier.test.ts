/**
 * employerPlanTier.test.ts
 *
 * Tests:
 *  1. POST /jobs: employer under free limit (2 active) → job created (201)
 *  2. POST /jobs: employer at free limit (3 active) → 402 PLAN_LIMIT_EXCEEDED
 *  3. GET /employers/plan: returns tier, active_jobs, job_limit, remaining
 *  4. PATCH /admin/employers/:id/plan: admin upgrades tier → 200
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

// ── DB mocks ───────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const executeMock = vi.fn()
  const selectLimitMock = vi.fn()
  const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }))
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }))
  const selectMock = vi.fn(() => ({ from: selectFromMock }))
  const insertReturningMock = vi.fn()
  const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }))
  const insertIntoMock = vi.fn(() => ({ values: insertValuesMock }))
  const updateWhereMock = vi.fn()
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }))
  const updateMock = vi.fn(() => ({ set: updateSetMock }))

  return {
    executeMock, selectLimitMock, selectWhereMock, selectFromMock, selectMock,
    insertReturningMock, insertValuesMock, insertIntoMock,
    updateWhereMock, updateSetMock, updateMock,
  }
})

vi.mock('../db', () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertIntoMock,
    update: mocks.updateMock,
    execute: mocks.executeMock,
  },
  jobPostings: {
    id: 'id', employerId: 'employerId', status: 'status',
    title: 'title', category: 'category', startAt: 'startAt', endAt: 'endAt',
    hourlyRate: 'hourlyRate', totalAmount: 'totalAmount', headcount: 'headcount',
    escrowStatus: 'escrowStatus', paymentStatus: 'paymentStatus',
    disputeHold: 'disputeHold', completedAt: 'completedAt', updatedAt: 'updatedAt',
    statusUpdatedAt: 'statusUpdatedAt',
  },
  employerProfiles: { userId: 'userId', planTier: 'planTier', isSuspended: 'isSuspended', companyName: 'companyName' },
  jobApplications: { id: 'id', jobId: 'jobId', workerId: 'workerId', status: 'status' },
  users: { id: 'id', email: 'email', role: 'role' },
  penalties: { id: 'id' },
  workerProfiles: { userId: 'userId', isSuspended: 'isSuspended' },
  payments: { id: 'id', jobId: 'jobId', payerId: 'payerId' },
}))

const EMPLOYER_ID = 'aaaa0000-0000-0000-0000-aaaaaaaaaaaa'
const JOB_ID = 'cccc0000-0000-0000-0000-cccccccccccc'

const validJobBody = {
  title: 'Test Job',
  category: 'food',
  startAt: new Date(Date.now() + 3_600_000).toISOString(),
  endAt: new Date(Date.now() + 7_200_000).toISOString(),
  hourlyRate: 10000,
  headcount: 1,
  lat: 37.5,
  lng: 127.0,
  address: '서울시 강남구',
  description: 'Test job description',
}

describe('Employer plan tier enforcement', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    // Default fallback: any unhandled select().from().where().limit() returns []
    // This prevents unhandled rejections from async dispatchJob after job creation
    mocks.selectLimitMock.mockResolvedValue([])
    app = await buildApp()
  })

  afterEach(async () => { await app.close() })

  // Test 1: under free limit (2 active) → job created
  it('allows job creation when under plan limit', async () => {
    const token = app.jwt.sign({ id: EMPLOYER_ID, role: 'employer' })

    // execute mock: 1) plan_tier=free, 2) active_count=2
    mocks.executeMock
      .mockResolvedValueOnce({ rows: [{ plan_tier: 'free' }] })
      .mockResolvedValueOnce({ rows: [{ active_count: '2' }] })
      .mockResolvedValue({ rows: [] }) // subsequent execute calls (escrow worker, etc.)

    mocks.insertReturningMock.mockResolvedValueOnce([{ id: JOB_ID, totalAmount: 10000 }])

    const res = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { authorization: `Bearer ${token}` },
      payload: validJobBody,
    })

    expect([201, 200]).toContain(res.statusCode)
  })

  // Test 2: at free limit (3 active) → 402
  it('returns 402 when employer is at free plan limit', async () => {
    const token = app.jwt.sign({ id: EMPLOYER_ID, role: 'employer' })

    mocks.executeMock
      .mockResolvedValueOnce({ rows: [{ plan_tier: 'free' }] })
      .mockResolvedValueOnce({ rows: [{ active_count: '3' }] })

    const res = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { authorization: `Bearer ${token}` },
      payload: validJobBody,
    })

    expect(res.statusCode).toBe(402)
    const body = res.json()
    expect(body.error.code).toBe('PLAN_LIMIT_EXCEEDED')
    expect(body.error.tier).toBe('free')
    expect(body.error.limit).toBe(3)
    expect(body.error.current).toBe(3)
  })

  // Test 3: GET /employers/plan returns tier shape
  it('GET /employers/plan returns correct tier fields', async () => {
    const token = app.jwt.sign({ id: EMPLOYER_ID, role: 'employer' })

    // select for employer profile
    mocks.selectLimitMock.mockResolvedValueOnce([{ planTier: 'basic' }])
    // execute for active count
    mocks.executeMock.mockResolvedValueOnce({ rows: [{ active_jobs: '5' }] })

    const res = await app.inject({
      method: 'GET',
      url: '/employers/plan',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.tier).toBe('basic')
    expect(body.job_limit).toBe(20)
    expect(body.active_jobs).toBe(5)
    expect(body.remaining).toBe(15)
    expect(body.upgrade_available).toBe(true)
  })

  // Test 4: admin upgrades plan tier
  it('PATCH /admin/employers/:id/plan upgrades tier', async () => {
    const adminKey = 'plan-test-admin-key'
    process.env.ADMIN_KEY = adminKey

    const token = app.jwt.sign({ id: 'admin-user-id', role: 'employer' })
    mocks.updateWhereMock.mockResolvedValueOnce([{ planTier: 'premium' }])

    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/employers/${EMPLOYER_ID}/plan`,
      headers: {
        authorization: `Bearer ${token}`,
        'x-admin-key': adminKey,
      },
      payload: { plan_tier: 'premium' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.plan_tier).toBe('premium')
    expect(body.updated).toBe(true)
    expect(mocks.updateMock).toHaveBeenCalledTimes(1)

    delete process.env.ADMIN_KEY
  })
})
