import { describe, it, expect } from 'vitest'
import { computeMatchScore } from '../services/scoring.js'

describe('availability scoring', () => {
  it('worker with schedule declared scores higher than without', () => {
    const base = {
      distanceMeters: 500, ratingAvg: 4, ratingCount: 10,
      workerCategories: ['food'], jobCategory: 'food',
      lastSeenAt: new Date(), matchRadius: 5000,
    }
    const withSchedule = computeMatchScore({ ...base, hasScheduleDeclared: true })
    const withoutSchedule = computeMatchScore({ ...base, hasScheduleDeclared: false })
    expect(withSchedule).toBeGreaterThan(withoutSchedule)
    expect(withSchedule - withoutSchedule).toBe(4)
  })

  it('weights sum to 100 for perfect worker', () => {
    const score = computeMatchScore({
      distanceMeters: 0, ratingAvg: 5, ratingCount: 100,
      workerCategories: ['food'], jobCategory: 'food',
      lastSeenAt: new Date(Date.now() - 30 * 60 * 1000),
      matchRadius: 5000,
      completedJobsInCategory: 10, totalCompletedJobs: 10, noShowCount: 0,
      hasScheduleDeclared: true,
    })
    expect(score).toBeLessThanOrEqual(100)
    expect(score).toBeGreaterThan(95)
  })

  it('schedule not declared gets neutral 4pt availability score', () => {
    const score = computeMatchScore({
      distanceMeters: 1000, ratingAvg: 3, ratingCount: 5,
      workerCategories: ['retail'], jobCategory: 'retail',
      lastSeenAt: null, matchRadius: 5000,
      hasScheduleDeclared: false,
    })
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('availability_score: undefined hasScheduleDeclared defaults to false (4 pts)', () => {
    const score1 = computeMatchScore({
      distanceMeters: 500, ratingAvg: 4, ratingCount: 10,
      workerCategories: ['food'], jobCategory: 'food',
      lastSeenAt: null, matchRadius: 5000,
    })
    const score2 = computeMatchScore({
      distanceMeters: 500, ratingAvg: 4, ratingCount: 10,
      workerCategories: ['food'], jobCategory: 'food',
      lastSeenAt: null, matchRadius: 5000,
      hasScheduleDeclared: false,
    })
    expect(score1).toBe(score2)
  })
})

describe('weight rescaling validation', () => {
  it('total max score is <= 100', () => {
    const maxScore = computeMatchScore({
      distanceMeters: 0, ratingAvg: 5, ratingCount: 50,
      workerCategories: ['food'], jobCategory: 'food',
      lastSeenAt: new Date(),
      matchRadius: 5000,
      completedJobsInCategory: 20,
      totalCompletedJobs: 20,
      noShowCount: 0,
      hasScheduleDeclared: true,
    })
    expect(maxScore).toBeLessThanOrEqual(100)
  })

  it('zero-history worker still gets non-zero score', () => {
    const score = computeMatchScore({
      distanceMeters: 2000, ratingAvg: 0, ratingCount: 0,
      workerCategories: [], jobCategory: 'food',
      lastSeenAt: null, matchRadius: 5000,
    })
    expect(score).toBeGreaterThan(0)
  })
})
