/**
 * certifications.test.ts — worker certification badges and admin verification
 *
 * Tests:
 *  1. POST /workers/certifications — worker creates pending cert
 *  2. PATCH /workers/certifications/:id — admin verifies cert (status=verified)
 *  3. GET /workers/:id/certifications — expired cert filtered from public view
 *  4. GET /workers/available — certification_types[] badge present in search result
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

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
  const mockTable = { id: 'id', workerId: 'worker_id', type: 'type', status: 'status', evidenceUrl: 'evidence_url', verifiedBy: 'verified_by', verifiedAt: 'verified_at', expiresAt: 'expires_at', createdAt: 'created_at' }
  return {
    db: dbMock,
    workerCertifications: mockTable,
    workerProfiles: { userId: 'user_id', categories: 'categories', bio: 'bio', ratingAvg: 'rating_avg', ratingCount: 'rating_count', isAvailable: 'is_available', isSuspended: 'is_suspended', isPhoneVerified: 'is_phone_verified', lastSeenAt: 'last_seen_at', updatedAt: 'updated_at', pushSubscription: 'push_subscription' },
    users: { id: 'id', email: 'email', role: 'role', name: 'name', phone: 'phone' },
    workerAvailability: { id: 'id', workerId: 'worker_id', dayOfWeek: 'day_of_week', startTime: 'start_time', endTime: 'end_time', validFrom: 'valid_from', validUntil: 'valid_until' },
    workerBlackout: { id: 'id', workerId: 'worker_id', blackoutDate: 'blackout_date' },
    jobPostings: { id: 'id', status: 'status', employerId: 'employer_id' },
  }
})

const WORKER_ID = 'aaaa0000-0000-0000-0000-aaaaaaaaaaaa'
const CERT_ID   = 'bbbb0000-0000-0000-0000-bbbbbbbbbbbb'
const ADMIN_KEY = 'test-admin-key'

describe('Worker certifications', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    process.env['ADMIN_KEY'] = ADMIN_KEY
    app = await buildApp()
  })

  afterEach(async () => {
    await app.close()
    delete process.env['ADMIN_KEY']
  })

  // ── Test 1: Worker creates pending certification ───────────────────────────
  it('POST /workers/certifications — creates a pending certification', async () => {
    const workerToken = app.jwt.sign({ id: WORKER_ID, role: 'worker' })
    const createdCert = {
      id: CERT_ID,
      workerId: WORKER_ID,
      type: 'FOOD_HANDLER',
      status: 'pending',
      evidenceUrl: 'https://example.com/cert.pdf',
      verifiedBy: null,
      verifiedAt: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
    }

    // Mock: db.insert(...).values(...).returning() → [createdCert]
    dbMock.insert.mockReturnValue({
      values: () => ({
        returning: () => Promise.resolve([createdCert]),
      }),
    })

    const res = await app.inject({
      method: 'POST',
      url: '/workers/certifications',
      headers: { authorization: `Bearer ${workerToken}` },
      payload: { type: 'FOOD_HANDLER', evidence_url: 'https://example.com/cert.pdf' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.certification.status).toBe('pending')
    expect(body.certification.type).toBe('FOOD_HANDLER')
  })

  // ── Test 2: Admin verifies a certification ────────────────────────────────
  it('PATCH /workers/certifications/:id — admin can verify cert', async () => {
    const adminToken = app.jwt.sign({ id: 'admin-id', role: 'employer' })
    const verifiedCert = {
      id: CERT_ID,
      workerId: WORKER_ID,
      type: 'FOOD_HANDLER',
      status: 'verified',
      evidenceUrl: 'https://example.com/cert.pdf',
      verifiedBy: 'admin-id',
      verifiedAt: new Date().toISOString(),
      expiresAt: null,
      createdAt: new Date().toISOString(),
    }

    dbMock.update.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([verifiedCert]),
        }),
      }),
    })

    const res = await app.inject({
      method: 'PATCH',
      url: `/workers/certifications/${CERT_ID}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-admin-key': ADMIN_KEY,
      },
      payload: { status: 'verified' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.certification.status).toBe('verified')
    expect(body.certification.verifiedBy).toBe('admin-id')
  })

  // ── Test 3: Expired cert filtered from public GET ─────────────────────────
  it('GET /workers/:id/certifications — expired cert not shown to public', async () => {
    const workerToken = app.jwt.sign({ id: WORKER_ID, role: 'worker' })

    // Public view: SQL filtered by status=verified AND expires_at > NOW()
    // Mock returns empty (expired certs are excluded by DB WHERE)
    dbMock.execute.mockResolvedValue({ rows: [] })

    const res = await app.inject({
      method: 'GET',
      url: `/workers/${WORKER_ID}/certifications`,
      headers: { authorization: `Bearer ${workerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.certifications).toBeInstanceOf(Array)
    expect(body.certifications).toHaveLength(0)
  })

  it('GET /workers/:id/certifications — admin sees all statuses (no SQL filter)', async () => {
    const adminToken = app.jwt.sign({ id: 'admin-id', role: 'employer' })
    const allCerts = [
      { id: CERT_ID, workerId: WORKER_ID, type: 'DRIVER_LICENSE', status: 'expired' },
      { id: 'cert-2', workerId: WORKER_ID, type: 'FOOD_HANDLER', status: 'pending' },
    ]

    // Admin path uses db.select().from().where() chain
    dbMock.select.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve(allCerts),
      }),
    })

    const res = await app.inject({
      method: 'GET',
      url: `/workers/${WORKER_ID}/certifications`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-admin-key': ADMIN_KEY,
      },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.certifications).toHaveLength(2)
    expect(body.certifications.some((c: { status: string }) => c.status === 'expired')).toBe(true)
  })

  // ── Test 4: certification_types[] badge in GET /workers/available ──────────
  it('GET /workers/available — result rows include certification_types array', async () => {
    // Mock the SQL query result with certification_types
    dbMock.execute.mockResolvedValue({
      rows: [
        {
          id: WORKER_ID,
          name: '홍길동',
          categories: ['요식업'],
          rating_avg: '4.5',
          rating_count: 12,
          lat: 37.5,
          lng: 127.0,
          certification_types: ['FOOD_HANDLER', 'ID_VERIFIED'],
        },
      ],
    })

    const res = await app.inject({
      method: 'GET',
      url: '/workers/available?date=2026-03-15',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.workers).toHaveLength(1)
    expect(body.workers[0].certification_types).toBeInstanceOf(Array)
    expect(body.workers[0].certification_types).toContain('FOOD_HANDLER')
  })
})
