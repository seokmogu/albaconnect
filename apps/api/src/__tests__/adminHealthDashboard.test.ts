/**
 * Tests: Admin platform health dashboard API
 * - GET /admin/stats  (with platform section)
 * - GET /admin/stats/revenue
 * - GET /admin/stats/users
 * - requireAdmin rejects non-admin
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

const mockState = vi.hoisted(() => ({
  execute: vi.fn(),
  updateWhere: vi.fn(),
  redisGet: vi.fn(),
  redisSetex: vi.fn(),
  redisDel: vi.fn(),
}))

vi.mock('../db', () => ({
  db: {
    execute: mockState.execute,
    transaction: vi.fn(async (fn: any) => fn({ execute: mockState.execute })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: mockState.updateWhere })) })),
  },
  workerProfiles: { userId: 'user_id' },
  employerProfiles: { userId: 'user_id' },
}))

vi.mock('../services/jobExpiry', () => ({
  processExpiredJobs: vi.fn().mockResolvedValue({ expiredCount: 0, noshowCount: 0 }),
}))

vi.mock('../lib/redis', () => ({
  getRedisClient: vi.fn(() => ({
    get: mockState.redisGet,
    setex: mockState.redisSetex,
    del: mockState.redisDel,
    set: vi.fn(),
  })),
}))

const ZERO_ROW = { rows: [{ count: 0, total: 0, workers: 0, employers: 0, avg_hours: 0, rate: 0 }] }

describe('admin health dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_TOKEN = 'test-admin-token'
    mockState.redisGet.mockResolvedValue(null)
  })

  it('GET /admin/stats returns platform section with zero data', async () => {
    // Each execute call returns zero rows
    mockState.execute.mockResolvedValue(ZERO_ROW)

    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats',
      headers: { 'x-admin-token': 'test-admin-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('platform')
    expect(body.platform).toMatchObject({
      total_workers: expect.any(Number),
      total_employers: expect.any(Number),
      active_jobs: expect.any(Number),
      completed_jobs_7d: expect.any(Number),
      total_escrow_held_won: expect.any(Number),
      disputes_open: expect.any(Number),
      disputes_resolved_7d: expect.any(Number),
      referrals_pending: expect.any(Number),
    })
    await app.close()
  })

  it('GET /admin/stats/revenue returns weekly bucket shape', async () => {
    mockState.execute.mockResolvedValueOnce({
      rows: [
        { week_start: '2026-03-09', jobs_completed: '3', total_payout_won: '150000', platform_fee_won: '7500' },
        { week_start: '2026-03-02', jobs_completed: '5', total_payout_won: '250000', platform_fee_won: '12500' },
      ],
    })

    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats/revenue?from=2026-03-01&to=2026-03-14',
      headers: { 'x-admin-token': 'test-admin-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('from', '2026-03-01')
    expect(body).toHaveProperty('to', '2026-03-14')
    expect(Array.isArray(body.buckets)).toBe(true)
    expect(body.buckets[0]).toMatchObject({
      week_start: expect.anything(),
      jobs_completed: expect.any(Number),
      total_payout_won: expect.any(Number),
      platform_fee_won: expect.any(Number),
    })
    await app.close()
  })

  it('GET /admin/stats without admin token returns 401', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats',
    })

    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('GET /admin/stats/users returns counts shape', async () => {
    mockState.execute
      .mockResolvedValueOnce({ rows: [{ count: '12' }] }) // new workers
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })  // new employers
      .mockResolvedValueOnce({ rows: [{ count: '8' }] })  // active workers
      .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // total workers

    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin/stats/users?period=30d',
      headers: { 'x-admin-token': 'test-admin-token' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({
      period: '30d',
      new_workers_count: 12,
      new_employers_count: 3,
      active_workers_last_period: 8,
      retention_rate_pct: expect.any(Number),
    })
    await app.close()
  })
})
