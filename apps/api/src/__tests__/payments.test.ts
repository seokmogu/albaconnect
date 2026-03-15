import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

const kakaoMocks = vi.hoisted(() => ({
  paymentCompleteAlimTalk: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/kakaoAlimTalk.js', () => kakaoMocks)

// Mock tossWebhook service — prevents real HMAC/idempotency logic from running in payment route tests
vi.mock('../services/tossWebhook', () => ({
  verifyTossSignature: vi.fn().mockReturnValue(true),
  recordWebhookEvent: vi.fn().mockResolvedValue(true),
  handlePaymentStatusChanged: vi.fn().mockResolvedValue(undefined),
  handleVirtualAccountDeposit: vi.fn().mockResolvedValue(undefined),
  runPaymentReconciliation: vi.fn().mockResolvedValue({ checked: 0, updated: 0, errors: 0 }),
  incrementWebhookCounter: vi.fn(),
  startReconciliationWorker: vi.fn(),
  stopReconciliationWorker: vi.fn(),
}))

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
  payments: { payerId: 'payerId', tossPaymentKey: 'tossPaymentKey', jobId: 'jobId', amount: 'amount' },
  jobPostings: { id: 'id', employerId: 'employerId', title: 'title' },
  users: { phone: 'phone', id: 'id' },
  jobApplications: { jobId: 'jobId', workerId: 'workerId', status: 'status' },
}))

describe('payment routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('POST /payments/escrow with TOSS_SECRET_KEY verifies payment and returns 201', async () => {
    process.env.TOSS_SECRET_KEY = 'test_sk_abc'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({ status: 'DONE', orderId: 'order-123' }),
    } as Response)

    mocks.selectLimitMock.mockResolvedValueOnce([{ id: 'job-1', totalAmount: 50000, escrowStatus: 'pending' }])
    mocks.insertReturningMock.mockResolvedValueOnce([{ id: 'payment-2', amount: 55000, tossOrderId: 'order-123', tossStatus: 'DONE' }])
    mocks.updateWhereMock.mockResolvedValueOnce(undefined)

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-1', email: 'boss@test.com', role: 'employer' })
    const response = await app.inject({
      method: 'POST',
      url: '/payments/escrow',
      headers: { authorization: `Bearer ${token}` },
      payload: { jobId: '11111111-1111-1111-1111-111111111111', tossPaymentKey: 'pay_key_abc' },
    })

    expect(response.statusCode).toBe(201)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.tosspayments.com/v1/payments/pay_key_abc',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining('Basic ') }) })
    )
    delete process.env.TOSS_SECRET_KEY
    await app.close()
  })

  it('POST /payments/escrow without TOSS_SECRET_KEY runs in dev mode and returns 201', async () => {
    delete process.env.TOSS_SECRET_KEY
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    mocks.selectLimitMock.mockResolvedValueOnce([{ id: 'job-1', totalAmount: 50000, escrowStatus: 'pending' }])
    mocks.insertReturningMock.mockResolvedValueOnce([{ id: 'payment-3', amount: 55000 }])
    mocks.updateWhereMock.mockResolvedValueOnce(undefined)

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-1', email: 'boss@test.com', role: 'employer' })
    const response = await app.inject({
      method: 'POST',
      url: '/payments/escrow',
      headers: { authorization: `Bearer ${token}` },
      payload: { jobId: '11111111-1111-1111-1111-111111111111', tossPaymentKey: 'pay_key_xyz' },
    })

    expect(response.statusCode).toBe(201)
    expect(fetchSpy).not.toHaveBeenCalled()
    await app.close()
  })

  it('POST /payments/payout returns 202', async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: 'job-1', totalAmount: 50000, escrowStatus: 'escrowed', status: 'completed' }])

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-1', email: 'boss@test.com', role: 'employer' })
    const response = await app.inject({
      method: 'POST',
      url: '/payments/payout',
      headers: { authorization: `Bearer ${token}` },
      payload: { jobId: '11111111-1111-1111-1111-111111111111' },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json().message).toContain('Payout queued')
    await app.close()
  })

  it('POST /payments/webhook with valid auth returns 200', async () => {
    process.env.TOSS_WEBHOOK_SECRET = 'webhook-secret'
    const expectedAuth = 'Basic ' + Buffer.from('webhook-secret:').toString('base64')

    mocks.updateWhereMock.mockResolvedValue(undefined)
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: 'payment-1', jobId: 'job-1' }])

    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      headers: { authorization: expectedAuth },
      payload: {
        eventType: 'PAYMENT_STATUS_CHANGED',
        data: { paymentKey: 'pay_key_abc', orderId: 'order-123', status: 'DONE' },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().received).toBe(true)
    delete process.env.TOSS_WEBHOOK_SECRET
    await app.close()
  })

  it('POST /payments/webhook with invalid signature returns 401', async () => {
    process.env.TOSS_WEBHOOK_SECRET = 'webhook-secret'

    // Override verifyTossSignature to return false for this test
    const tossWebhook = await import('../services/tossWebhook')
    vi.mocked(tossWebhook.verifyTossSignature).mockReturnValueOnce(false)

    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      headers: { tosssignature: 'bad-signature-hex' },
      payload: {
        eventType: 'PAYMENT_STATUS_CHANGED',
        data: { paymentKey: 'pay_key_abc', status: 'DONE' },
      },
    })

    expect(response.statusCode).toBe(401)
    delete process.env.TOSS_WEBHOOK_SECRET
    await app.close()
  })

  it('POST /payments/webhook duplicate (idempotency) returns 200 with duplicate flag', async () => {
    delete process.env.TOSS_WEBHOOK_SECRET

    // Simulate recordWebhookEvent returning false (already seen)
    const { recordWebhookEvent } = await import('../services/tossWebhook')
    vi.mocked(recordWebhookEvent).mockResolvedValueOnce(false)

    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      payload: {
        eventType: 'PAYMENT_STATUS_CHANGED',
        data: { paymentKey: 'pay_key_dup', status: 'DONE' },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().received).toBe(true)
    expect(response.json().duplicate).toBe(true)
    await app.close()
  })

  it('PAYOUT_DONE webhook returns 200', async () => {
    delete process.env.TOSS_WEBHOOK_SECRET
    const returningMock = vi.fn().mockResolvedValue([{ jobId: 'job-1', amount: 55000 }])
    const setMock = vi.fn(() => ({
      where: vi.fn(() => ({ returning: returningMock })),
    }))
    mocks.updateMock.mockReturnValueOnce({ set: setMock })
    mocks.selectLimitMock
      .mockResolvedValueOnce([{ workerId: 'worker-1' }])
      .mockResolvedValueOnce([{ title: 'Kitchen Help' }])
      .mockResolvedValueOnce([{ phone: '01012345678' }])

    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      payload: {
        eventType: 'PAYOUT_DONE',
        data: { paymentKey: 'pay_key_done', status: 'DONE' },
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(response.statusCode).toBe(200)
    await app.close()
  })
})
