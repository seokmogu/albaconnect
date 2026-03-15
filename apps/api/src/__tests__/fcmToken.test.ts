/**
 * fcmToken.test.ts — FCM push notification support
 *
 * Tests:
 *  1. POST /workers/me/fcm-token returns 401 without auth
 *  2. POST /workers/me/fcm-token returns 400 with empty token
 *  3. DELETE /workers/me/fcm-token returns 401 without auth
 *  4. sendFcmNotification returns { success: false, channel: 'none' } in VITEST env
 *  5. sendFcmToWorker returns { success: false, error: 'Worker not found', channel: 'none' } for unknown worker
 *  6. workerProfiles schema has fcmToken column
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendFcmNotification, sendFcmToWorker } from '../services/fcmNotification'
import { workerProfiles } from '../db/schema'
import { buildApp } from '../index'

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })) })),
  }
}))

vi.mock('../db', () => ({
  db: dbMock,
  workerProfiles: { userId: 'userId', fcmToken: 'fcmToken' },
  users: {}, employerProfiles: {}, jobPostings: {}, jobApplications: {},
  jobTemplates: {}, messages: {}, payments: {}, penalties: {}, reviews: {},
  workerCertifications: {}, workerAvailability: {},
}))
vi.mock('../db/migrate', () => ({ runMigrations: vi.fn() }))

describe('FCM push notification support', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })
  afterEach(async () => { await app.close() })

  // Test 1: POST /workers/me/fcm-token 401
  it('POST /workers/me/fcm-token returns 401 without auth', async () => {
    const res = await app.inject({ method: 'POST', url: '/workers/me/fcm-token', payload: { token: 'abc' } })
    expect(res.statusCode).toBe(401)
  })

  // Test 2: POST /workers/me/fcm-token 400 with empty token
  it('POST /workers/me/fcm-token returns 400 with empty token', async () => {
    const workerToken = app.jwt.sign({ id: 'w-id', role: 'worker' })
    const res = await app.inject({
      method: 'POST',
      url: '/workers/me/fcm-token',
      payload: { token: '' },
      headers: { authorization: `Bearer ${workerToken}` },
    })
    expect(res.statusCode).toBe(400)
  })

  // Test 3: DELETE /workers/me/fcm-token 401
  it('DELETE /workers/me/fcm-token returns 401 without auth', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/workers/me/fcm-token' })
    expect(res.statusCode).toBe(401)
  })

  // Test 4: sendFcmNotification VITEST guard
  it('sendFcmNotification returns { success: false, channel: none } in VITEST env', async () => {
    const result = await sendFcmNotification('fake-token', 'Test', 'Body')
    expect(result).toMatchObject({ success: false, channel: 'none' })
  })

  // Test 5: sendFcmToWorker unknown worker
  it('sendFcmToWorker returns { error: Worker not found } for unknown worker', async () => {
    const result = await sendFcmToWorker(dbMock as any, 'nonexistent-id', 'Test', 'Body')
    expect(result).toMatchObject({ success: false, error: 'Worker not found', channel: 'none' })
  })

  // Test 6: schema has fcmToken column
  it('workerProfiles schema has fcmToken column', async () => {
    const realSchema = (await import('../db/schema')).workerProfiles
    expect((realSchema as any).fcmToken).toBeDefined()
  })
})
