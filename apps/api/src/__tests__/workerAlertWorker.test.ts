/**
 * workerAlertWorker.test.ts
 *
 * Tests:
 *  1. runWorkerAlerts — sends alert when eligible workers and jobs exist
 *  2. runWorkerAlerts — skips worker when no open jobs found (skipped++)
 *  3. runWorkerAlerts — returns sent=0 when no eligible workers
 *  4. POST /admin/workers/send-alerts — returns 200 with sent/skipped/errors
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runWorkerAlerts, ALERT_INTERVAL_DAYS } from '../services/workerAlertWorker'
import { buildApp } from '../index'

// ── KakaoTalk mock ─────────────────────────────────────────────────────────────
vi.mock('../services/kakaoAlimTalk', () => ({
  jobAlertAlimTalk: vi.fn().mockResolvedValue(undefined),
  initKakaoAlimTalk: vi.fn(),
}))

// ── DB mock ────────────────────────────────────────────────────────────────────
const { dbMock } = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
    insert: vi.fn(),
  }
  return { dbMock }
})

vi.mock('../db', () => ({
  db: dbMock,
  users: { id: 'id', phone: 'phone' },
  workerProfiles: {
    userId: 'userId',
    isAvailable: 'isAvailable',
    isPhoneVerified: 'isPhoneVerified',
    lastAlertSentAt: 'lastAlertSentAt',
  },
  jobPostings: { id: 'id', title: 'title', hourlyRate: 'hourlyRate', status: 'status', startAt: 'startAt' },
}))
vi.mock('../db/migrate', () => ({ runMigrations: vi.fn() }))

const WORKER_ID = 'wwww0000-0000-0000-0000-wwwwwwwwwwww'

// ── Unit tests ────────────────────────────────────────────────────────────────

describe('runWorkerAlerts (unit)', () => {
  beforeEach(() => vi.clearAllMocks())

  // Test 1: sends alert when eligible workers + jobs exist
  it('sends alert and updates lastAlertSentAt when eligible', async () => {
    const { jobAlertAlimTalk } = await import('../services/kakaoAlimTalk')

    // eligible workers query
    dbMock.select
      .mockImplementationOnce(() => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: () => Promise.resolve([{ userId: WORKER_ID, phone: '01012345678', lastAlertSentAt: null }]) }),
          }),
        }),
      }))
      // nearby jobs query
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => Promise.resolve([
                { id: 'job-1', title: '편의점 알바', hourlyRate: 10000 },
                { id: 'job-2', title: '카페 알바', hourlyRate: 10500 },
              ]),
            }),
          }),
        }),
      }))

    dbMock.update.mockReturnValue({ set: () => ({ where: () => Promise.resolve() }) })

    const result = await runWorkerAlerts(dbMock as any)

    expect(result.sent).toBe(1)
    expect(result.errors).toBe(0)
    expect(jobAlertAlimTalk).toHaveBeenCalledTimes(1)
    expect(jobAlertAlimTalk).toHaveBeenCalledWith(expect.objectContaining({
      phone: '01012345678',
      jobCount: 2,
      topJobTitle: '편의점 알바',
      hourlyRate: 10000,
    }))
    expect(dbMock.update).toHaveBeenCalledTimes(1)
  })

  // Test 2: skips worker when no open jobs
  it('increments skipped when no open jobs available', async () => {
    dbMock.select
      .mockImplementationOnce(() => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ userId: WORKER_ID, phone: '01099998888', lastAlertSentAt: null }]),
            }),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => Promise.resolve([]), // no jobs
            }),
          }),
        }),
      }))

    const result = await runWorkerAlerts(dbMock as any)

    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
  })

  // Test 3: returns zero counts when no eligible workers
  it('returns sent=0 skipped=0 when no eligible workers', async () => {
    dbMock.select.mockImplementationOnce(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
    }))

    const result = await runWorkerAlerts(dbMock as any)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.errors).toBe(0)
  })
})

// ── HTTP route test ────────────────────────────────────────────────────────────

describe('POST /admin/workers/send-alerts', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => { await app.close() })

  // Test 4: admin endpoint returns 200 with result shape
  it('returns 200 with sent/skipped/errors/triggeredAt', async () => {
    const ADMIN_KEY = process.env['ADMIN_TOKEN'] ?? 'dev-admin-token'

    // Mock select for runWorkerAlerts called inside the route
    dbMock.select.mockImplementation(() => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: () => Promise.resolve([]) }), // no eligible workers → quick return
        }),
      }),
    }))

    const res = await app.inject({
      method: 'POST',
      url: '/admin/workers/send-alerts',
      headers: { 'x-admin-token': ADMIN_KEY },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('sent')
    expect(body).toHaveProperty('skipped')
    expect(body).toHaveProperty('errors')
    expect(body).toHaveProperty('triggeredAt')
    expect(typeof body.sent).toBe('number')
  })
})
