import { describe, it, expect, vi, beforeEach } from "vitest"
import { mockQuery } from "./setup"
import { computeMatchScore } from "../services/scoring"

describe("Admin routes", () => {
  beforeEach(() => {
    mockQuery.mockClear()
  })

  it("score calculation is deterministic", () => {
    const input = {
      distanceMeters: 1000,
      ratingAvg: 4.0,
      ratingCount: 5,
      workerCategories: ["요식업"],
      jobCategory: "요식업",
      lastSeenAt: new Date(Date.now() - 1000),
      matchRadius: 5000,
      completedJobsInCategory: 3,
      totalCompletedJobs: 8,
      noShowCount: 0,
    }

    const score1 = computeMatchScore(input)
    const score2 = computeMatchScore(input)
    expect(score1).toBe(score2)
    expect(score1).toBeGreaterThan(50) // category match + close distance + decent rating
  })

  it("no-show worker gets lower priority in re-dispatch (regression guard)", () => {
    const goodWorker = {
      distanceMeters: 500,
      ratingAvg: 4.8,
      ratingCount: 30,
      workerCategories: ["카페/음료"],
      jobCategory: "카페/음료",
      lastSeenAt: new Date(),
      matchRadius: 5000,
      completedJobsInCategory: 5,
      totalCompletedJobs: 20,
      noShowCount: 0,
    }

    const badWorker = {
      ...goodWorker,
      ratingAvg: 1.5,
      ratingCount: 3,
      completedJobsInCategory: 0,
      totalCompletedJobs: 3,
      noShowCount: 4,
    }

    expect(computeMatchScore(goodWorker)).toBeGreaterThan(computeMatchScore(badWorker))
  })
})
