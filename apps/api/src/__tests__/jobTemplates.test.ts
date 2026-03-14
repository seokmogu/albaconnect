import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../index'

const mocks = vi.hoisted(() => {
  const executeMock = vi.fn()

  // Drizzle ORM chain: select().from().where().limit()
  const limitMock = vi.fn()
  const whereMock = vi.fn(() => ({ limit: limitMock }))
  const fromMock = vi.fn(() => ({ where: whereMock }))
  const selectMock = vi.fn(() => ({ from: fromMock }))

  const returningMock = vi.fn()
  const valuesMock = vi.fn(() => ({ returning: returningMock }))
  const insertMock = vi.fn(() => ({ values: valuesMock }))

  const updateWhereReturningMock = vi.fn()
  const updateWhereMock = vi.fn(() => ({ returning: updateWhereReturningMock }))
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }))
  const updateMock = vi.fn(() => ({ set: updateSetMock }))

  const deleteWhereMock = vi.fn().mockResolvedValue(undefined)
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }))

  return {
    executeMock,
    selectMock, fromMock, whereMock, limitMock,
    insertMock, valuesMock, returningMock,
    updateMock, updateSetMock, updateWhereMock, updateWhereReturningMock,
    deleteMock, deleteWhereMock,
  }
})

vi.mock('../db', () => ({
  db: {
    execute: mocks.executeMock,
    select: mocks.selectMock,
    insert: mocks.insertMock,
    update: mocks.updateMock,
    delete: mocks.deleteMock,
  },
  jobTemplates: {
    id: 'id',
    employerId: 'employer_id',
    name: 'name',
    description: 'description',
    category: 'category',
    hourlyRate: 'hourly_rate',
    requiredSkills: 'required_skills',
    durationHours: 'duration_hours',
    headcount: 'headcount',
  },
  jobPostings: {
    id: 'id',
    employerId: 'employer_id',
    templateId: 'template_id',
  },
  users: {},
  employerProfiles: {},
  workerProfiles: {},
  jobApplications: {},
  penalties: {},
}))

vi.mock('../services/matching', () => ({
  dispatchJob: vi.fn(),
  distanceKm: vi.fn(),
  workerSockets: new Map(),
  setSocketServer: vi.fn(),
  handleAcceptOffer: vi.fn(),
  handleRejectOffer: vi.fn(),
}))

describe('job template routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.limitMock.mockReset()
    mocks.whereMock.mockReturnValue({ limit: mocks.limitMock })
    mocks.fromMock.mockReturnValue({ where: mocks.whereMock })
    mocks.selectMock.mockReturnValue({ from: mocks.fromMock })
    mocks.returningMock.mockReset()
    mocks.valuesMock.mockReturnValue({ returning: mocks.returningMock })
    mocks.insertMock.mockReturnValue({ values: mocks.valuesMock })
    mocks.deleteWhereMock.mockResolvedValue(undefined)
    mocks.deleteMock.mockReturnValue({ where: mocks.deleteWhereMock })
  })

  it('POST /employer/job-templates creates a template', async () => {
    // execute() is called for the count check
    mocks.executeMock.mockResolvedValueOnce({ rows: [{ count: '0' }] })

    const newTemplate = {
      id: 'tmpl-1',
      employerId: 'employer-1',
      name: 'Kitchen Helper',
      description: 'Help in kitchen',
      category: 'food',
      hourlyRate: 10000,
      requiredSkills: ['cleaning'],
      durationHours: 4,
      headcount: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mocks.returningMock.mockResolvedValueOnce([newTemplate])

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-1', email: 'boss@test.com', role: 'employer' })

    const response = await app.inject({
      method: 'POST',
      url: '/employer/job-templates',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Kitchen Helper',
        description: 'Help in kitchen',
        category: 'food',
        hourlyRate: 10000,
        requiredSkills: ['cleaning'],
        durationHours: 4,
        headcount: 2,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().template.id).toBe('tmpl-1')
    await app.close()
  })

  it('GET /employer/job-templates lists templates', async () => {
    const templates = [
      { id: 'tmpl-1', name: 'Kitchen Helper', employerId: 'employer-1' },
      { id: 'tmpl-2', name: 'Counter Staff', employerId: 'employer-1' },
    ]
    // select().from().where() - where() resolves to array
    mocks.whereMock.mockResolvedValueOnce(templates)

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-1', email: 'boss@test.com', role: 'employer' })

    const response = await app.inject({
      method: 'GET',
      url: '/employer/job-templates',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().templates).toHaveLength(2)
    await app.close()
  })

  it('POST /employer/job-templates/:id/create-job creates job from template', async () => {
    const template = {
      id: 'tmpl-1',
      employerId: 'employer-1',
      name: 'Kitchen Helper',
      description: 'Help in kitchen',
      category: 'food',
      hourlyRate: 10000,
      requiredSkills: ['cleaning'],
      durationHours: 4,
      headcount: 2,
    }

    // Template lookup: select().from().where().limit() -> returns [template]
    mocks.limitMock.mockResolvedValueOnce([template])

    const newJob = {
      id: 'job-1',
      templateId: 'tmpl-1',
      title: 'Kitchen Helper',
      category: 'food',
    }
    mocks.returningMock.mockResolvedValueOnce([newJob])

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-1', email: 'boss@test.com', role: 'employer' })

    const response = await app.inject({
      method: 'POST',
      url: '/employer/job-templates/tmpl-1/create-job',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        startAt: '2026-04-01T09:00:00.000Z',
        lat: 37.5665,
        lng: 126.978,
        address: 'Seoul',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().job.templateId).toBe('tmpl-1')
    await app.close()
  })

  it('POST /employer/job-templates/:id/create-job returns 403 when template belongs to another employer', async () => {
    // Template not found for employer-2 (empty result)
    mocks.limitMock.mockResolvedValueOnce([])

    const app = await buildApp()
    const token = app.jwt.sign({ id: 'employer-2', email: 'other@test.com', role: 'employer' })

    const response = await app.inject({
      method: 'POST',
      url: '/employer/job-templates/tmpl-1/create-job',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        startAt: '2026-04-01T09:00:00.000Z',
        lat: 37.5665,
        lng: 126.978,
        address: 'Seoul',
      },
    })

    expect(response.statusCode).toBe(403)
    await app.close()
  })
})
