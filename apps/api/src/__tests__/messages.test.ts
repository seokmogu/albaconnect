/**
 * messages.test.ts — direct employer-worker messaging
 *
 * Tests:
 *  1. POST /api/jobs/:id/messages — 401 without auth
 *  2. POST /api/jobs/:id/messages — 400 on body too long (>1000 chars)
 *  3. GET /api/jobs/:id/messages — 401 without auth
 *  4. PATCH /api/jobs/:id/messages/read — 401 without auth
 *  5. GET /api/workers/me/messages/unread-count — 401 without auth
 *  6. Worker sends message as employer — 403 access denied (via mock)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

const mocks = vi.hoisted(() => {
  const limitMock = vi.fn()
  const whereMock = vi.fn(() => ({ limit: limitMock }))
  const fromMock = vi.fn(() => ({ where: whereMock }))
  const selectMock = vi.fn(() => ({ from: fromMock }))
  const returningMock = vi.fn()
  const valuesMock = vi.fn(() => ({ returning: returningMock }))
  const insertMock = vi.fn(() => ({ values: valuesMock }))
  const updateWhereMock = vi.fn(() => Promise.resolve())
  const setMock = vi.fn(() => ({ where: updateWhereMock }))
  const updateMock = vi.fn(() => ({ set: setMock }))
  const executeMock = vi.fn().mockResolvedValue({ rows: [{ count: '0' }] })

  const dbMock = {
    select: selectMock, insert: insertMock, update: updateMock, execute: executeMock,
  }

  return {
    dbMock, selectMock, fromMock, whereMock, limitMock,
    insertMock, valuesMock, returningMock, updateMock, setMock, updateWhereMock, executeMock
  }
})

vi.mock('../db', () => ({
  db: mocks.dbMock,
  messages: {
    id: 'id', jobId: 'jobId', senderId: 'senderId', recipientId: 'recipientId',
    body: 'body', readAt: 'readAt', createdAt: 'createdAt',
  },
  jobPostings: { id: 'id', employerId: 'employerId' },
  jobApplications: { jobId: 'jobId', workerId: 'workerId', status: 'status' },
  users: { id: 'id', phone: 'phone' },
  workerProfiles: {},
  employerProfiles: {},
}))
vi.mock('../db/migrate', () => ({ runMigrations: vi.fn() }))

const JOB_ID = 'jjjj0000-0000-0000-0000-jjjjjjjjjjjj'
const EMPLOYER_ID = 'eeee0000-0000-0000-0000-eeeeeeeeeeee'
const WORKER_ID = 'wwww0000-0000-0000-0000-wwwwwwwwwwww'

describe('direct messaging', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => { await app.close() })

  function workerToken() {
    return app.jwt.sign({ id: WORKER_ID, role: 'worker' })
  }

  function employerToken() {
    return app.jwt.sign({ id: EMPLOYER_ID, role: 'employer' })
  }

  // Test 1: POST without auth → 401
  it('POST /api/jobs/:id/messages returns 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/jobs/${JOB_ID}/messages`,
      payload: { body: 'Hello!' },
    })
    expect(res.statusCode).toBe(401)
  })

  // Test 2: POST with body > 1000 chars → 400
  it('POST /api/jobs/:id/messages returns 400 when body too long', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/jobs/${JOB_ID}/messages`,
      headers: { authorization: `Bearer ${workerToken()}` },
      payload: { body: 'x'.repeat(1001) },
    })
    expect(res.statusCode).toBe(400)
  })

  // Test 3: GET thread without auth → 401
  it('GET /api/jobs/:id/messages returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${JOB_ID}/messages` })
    expect(res.statusCode).toBe(401)
  })

  // Test 4: PATCH read without auth → 401
  it('PATCH /api/jobs/:id/messages/read returns 401 without token', async () => {
    const res = await app.inject({ method: 'PATCH', url: `/api/jobs/${JOB_ID}/messages/read` })
    expect(res.statusCode).toBe(401)
  })

  // Test 5: unread count without auth → 401
  it('GET /api/workers/me/messages/unread-count returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/workers/me/messages/unread-count' })
    expect(res.statusCode).toBe(401)
  })

  // Test 6: worker sending message to job they applied to (job found, no application → 403)
  it('worker without application on job gets 403', async () => {
    // job found, but no application for this worker
    mocks.limitMock
      .mockResolvedValueOnce([{ id: JOB_ID, employerId: EMPLOYER_ID }]) // job lookup
      .mockResolvedValueOnce([])  // no application found → 403

    const res = await app.inject({
      method: 'POST',
      url: `/api/jobs/${JOB_ID}/messages`,
      headers: { authorization: `Bearer ${workerToken()}` },
      payload: { body: 'Hi, I have a question.' },
    })

    expect(res.statusCode).toBe(403)
  })
})
