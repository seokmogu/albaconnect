import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

const mocks = vi.hoisted(() => {
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
  return { selectLimitMock, selectWhereMock, selectFromMock, selectMock, insertReturningMock, insertValuesMock, insertIntoMock, updateWhereMock, updateSetMock, updateMock }
})

vi.mock('../db', () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertIntoMock,
    update: mocks.updateMock,
  },
  payments: { payerId: 'payerId' },
  jobPostings: { id: 'id', employerId: 'employerId' },
}))

describe('payment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST /payments/escrow returns 201 for employer', async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: 'job-1', totalAmount: 50000, escrowStatus: 'pending' }])
    mocks.insertReturningMock.mockResolvedValueOnce([{ id: 'payment-1', amount: 55000 }])
    mocks.updateWhereMock.mockResolvedValueOnce(undefined)

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-1', email: 'boss@test.com', role: 'employer' })
    const response = await app.inject({
      method: 'POST',
      url: '/payments/escrow',
      headers: { authorization: `Bearer ${token}` },
      payload: { jobId: '11111111-1111-1111-1111-111111111111' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().payment.id).toBe('payment-1')
    await app.close()
  })

  it('GET /payments returns 200 for employer', async () => {
    mocks.selectWhereMock.mockReturnValueOnce(Promise.resolve([{ id: 'payment-1' }]))

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-1', email: 'boss@test.com', role: 'employer' })
    const response = await app.inject({
      method: 'GET',
      url: '/payments',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(Array.isArray(response.json().payments)).toBe(true)
    await app.close()
  })

  it('unauthorized POST /payments/escrow returns 401', async () => {
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/payments/escrow',
      payload: { jobId: '11111111-1111-1111-1111-111111111111' },
    })

    expect(response.statusCode).toBe(401)
    await app.close()
  })
})
