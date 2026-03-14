import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

const mocks = vi.hoisted(() => {
  const executeMock = vi.fn()
  const selectLimitMock = vi.fn()
  const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }))
  const selectFromMock = vi.fn(() => ({ where: selectWhereMock }))
  const selectMock = vi.fn(() => ({ from: selectFromMock }))
  const updateWhereMock = vi.fn()
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }))
  const updateMock = vi.fn(() => ({ set: updateSetMock }))
  const insertReturningMock = vi.fn()
  const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }))
  const insertMock = vi.fn(() => ({ values: insertValuesMock }))
  return {
    executeMock,
    selectLimitMock,
    selectWhereMock,
    selectFromMock,
    selectMock,
    updateWhereMock,
    updateSetMock,
    updateMock,
    insertReturningMock,
    insertValuesMock,
    insertMock,
  }
})

vi.mock('../db', () => ({
  db: {
    execute: mocks.executeMock,
    select: mocks.selectMock,
    update: mocks.updateMock,
    insert: mocks.insertMock,
  },
  jobApplications: {
    id: 'id',
    jobId: 'job_id',
    workerId: 'worker_id',
    status: 'status',
    checkinAt: 'checkin_at',
    checkoutAt: 'checkout_at',
  },
  jobPostings: {
    id: 'id',
    employerId: 'employer_id',
  },
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

describe('check-in / check-out routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST /jobs/:jobId/checkin records GPS coordinates (200)', async () => {
    // select().from().where().limit() — for "accepted application" query
    mocks.selectLimitMock.mockResolvedValueOnce([
      { id: 'app-1', jobId: 'job-1', workerId: 'worker-1', status: 'accepted', checkin_at: null },
    ])
    // db.execute() for the UPDATE
    mocks.executeMock.mockResolvedValueOnce({ rows: [] })

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', email: 'worker@test.com', role: 'worker' })

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-1/checkin',
      headers: { authorization: `Bearer ${token}` },
      payload: { latitude: 37.5665, longitude: 126.978 },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toHaveProperty('checkedInAt')
    expect(body.jobId).toBe('job-1')
    expect(body.workerId).toBe('worker-1')
    await app.close()
  })

  it('POST /jobs/:jobId/checkin duplicate → 409', async () => {
    // Application already has checkin_at set
    mocks.selectLimitMock.mockResolvedValueOnce([
      { id: 'app-1', jobId: 'job-1', workerId: 'worker-1', status: 'accepted', checkin_at: new Date() },
    ])

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', email: 'worker@test.com', role: 'worker' })

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-1/checkin',
      headers: { authorization: `Bearer ${token}` },
      payload: { latitude: 37.5665, longitude: 126.978 },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error).toMatch(/already checked in/i)
    await app.close()
  })

  it('POST /jobs/:jobId/checkin on non-accepted application → 404', async () => {
    // No accepted application found
    mocks.selectLimitMock.mockResolvedValueOnce([])

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', email: 'worker@test.com', role: 'worker' })

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-99/checkin',
      headers: { authorization: `Bearer ${token}` },
      payload: { latitude: 37.5, longitude: 127.0 },
    })

    expect(response.statusCode).toBe(404)
    await app.close()
  })

  it('POST /jobs/:jobId/checkout calculates actual_hours correctly (200)', async () => {
    // db.execute() for SELECT (active checkin)
    mocks.executeMock.mockResolvedValueOnce({
      rows: [{ id: 'app-1', job_id: 'job-1', worker_id: 'worker-1', checkin_at: new Date(Date.now() - 3600 * 1000) }],
    })
    // db.execute() for UPDATE RETURNING
    mocks.executeMock.mockResolvedValueOnce({
      rows: [{ checkout_at: new Date().toISOString(), actual_hours: '1.00' }],
    })

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'worker-1', email: 'worker@test.com', role: 'worker' })

    const response = await app.inject({
      method: 'POST',
      url: '/jobs/job-1/checkout',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(body).toHaveProperty('checkedOutAt')
    expect(body).toHaveProperty('actualHours')
    expect(typeof body.actualHours).toBe('number')
    expect(body.jobId).toBe('job-1')
    await app.close()
  })

  it('GET /jobs/:jobId/attendance employer view returns array', async () => {
    // select().from().where().limit() — for "job ownership" check
    mocks.selectLimitMock.mockResolvedValueOnce([
      { id: 'job-1', employerId: 'employer-1' },
    ])
    // db.execute() for attendance SELECT
    mocks.executeMock.mockResolvedValueOnce({
      rows: [
        { id: 'app-1', worker_id: 'worker-1', worker_name: 'Alice', checkin_at: new Date(), checkout_at: null, actual_hours: null },
        { id: 'app-2', worker_id: 'worker-2', worker_name: 'Bob', checkin_at: new Date(), checkout_at: new Date(), actual_hours: '2.50' },
      ],
    })

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-1', email: 'boss@test.com', role: 'employer' })

    const response = await app.inject({
      method: 'GET',
      url: '/jobs/job-1/attendance',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json()
    expect(Array.isArray(body.attendance)).toBe(true)
    expect(body.attendance).toHaveLength(2)
    await app.close()
  })
})
