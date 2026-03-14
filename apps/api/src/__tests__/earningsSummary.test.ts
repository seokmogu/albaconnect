import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  cacheGetL2: vi.fn().mockResolvedValue(undefined),
  cacheSetL2: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../db', () => ({
  db: { execute: mocks.execute },
  workerProfiles: {},
  users: {},
  workerAvailability: {},
  workerBlackout: {},
  workerCertifications: {},
  jobPostings: {},
}))

vi.mock('../services/cache', () => ({
  workerProfileCache: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  recommendedJobsCache: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  earningsCache: {},
  cacheGetL2: mocks.cacheGetL2,
  cacheSetL2: mocks.cacheSetL2,
  cacheDelL2: vi.fn().mockResolvedValue(undefined),
  CACHE_TTL: { EARNINGS_SUMMARY: 300_000, EARNINGS_STATS: 300_000 },
}))

vi.mock('../services/matching', () => ({ dispatchJob: vi.fn(), workerSockets: new Map() }))
vi.mock('../services/otpService.js', () => ({ sendOtp: vi.fn(), verifyOtp: vi.fn() }))
vi.mock('../services/scoring', () => ({ computeMatchScore: vi.fn() }))
vi.mock('../plugins/socket', () => ({ setupSocketIO: vi.fn().mockResolvedValue({}) }))
vi.mock('../plugins/rateLimit', () => ({ setupRateLimit: vi.fn() }))
vi.mock('../plugins/sentry', () => ({ default: vi.fn((app: any, _opts: any, done: any) => done()) }))
vi.mock('../plugins/logger', () => ({ default: vi.fn((app: any, _opts: any, done: any) => done()) }))
vi.mock('../services/jobExpiry', () => ({ processExpiredJobs: vi.fn() }))
vi.mock('../lib/redis', () => ({ checkRedisHealth: vi.fn().mockResolvedValue('unavailable') }))

describe('monthly earnings summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET /workers/me/earnings/summary returns shape with by_job and vs_previous_month', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ total_jobs: '2', total_hours: '8', total_pay: '80000', avg_hourly_rate: '10000', by_job: [{ jobId: 'j1' }] }] })
      .mockResolvedValueOnce({ rows: [{ total_jobs: '1', total_hours: '4', total_pay: '30000', avg_hourly_rate: '9000', by_job: [] }] })
    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', role: 'worker' })
    const res = await app.inject({ method: 'GET', url: '/workers/me/earnings/summary', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.by_job).toBeTruthy()
    expect(body.vs_previous_month).toBeTruthy()
    await app.close()
  })

  it('GET /workers/me/earnings/summary?month=2026-01 executes current and previous month queries', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ total_jobs: '1', total_hours: '4', total_pay: '40000', avg_hourly_rate: '10000', by_job: [] }] })
      .mockResolvedValueOnce({ rows: [{ total_jobs: '1', total_hours: '4', total_pay: '20000', avg_hourly_rate: '9000', by_job: [] }] })
    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', role: 'worker' })
    const res = await app.inject({ method: 'GET', url: '/workers/me/earnings/summary?month=2026-01', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    await app.close()
  })

  it('GET /workers/me/earnings/summary?month=2026-03 with no jobs returns zeros', async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ total_jobs: '0', total_hours: '0', total_pay: '0', avg_hourly_rate: '0', by_job: [] }] })
      .mockResolvedValueOnce({ rows: [{ total_jobs: '0', total_hours: '0', total_pay: '0', avg_hourly_rate: '0', by_job: [] }] })
    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', role: 'worker' })
    const res = await app.inject({ method: 'GET', url: '/workers/me/earnings/summary?month=2026-03', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total_pay).toBe(0)
    expect(body.by_job).toEqual([])
    expect(body.vs_previous_month.total_pay_delta_pct).toBe(0)
    await app.close()
  })

  it('GET /workers/me/earnings/history?limit=3 returns at most 3 items', async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ month: '2026-03' }, { month: '2026-02' }, { month: '2026-01' }] })
    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', role: 'worker' })
    const res = await app.inject({ method: 'GET', url: '/workers/me/earnings/history?limit=3', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(res.json().history).toHaveLength(3)
    await app.close()
  })
})
