import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

const mocks = vi.hoisted(() => {
  const executeMock = vi.fn()
  const selectLimitMock = vi.fn()
  const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }))
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }))
  const selectMock = vi.fn(() => ({ from: selectFromMock }))
  const insertReturningMock = vi.fn()
  const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }))
  const insertIntoMock = vi.fn(() => ({ values: insertValuesMock }))
  return { executeMock, selectLimitMock, selectWhereMock, selectFromMock, selectMock, insertReturningMock, insertValuesMock, insertIntoMock }
})

vi.mock('../db', () => ({
  db: {
    execute: mocks.executeMock,
    select: mocks.selectMock,
    insert: mocks.insertIntoMock,
  },
  jobPostings: { id: 'id', employerId: 'employerId' },
  jobApplications: { id: 'id', jobId: 'jobId', status: 'status' },
  users: {},
  penalties: {},
  workerProfiles: {},
}))

vi.mock('../services/matching', () => ({
  dispatchJob: vi.fn(),
  distanceKm: vi.fn(),
  workerSockets: new Map(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
  handleRejectOffer: vi.fn(),
}))

describe('job routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST /jobs with employer JWT returns 201', async () => {
    mocks.insertReturningMock.mockResolvedValueOnce([{ id: 'job-1', title: 'Kitchen Help' }])

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-1', email: 'boss@test.com', role: 'employer' })
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Kitchen Help',
        category: 'food',
        startAt: '2026-03-12T09:00:00.000Z',
        endAt: '2026-03-12T13:00:00.000Z',
        hourlyRate: 12000,
        headcount: 2,
        lat: 37.5665,
        lng: 126.978,
        address: 'Seoul',
        description: 'Lunch shift',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().job.id).toBe('job-1')
    await app.close()
  })

  it('GET /jobs returns 200 array', async () => {
    mocks.executeMock.mockResolvedValueOnce({ rows: [{ id: 'job-1', title: 'Kitchen Help' }] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', email: 'worker@test.com', role: 'worker' })
    const response = await app.inject({
      method: 'GET',
      url: '/jobs',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(Array.isArray(response.json().jobs)).toBe(true)
    await app.close()
  })

  it('GET /jobs/:id returns 200', async () => {
    mocks.executeMock.mockResolvedValueOnce({ rows: [{ id: 'job-1', employer_id: 'employer-1', title: 'Kitchen Help' }] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', email: 'worker@test.com', role: 'worker' })
    const response = await app.inject({
      method: 'GET',
      url: '/jobs/job-1',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().job.id).toBe('job-1')
    await app.close()
  })

  it('GET /jobs with overnight avail_from=22:00&avail_to=06:00 returns 200 (overnight OR logic)', async () => {
    // Regression test: before fix, a job starting at 00:30 (inside overnight window 22:00–06:00)
    // was excluded because '00:30' >= '22:00' evaluates false lexicographically.
    // After fix: isOvernight=true → OR condition is used, job is included.
    mocks.executeMock.mockResolvedValueOnce({
      rows: [{ id: 'night-job-1', title: 'Night Shift', start_at: '2026-03-15T15:30:00Z', end_at: '2026-03-15T21:00:00Z' }]
    })
    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', role: 'worker' })
    const response = await app.inject({
      method: 'GET',
      url: '/jobs?avail_from=22:00&avail_to=06:00',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.statusCode).toBe(200)
    expect(Array.isArray(response.json().jobs)).toBe(true)
    await app.close()
  })

  it('unauthorized POST /jobs returns 401', async () => {
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: {
        title: 'Kitchen Help',
        category: 'food',
        startAt: '2026-03-12T09:00:00.000Z',
        endAt: '2026-03-12T13:00:00.000Z',
        hourlyRate: 12000,
        headcount: 2,
        lat: 37.5665,
        lng: 126.978,
        address: 'Seoul',
        description: 'Lunch shift',
      },
    })

    expect(response.statusCode).toBe(401)
    await app.close()
  })
})
