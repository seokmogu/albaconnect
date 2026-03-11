import bcrypt from 'bcrypt'
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
  return { selectLimitMock, selectWhereMock, selectFromMock, selectMock, insertReturningMock, insertValuesMock, insertIntoMock }
})

vi.mock('../db', () => ({
  db: {
    select: mocks.selectMock,
    insert: mocks.insertIntoMock,
  },
  users: { email: 'email' },
  employerProfiles: {},
  workerProfiles: {},
}))

describe('auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POST /auth/register returns 201', async () => {
    mocks.selectLimitMock.mockResolvedValueOnce([])
    mocks.insertReturningMock.mockResolvedValueOnce([{ id: 'user-1', email: 'boss@test.com', role: 'employer', name: 'Boss' }])
    mocks.insertValuesMock.mockReturnValueOnce({ returning: mocks.insertReturningMock }).mockReturnValueOnce(Promise.resolve())

    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'boss@test.com',
        password: 'password123',
        role: 'employer',
        name: 'Boss',
        phone: '01012345678',
        companyName: 'Alba Inc',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().user.email).toBe('boss@test.com')
    await app.close()
  })

  it('POST /auth/login returns 200 and cookies', async () => {
    const passwordHash = await bcrypt.hash('password123', 1)
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: 'user-1', email: 'boss@test.com', role: 'employer', name: 'Boss', passwordHash }])

    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'boss@test.com', password: 'password123' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['set-cookie']).toBeTruthy()
    await app.close()
  })

  it('POST /auth/login wrong password returns 401 with WWW-Authenticate', async () => {
    const passwordHash = await bcrypt.hash('password123', 1)
    mocks.selectLimitMock.mockResolvedValueOnce([{ id: 'user-1', email: 'boss@test.com', role: 'employer', name: 'Boss', passwordHash }])

    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'boss@test.com', password: 'wrong-password' },
    })

    expect(response.statusCode).toBe(401)
    expect(response.headers['www-authenticate']).toContain('Bearer')
    await app.close()
  })
})
