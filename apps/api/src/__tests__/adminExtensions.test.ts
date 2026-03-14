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
  getRedisClient: vi.fn(() => ({ get: mockState.redisGet, setex: mockState.redisSetex, del: mockState.redisDel, set: vi.fn() })),
}))

describe('admin extensions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_TOKEN = 'admin-secret'
  })

  it('GET /admin/disputes returns 200 with disputes array', async () => {
    mockState.execute.mockResolvedValueOnce({ rows: [{ id: 'd1' }] })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/admin/disputes', headers: { 'x-admin-token': 'admin-secret' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().disputes).toEqual([{ id: 'd1' }])
    await app.close()
  })

  it('GET /admin/disputes?status=open returns 200', async () => {
    mockState.execute.mockResolvedValueOnce({ rows: [{ id: 'd1', status: 'open' }] })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/admin/disputes?status=open', headers: { 'x-admin-token': 'admin-secret' } })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('PATCH /admin/disputes/:id resolve clears disputeHold when no open NOSHOW remains', async () => {
    mockState.execute
      .mockResolvedValueOnce({ rows: [{ id: 'd1', job_id: 'j1', type: 'NOSHOW_DISPUTE', status: 'open' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
    const app = await buildApp()
    const res = await app.inject({ method: 'PATCH', url: '/admin/disputes/d1', headers: { 'x-admin-token': 'admin-secret' }, payload: { status: 'resolved', resolution_notes: 'done' } })
    expect(res.statusCode).toBe(200)
    expect(mockState.redisDel).toHaveBeenCalledWith('admin:stats:v1')
    await app.close()
  })

  it('PATCH /admin/disputes/:id resolve keeps disputeHold when another NOSHOW remains open', async () => {
    mockState.execute
      .mockResolvedValueOnce({ rows: [{ id: 'd1', job_id: 'j1', type: 'NOSHOW_DISPUTE', status: 'open' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
    const app = await buildApp()
    const res = await app.inject({ method: 'PATCH', url: '/admin/disputes/d1', headers: { 'x-admin-token': 'admin-secret' }, payload: { status: 'resolved', resolution_notes: 'done' } })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('PATCH /admin/workers/:id suspend returns isSuspended true', async () => {
    mockState.updateWhere.mockResolvedValueOnce(undefined)
    const app = await buildApp()
    const res = await app.inject({ method: 'PATCH', url: '/admin/workers/w1', headers: { 'x-admin-token': 'admin-secret' }, payload: { action: 'suspend' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().isSuspended).toBe(true)
    await app.close()
  })

  it('PATCH /admin/workers/:id activate returns isSuspended false', async () => {
    mockState.updateWhere.mockResolvedValueOnce(undefined)
    const app = await buildApp()
    const res = await app.inject({ method: 'PATCH', url: '/admin/workers/w1', headers: { 'x-admin-token': 'admin-secret' }, payload: { action: 'activate' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().isSuspended).toBe(false)
    await app.close()
  })

  it('PATCH /admin/employers/:id suspend returns isSuspended true', async () => {
    mockState.updateWhere.mockResolvedValueOnce(undefined)
    const app = await buildApp()
    const res = await app.inject({ method: 'PATCH', url: '/admin/employers/e1', headers: { 'x-admin-token': 'admin-secret' }, payload: { action: 'suspend' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().isSuspended).toBe(true)
    await app.close()
  })

  it('GET /admin/disputes without admin token returns 401', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/admin/disputes' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
