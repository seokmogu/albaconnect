import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecute = vi.fn()
const mockDb = { execute: mockExecute }

vi.mock('../db', () => ({
  db: mockDb,
  users: {},
  workerProfiles: {},
  workerAvailability: {},
  workerBlackout: {},
  workerCertifications: {},
  jobPostings: {},
}))
vi.mock('../services/matching', () => ({ dispatchJob: vi.fn() }))
vi.mock('../services/cache', () => ({
  workerProfileCache: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  recommendedJobsCache: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  earningsCache: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  cacheGetL2: vi.fn().mockResolvedValue(null),
  cacheSetL2: vi.fn().mockResolvedValue(undefined),
  cacheDelL2: vi.fn().mockResolvedValue(undefined),
  CACHE_TTL: 300,
}))
vi.mock('../services/otpService.js', () => ({ sendOtp: vi.fn(), verifyOtp: vi.fn() }))
vi.mock('../services/scoring', () => ({ computeMatchScore: vi.fn() }))
vi.mock('../plugins/socket.js', () => ({ getIo: vi.fn().mockReturnValue(null) }))

import Fastify from 'fastify'
import { workerRoutes } from '../routes/workers'

const TEST_WORKER_ID = '00000000-0000-0000-0000-000000000001'

function buildApp() {
  const app = Fastify()
  app.decorateRequest('user', null)
  app.addHook('preHandler', async (req) => {
    ;(req as any).user = { id: TEST_WORKER_ID, role: 'worker' }
  })
  app.register(workerRoutes)
  return app
}

describe('Worker Schedule CRUD', () => {
  beforeEach(() => {
    mockExecute.mockReset()
  })

  it('POST /workers/schedule returns 201 with upserted schedule row', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ id: 'abc', day_of_week: 1, start_time: '09:00', end_time: '17:00', timezone: 'Asia/Seoul' }]
    })
    const app = buildApp()
    const res = await app.inject({
      method: 'POST', url: '/workers/schedule',
      payload: { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.day_of_week).toBe(1)
    expect(body.start_time).toBe('09:00')
  })

  it('PUT /workers/schedule/:dayOfWeek returns 404 when no schedule for that day', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] })
    const app = buildApp()
    const res = await app.inject({
      method: 'PUT', url: '/workers/schedule/3',
      payload: { startTime: '10:00', endTime: '18:00' }
    })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error).toMatch(/not found/i)
  })

  it('DELETE /workers/schedule/:dayOfWeek returns 404 when no schedule for that day', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] })
    const app = buildApp()
    const res = await app.inject({
      method: 'DELETE', url: '/workers/schedule/5',
    })
    expect(res.statusCode).toBe(404)
  })

  it('GET /workers/schedule/:workerId returns public schedule without auth', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { day_of_week: 1, start_time: '09:00', end_time: '17:00', timezone: 'Asia/Seoul' },
        { day_of_week: 3, start_time: '10:00', end_time: '16:00', timezone: 'Asia/Seoul' },
      ]
    })
    const app = Fastify()
    app.register(workerRoutes)
    const res = await app.inject({
      method: 'GET', url: `/workers/schedule/${TEST_WORKER_ID}`,
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.schedule).toHaveLength(2)
    expect(body.schedule[0]).not.toHaveProperty('id')
  })
})
