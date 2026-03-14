/**
 * templateClone.test.ts
 *
 * Tests:
 *  1. POST /employer/job-templates/:id/clone — creates new template with (복사) prefix
 *  2. Clone with title_override uses provided title instead of (복사) prefix
 *  3. Clone by non-owner returns 403
 *  4. PATCH /employer/job-templates/:id — partial update persists changed fields
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

const mocks = vi.hoisted(() => {
  const limitMock = vi.fn()
  const whereMock = vi.fn(() => ({ limit: limitMock }))
  const fromMock = vi.fn(() => ({ where: whereMock }))
  const selectMock = vi.fn(() => ({ from: fromMock }))

  const returningMock = vi.fn()
  const wherePatchMock = vi.fn(() => ({ returning: returningMock }))
  const setMock = vi.fn(() => ({ where: wherePatchMock }))
  const updateMock = vi.fn(() => ({ set: setMock }))

  const insertReturningMock = vi.fn()
  const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }))
  const insertIntoMock = vi.fn(() => ({ values: insertValuesMock }))

  const executeMock = vi.fn()

  const dbMock = {
    select: selectMock,
    update: updateMock,
    insert: insertIntoMock,
    execute: executeMock,
  }

  return {
    dbMock, selectMock, fromMock, whereMock, limitMock,
    updateMock, setMock, wherePatchMock, returningMock,
    insertIntoMock, insertValuesMock, insertReturningMock,
    executeMock,
  }
})

vi.mock('../db', () => ({
  db: mocks.dbMock,
  jobTemplates: {
    id: 'id', employerId: 'employerId', name: 'name',
    description: 'description', category: 'category',
    hourlyRate: 'hourlyRate', durationHours: 'durationHours',
    headcount: 'headcount', requiredSkills: 'requiredSkills',
    updatedAt: 'updatedAt', createdAt: 'createdAt',
  },
  jobPostings: {},
  users: {},
  workerProfiles: {},
  employerProfiles: {},
  jobApplications: {},
  payments: {},
}))
vi.mock('../db/migrate', () => ({ runMigrations: vi.fn() }))

const EMPLOYER_ID = 'eeee0000-0000-0000-0000-eeeeeeeeeeee'
const TEMPLATE_ID = 'tttt0000-0000-0000-0000-tttttttttttt'
const CLONED_ID   = 'cccc0000-0000-0000-0000-cccccccccccc'

const templateRow = {
  id: TEMPLATE_ID,
  employerId: EMPLOYER_ID,
  name: 'Friday Night Security',
  description: 'Guard duty 10pm-6am',
  category: 'security',
  hourlyRate: 12000,
  durationHours: 8,
  headcount: 2,
  requiredSkills: ['security', 'communication'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('job template clone + patch', () => {
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    vi.clearAllMocks()
    app = await buildApp()
  })

  afterEach(async () => { await app.close() })

  function employerToken() {
    return app.jwt.sign({ id: EMPLOYER_ID, role: 'employer' })
  }

  function resetOwnerCheck(found: object | null) {
    mocks.limitMock.mockResolvedValueOnce(found ? [found] : [])
  }

  function resetCountCheck(count: number) {
    mocks.executeMock.mockResolvedValueOnce({ rows: [{ count: String(count) }] })
  }

  function resetInsert(clonedRow: object) {
    mocks.insertReturningMock.mockResolvedValueOnce([clonedRow])
  }

  // Test 1: clone creates new template with (복사) prefix
  it('creates cloned template with (복사) prefix in name', async () => {
    resetOwnerCheck(templateRow)
    resetCountCheck(2)           // under limit
    resetInsert({ id: CLONED_ID, name: '(복사) Friday Night Security', createdAt: new Date().toISOString() })

    const res = await app.inject({
      method: 'POST',
      url: `/employer/job-templates/${TEMPLATE_ID}/clone`,
      headers: { authorization: `Bearer ${employerToken()}` },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBe(CLONED_ID)
    expect(body.title).toMatch(/복사/)
    expect(body.clonedFrom).toBe(TEMPLATE_ID)
    expect(mocks.insertIntoMock).toHaveBeenCalledTimes(1)
  })

  // Test 2: title_override replaces (복사) prefix
  it('uses title_override when provided', async () => {
    resetOwnerCheck(templateRow)
    resetCountCheck(1)
    resetInsert({ id: CLONED_ID, name: 'Weekend Guard Shift', createdAt: new Date().toISOString() })

    const res = await app.inject({
      method: 'POST',
      url: `/employer/job-templates/${TEMPLATE_ID}/clone`,
      headers: { authorization: `Bearer ${employerToken()}` },
      payload: { title_override: 'Weekend Guard Shift' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.title).toBe('Weekend Guard Shift')
  })

  // Test 3: non-owner gets 403
  it('returns 403 when employer does not own template', async () => {
    resetOwnerCheck(null)   // not found → 403

    const res = await app.inject({
      method: 'POST',
      url: `/employer/job-templates/${TEMPLATE_ID}/clone`,
      headers: { authorization: `Bearer ${employerToken()}` },
    })

    expect(res.statusCode).toBe(403)
    expect(mocks.insertIntoMock).not.toHaveBeenCalled()
  })

  // Test 4: PATCH updates fields
  it('PATCH updates template fields and returns updated template', async () => {
    // First select: ownership check
    mocks.limitMock.mockResolvedValueOnce([{ id: TEMPLATE_ID }])

    const updatedRow = { ...templateRow, hourlyRate: 15000, name: 'Friday Night Security Updated' }
    mocks.returningMock.mockResolvedValueOnce([updatedRow])

    const res = await app.inject({
      method: 'PATCH',
      url: `/employer/job-templates/${TEMPLATE_ID}`,
      headers: { authorization: `Bearer ${employerToken()}` },
      payload: { hourlyRate: 15000, name: 'Friday Night Security Updated' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.template.hourlyRate).toBe(15000)
    expect(mocks.updateMock).toHaveBeenCalledTimes(1)
  })
})
