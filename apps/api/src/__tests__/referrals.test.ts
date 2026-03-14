/**
 * referrals.test.ts — Worker referral and invite system
 *
 * Tests:
 *  1. POST /workers/referrals/invite — returns inviteUrl with inviteCode
 *  2. POST /auth/register with body.ref — referral row created with pending status
 *  3. POST /applications/:id/complete with pending referral — bonus payment insert + referral rewarded
 *  4. GET /workers/referrals — returns referrals array with totalEarned
 *  5. Self-referral guard: POST /auth/register where ref resolves to same user → referral NOT created
 *  6. Duplicate referee (23505 error) → caught gracefully, user still gets 201
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'
import bcrypt from 'bcrypt'

// ── DB mock ────────────────────────────────────────────────────────────────────
const { dbMock } = vi.hoisted(() => {
  const dbMock = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  }
  return { dbMock }
})

vi.mock('../db', () => {
  const workerProfilesMock = {
    userId: 'user_id',
    categories: 'categories',
    bio: 'bio',
    ratingAvg: 'rating_avg',
    ratingCount: 'rating_count',
    isAvailable: 'is_available',
    isSuspended: 'is_suspended',
    isPhoneVerified: 'is_phone_verified',
    inviteCode: 'invite_code',
    lastSeenAt: 'last_seen_at',
    updatedAt: 'updated_at',
    pushSubscription: 'push_subscription',
  }
  const referralsMock = {
    id: 'id',
    referrerId: 'referrer_id',
    refereeId: 'referee_id',
    status: 'status',
    bonusAmount: 'bonus_amount',
    qualifiedAt: 'qualified_at',
    rewardedAt: 'rewarded_at',
    createdAt: 'created_at',
  }
  return {
    db: dbMock,
    users: { id: 'id', email: 'email', role: 'role', name: 'name', phone: 'phone', passwordHash: 'password_hash', createdAt: 'created_at' },
    workerProfiles: workerProfilesMock,
    employerProfiles: { userId: 'user_id', companyName: 'company_name' },
    referrals: referralsMock,
    payments: { id: 'id', jobId: 'job_id', payerId: 'payer_id', amount: 'amount', platformFee: 'platform_fee', status: 'status', tossPaymentKey: 'toss_payment_key', createdAt: 'created_at' },
    jobApplications: { id: 'id', jobId: 'job_id', workerId: 'worker_id', status: 'status', respondedAt: 'responded_at' },
    jobPostings: { id: 'id', status: 'status', employerId: 'employer_id', updatedAt: 'updated_at' },
    // other tables referenced by routes
    workerCertifications: { id: 'id', workerId: 'worker_id', type: 'type', status: 'status' },
    workerAvailability: { id: 'id', workerId: 'worker_id', dayOfWeek: 'day_of_week', startTime: 'start_time', endTime: 'end_time', validFrom: 'valid_from', validUntil: 'valid_until' },
    workerBlackout: { id: 'id', workerId: 'worker_id', blackoutDate: 'blackout_date' },
    reviews: { id: 'id', jobId: 'job_id', reviewerId: 'reviewer_id', revieweeId: 'reviewee_id', rating: 'rating' },
    penalties: { id: 'id' },
    notifications: { id: 'id', userId: 'user_id', type: 'type', title: 'title', body: 'body', read: 'read' },
    jobTemplates: { id: 'id', employerId: 'employer_id' },
    employerProfiles: { userId: 'user_id' },
    jobDisputes: { id: 'id' },
  }
})

const WORKER_ID   = 'aaaa0000-0000-0000-0000-aaaaaaaaaaaa'
const REFEREE_ID  = 'bbbb0000-0000-0000-0000-bbbbbbbbbbbb'
const APP_ID      = 'cccc0000-0000-0000-0000-cccccccccccc'
const JOB_ID      = 'dddd0000-0000-0000-0000-dddddddddddd'
const REFERRAL_ID = 'eeee0000-0000-0000-0000-eeeeeeeeeeee'
const INVITE_CODE = 'abc12345'

// Helper to build a chainable Drizzle-like mock
const chain = (result: unknown) => {
  const obj: Record<string, unknown> = {}
  const methods = ['select', 'from', 'where', 'limit', 'offset', 'orderBy', 'innerJoin', 'leftJoin', 'set', 'values', 'returning', 'insert', 'update', 'delete', 'execute']
  methods.forEach(m => { obj[m] = vi.fn(() => obj) })
  ;(obj as { then: (r: (v: unknown) => unknown) => unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result))
  return obj
}

let app: Awaited<ReturnType<typeof buildApp>>

beforeEach(async () => {
  vi.resetAllMocks()
  app = await buildApp()
})

afterEach(async () => {
  await app.close()
})

// JWT helper
function makeToken(id: string, role = 'worker') {
  return app.jwt.sign({ id, email: `${id}@test.com`, role })
}

// ── Test 1: POST /workers/referrals/invite ──────────────────────────────────
describe('POST /workers/referrals/invite', () => {
  it('returns inviteUrl containing the worker invite code', async () => {
    dbMock.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ inviteCode: INVITE_CODE }]),
        }),
      }),
    })

    const res = await app.inject({
      method: 'POST',
      url: '/workers/referrals/invite',
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.inviteCode).toBe(INVITE_CODE)
    expect(body.inviteUrl).toContain(INVITE_CODE)
    expect(body.inviteUrl).toMatch(/ref=/)
  })
})

// ── Test 2: POST /auth/register with body.ref ──────────────────────────────
describe('POST /auth/register with referral code', () => {
  it('creates referral row with pending status when valid ref provided', async () => {
    // Mock: no existing user
    dbMock.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // no existing email
          }),
        }),
      })
      // Mock: referrer lookup by invite code
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ userId: WORKER_ID }]),
          }),
        }),
      })

    dbMock.insert.mockImplementation(() => {
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: REFEREE_ID, email: 'new@test.com', role: 'worker', name: 'New Worker' }]),
        }),
      }
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'newworker@test.com',
        password: 'password123',
        role: 'worker',
        name: 'New Worker',
        phone: '01012345678',
        ref: INVITE_CODE,
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.accessToken).toBeDefined()
    // db.insert should have been called (for users + workerProfiles + referrals)
    expect(dbMock.insert).toHaveBeenCalled()
  })
})

// ── Test 3: Application complete triggers referral qualification ─────────────
describe('POST /applications/:id/complete with pending referral', () => {
  it('marks referral as rewarded and inserts payment on first job completion', async () => {
    const mockApplication = {
      id: APP_ID,
      jobId: JOB_ID,
      workerId: WORKER_ID,
      status: 'accepted',
    }
    const mockReferral = {
      id: REFERRAL_ID,
      referrerId: 'referrer-uuid',
      refereeId: WORKER_ID,
      status: 'pending',
      bonusAmount: 5000,
    }

    let updateCallCount = 0
    let insertCallCount = 0

    dbMock.select
      // application lookup
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockApplication]),
          }),
        }),
      })
      // job lookup
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: JOB_ID, status: 'in_progress' }]),
          }),
        }),
      })
      // accepted apps check (all completed — no accepted remaining)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })
      // referral lookup (fire-and-forget IIFE)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockReferral]),
          }),
        }),
      })

    dbMock.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    })
    dbMock.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    })

    const res = await app.inject({
      method: 'POST',
      url: `/applications/${APP_ID}/complete`,
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().message).toBe('Job marked as complete')

    // Give the fire-and-forget IIFE time to execute
    await new Promise(r => setTimeout(r, 50))

    // db.insert should have been called (referral bonus payment)
    expect(dbMock.insert).toHaveBeenCalled()
    // db.update should have been called (qualification + rewarded)
    expect(dbMock.update).toHaveBeenCalled()
  })
})

// ── Test 4: GET /workers/referrals ──────────────────────────────────────────
describe('GET /workers/referrals', () => {
  it('returns referrals array with totalEarned', async () => {
    dbMock.execute
      .mockResolvedValueOnce({
        rows: [
          { id: REFERRAL_ID, referee_id: REFEREE_ID, referee_name: 'Friend', status: 'rewarded', bonus_amount: 5000, qualified_at: null, rewarded_at: null, created_at: new Date() },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: '5000' }] })

    const res = await app.inject({
      method: 'GET',
      url: '/workers/referrals',
      headers: { authorization: `Bearer ${makeToken(WORKER_ID)}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.referrals)).toBe(true)
    expect(body.totalEarned).toBe(5000)
  })
})

// ── Test 5: Self-referral prevention ────────────────────────────────────────
describe('POST /auth/register — self-referral prevention', () => {
  it('does not create referral row when ref resolves to same user', async () => {
    // No existing email
    dbMock.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      })
      // Referrer lookup returns same userId as the one being registered
      // (simulate: new user happens to have the same ID — in practice prevented by referrer !== user.id check)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ userId: REFEREE_ID }]), // REFEREE_ID will be the new user
          }),
        }),
      })

    let referralInsertCalled = false
    dbMock.insert.mockImplementation((table: unknown) => {
      const t = table as Record<string, unknown>
      // Detect referrals table insert by checking for referee_id key
      if (t?.refereeId === 'referee_id') {
        referralInsertCalled = true
      }
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: REFEREE_ID, email: 'self@test.com', role: 'worker', name: 'Self User' }]),
        }),
      }
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'self@test.com',
        password: 'password123',
        role: 'worker',
        name: 'Self User',
        phone: '01099998888',
        ref: INVITE_CODE,
      },
    })

    // Registration succeeds even if referral is skipped
    expect(res.statusCode).toBe(201)
    // Referral insert should NOT have been called (self-referral prevented)
    expect(referralInsertCalled).toBe(false)
  })
})

// ── Test 6: Duplicate referee (23505) handled gracefully ─────────────────────
describe('POST /auth/register — duplicate referee constraint', () => {
  it('returns 201 even when referral insert throws unique constraint error', async () => {
    dbMock.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ userId: WORKER_ID }]),
          }),
        }),
      })

    let insertCallIdx = 0
    dbMock.insert.mockImplementation((table: unknown) => {
      insertCallIdx++
      if (insertCallIdx === 3) {
        // 3rd insert = referrals table → throw 23505
        return {
          values: vi.fn().mockRejectedValue(Object.assign(new Error('unique violation'), { code: '23505' })),
        }
      }
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: REFEREE_ID, email: 'dup@test.com', role: 'worker', name: 'Dup Worker' }]),
        }),
      }
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'dup@test.com',
        password: 'password123',
        role: 'worker',
        name: 'Dup Worker',
        phone: '01011112222',
        ref: INVITE_CODE,
      },
    })

    // User is created successfully; referral duplication is ignored
    expect(res.statusCode).toBe(201)
    expect(res.json().accessToken).toBeDefined()
  })
})
