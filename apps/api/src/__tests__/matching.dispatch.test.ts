import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

const mocks = vi.hoisted(() => {
  const selectLimitMock = vi.fn()
  const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }))
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }))
  const selectMock = vi.fn(() => ({ from: selectFromMock }))
  return { selectLimitMock, selectWhereMock, selectFromMock, selectMock }
})

const matchingMocks = vi.hoisted(() => ({
  dispatchJob: vi.fn(),
  workerSockets: new Map<string, string>(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
  handleRejectOffer: vi.fn(),
}))

vi.mock('../db', () => ({
  db: {
    select: mocks.selectMock,
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn() })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
  jobPostings: { id: 'id', employerId: 'employerId' },
  jobApplications: { id: 'id', jobId: 'jobId', status: 'status' },
  users: {},
  penalties: {},
  workerProfiles: {},
  employerProfiles: {},
  payments: { payerId: 'payerId' },
}))

vi.mock('../services/matching', () => matchingMocks)

describe('dispatch route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 202 on valid employer call', async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: 'job-1', employerId: 'emp1', status: 'open' }])
    const app = await buildApp()
    const token = app.jwt.sign({ id: 'emp1', email: 'e@test.com', role: 'employer' })

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-1/dispatch',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json().message).toBe('Dispatch triggered')
    await app.close()
  })

  it('returns 403 for non-owner', async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: 'job-1', employerId: 'other', status: 'open' }])
    const app = await buildApp()
    const token = app.jwt.sign({ id: 'emp1', email: 'e@test.com', role: 'employer' })

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-1/dispatch',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })

  it('returns 404 for missing job', async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([])
    const app = await buildApp()
    const token = app.jwt.sign({ id: 'emp1', email: 'e@test.com', role: 'employer' })

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-1/dispatch',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('returns 409 for non-open status', async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: 'job-1', employerId: 'emp1', status: 'matched' }])
    const app = await buildApp()
    const token = app.jwt.sign({ id: 'emp1', email: 'e@test.com', role: 'employer' })

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-1/dispatch',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(409)
    await app.close()
  })
})
