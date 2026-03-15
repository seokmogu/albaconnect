/**
 * surgePricing.test.ts — dynamic surge pricing
 *
 * Tests:
 *  1. computeSurgeMultiplier — base rate 1.00 with low demand ratio
 *  2. computeSurgeMultiplier — 1.20x at ratio 2.5
 *  3. computeSurgeMultiplier — 1.50x at ratio 5.0
 *  4. computeSurgeMultiplier — 2.00x at ratio 9.0 (capped)
 *  5. computeSurgeMultiplier — peak hour bonus adds 0.10x (weekday 07-09 KST)
 *  6. computeSurgeMultiplier — last-minute bonus within 2h
 *  7. GET /employer/jobs/surge-estimate — 401 without auth
 *  8. GET /employer/jobs/surge-estimate — 400 on invalid start_at
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeSurgeMultiplier } from '../services/surgePricing'
import { buildApp } from '../index'

const mocks = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })) })),
    execute: vi.fn().mockResolvedValue({ rows: [{ open_count: '1', worker_count: '1' }] }),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) })),
  }
}))

vi.mock('../db', () => ({
  db: mocks.dbMock,
  jobPostings: { id: 'id', category: 'category', startAt: 'startAt', location: 'location', status: 'status', surgeMultiplier: 'surgeMultiplier' },
  users: {}, workerProfiles: {}, employerProfiles: {}, jobApplications: {}, jobTemplates: {},
  messages: {}, payments: {}, penalties: {}, reviews: {},
}))
vi.mock('../db/migrate', () => ({ runMigrations: vi.fn() }))

// Helpers for KST time construction
function kstHour(hour: number, dayOffset = 0): Date {
  // KST = UTC + 9h; to get KST=hour, set UTC = hour - 9
  const d = new Date()
  d.setUTCHours(hour - 9, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + dayOffset)
  return d
}

describe('computeSurgeMultiplier (pure)', () => {
  // Test 1: low demand → 1.00
  it('returns 1.00 when demand ratio is below 2.0', () => {
    const result = computeSurgeMultiplier({ demandRatio: 1.5, startAt: new Date("2026-04-01T05:00:00Z"), now: new Date("2026-04-01T05:00:00Z") })
    expect(result).toBe(1.00)
  })

  // Test 2: ratio 2.5 → 1.20x
  it('returns 1.20 when demand ratio is 2.5', () => {
    const result = computeSurgeMultiplier({ demandRatio: 2.5, startAt: new Date("2026-04-01T05:00:00Z"), now: new Date("2026-04-01T05:00:00Z") })
    expect(result).toBe(1.20)
  })

  // Test 3: ratio 5.0 → 1.50x
  it('returns 1.50 when demand ratio is 5.0', () => {
    const result = computeSurgeMultiplier({ demandRatio: 5.0, startAt: new Date("2026-04-01T05:00:00Z"), now: new Date("2026-04-01T05:00:00Z") })
    expect(result).toBe(1.50)
  })

  // Test 4: ratio > 8 → 2.00x cap
  it('caps at 2.00 when demand ratio exceeds 8.0', () => {
    const result = computeSurgeMultiplier({ demandRatio: 10, startAt: new Date("2026-04-01T05:00:00Z"), now: new Date("2026-04-01T05:00:00Z") })
    expect(result).toBe(2.00)
  })

  // Test 5: peak hour (KST 08:00, weekday) adds 0.10
  it('adds 0.10 bonus for weekday peak hour (07-09 KST)', () => {
    // KST 08:00 on a Monday (2026-03-16 23:00 UTC = 2026-03-17 08:00 KST)
    const startAt = new Date('2026-03-16T23:00:00Z')
    // now is 3 hours before startAt (outside 2h last-minute window)
    const now = new Date(startAt.getTime() - 3 * 3600_000)
    const result = computeSurgeMultiplier({ demandRatio: 2.5, startAt, now })
    expect(result).toBe(1.30) // 1.20 base + 0.10 peak
  })

  // Test 6: last-minute (<2h) adds 0.10 — use midday KST (not peak) to avoid double bonus
  it('adds 0.10 last-minute bonus when job starts within 2 hours', () => {
    // 2026-04-01 03:00 UTC = 2026-04-01 12:00 KST (Wednesday, not peak)
    const startAt = new Date('2026-04-01T03:00:00Z')
    const now = new Date('2026-04-01T01:30:00Z') // 90 min before = last-minute
    const result = computeSurgeMultiplier({ demandRatio: 0, startAt, now })
    expect(result).toBe(1.10) // no base surge, +0.10 last-minute
  })
})

describe('surge endpoints', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => { await app.close() })

  // Test 7: surge-estimate 401 without auth
  it('GET /employer/jobs/surge-estimate returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/employer/jobs/surge-estimate' })
    expect(res.statusCode).toBe(401)
  })

  // Test 8: invalid date
  it('GET /employer/jobs/surge-estimate returns 400 on invalid start_at', async () => {
    const employerToken = app.jwt.sign({ id: 'emp-id', role: 'employer' })
    const res = await app.inject({
      method: 'GET',
      url: '/employer/jobs/surge-estimate?start_at=not-a-date',
      headers: { authorization: `Bearer ${employerToken}` },
    })
    expect(res.statusCode).toBe(400)
  })
})
