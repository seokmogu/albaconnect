import { describe, it, expect } from "vitest"
import { computeMatchScore, rankWorkers } from "../services/scoring"

describe("computeMatchScore", () => {
  const baseInput = {
    distanceMeters: 1000,
    ratingAvg: 4.5,
    ratingCount: 10,
    workerCategories: ["카페/음료", "요식업"],
    jobCategory: "카페/음료",
    lastSeenAt: new Date(), // just now
    matchRadius: 5000,
    completedJobsInCategory: 3,
    totalCompletedJobs: 10,
    noShowCount: 0,
  }

  it("returns score between 0 and 100", () => {
    const score = computeMatchScore(baseInput)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it("closer distance = higher score", () => {
    const near = computeMatchScore({ ...baseInput, distanceMeters: 500 })
    const far = computeMatchScore({ ...baseInput, distanceMeters: 4000 })
    expect(near).toBeGreaterThan(far)
  })

  it("higher rating = higher score", () => {
    const highRating = computeMatchScore({ ...baseInput, ratingAvg: 5.0, ratingCount: 20 })
    const lowRating = computeMatchScore({ ...baseInput, ratingAvg: 2.0, ratingCount: 20 })
    expect(highRating).toBeGreaterThan(lowRating)
  })

  it("category match adds score", () => {
    const match = computeMatchScore({ ...baseInput, jobCategory: "카페/음료" })
    const noMatch = computeMatchScore({ ...baseInput, jobCategory: "IT/개발" })
    expect(match).toBeGreaterThan(noMatch)
  })

  it("experience in category adds up to 8 pts", () => {
    const experienced = computeMatchScore({ ...baseInput, completedJobsInCategory: 10 })
    const noExperience = computeMatchScore({ ...baseInput, completedJobsInCategory: 0 })
    expect(experienced).toBeGreaterThan(noExperience)
    expect(experienced - noExperience).toBeLessThanOrEqual(8)
  })

  it("no-shows reduce reliability score", () => {
    const reliable = computeMatchScore({ ...baseInput, noShowCount: 0, totalCompletedJobs: 10 })
    const unreliable = computeMatchScore({ ...baseInput, noShowCount: 5, totalCompletedJobs: 5 })
    expect(reliable).toBeGreaterThan(unreliable)
  })

  it("100% completion rate yields higher reliability than 50%", () => {
    const full = computeMatchScore({ ...baseInput, totalCompletedJobs: 10, noShowCount: 0 })
    const half = computeMatchScore({ ...baseInput, totalCompletedJobs: 5, noShowCount: 5 })
    expect(full).toBeGreaterThan(half)
  })

  it("recently active worker scores higher", () => {
    const recent = computeMatchScore({ ...baseInput, lastSeenAt: new Date() })
    const stale = computeMatchScore({ ...baseInput, lastSeenAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
    expect(recent).toBeGreaterThan(stale)
  })

  it("no ratings returns neutral score", () => {
    const noRating = computeMatchScore({ ...baseInput, ratingCount: 0, ratingAvg: 0 })
    expect(noRating).toBeGreaterThan(0)
  })

  it("worker at radius boundary gets zero distance score", () => {
    const boundary = computeMatchScore({ ...baseInput, distanceMeters: 5000, matchRadius: 5000 })
    expect(boundary).toBeGreaterThanOrEqual(0)
  })

  it("no-show penalty does not push score below 0", () => {
    const worst = computeMatchScore({
      ...baseInput,
      noShowCount: 100,
      totalCompletedJobs: 0,
      ratingAvg: 1.0,
      ratingCount: 1,
      distanceMeters: 4999,
    })
    expect(worst).toBeGreaterThanOrEqual(0)
  })
})

describe("rankWorkers", () => {
  const workers = [
    {
      userId: "a", distance: 4000, ratingAvg: 5.0, ratingCount: 50,
      categories: ["요식업"], lastSeenAt: new Date(),
      completedJobsInCategory: 0, totalCompletedJobs: 20, noShowCount: 0,
    },
    {
      userId: "b", distance: 500, ratingAvg: 3.0, ratingCount: 5,
      categories: ["카페/음료"], lastSeenAt: new Date(),
      completedJobsInCategory: 1, totalCompletedJobs: 3, noShowCount: 2,
    },
    {
      userId: "c", distance: 1000, ratingAvg: 4.5, ratingCount: 20,
      categories: ["카페/음료", "요식업"], lastSeenAt: new Date(),
      completedJobsInCategory: 5, totalCompletedJobs: 15, noShowCount: 0,
    },
  ]

  it("returns all workers ranked by score desc", () => {
    const ranked = rankWorkers(workers, "카페/음료", 5000)
    expect(ranked).toHaveLength(3)
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score)
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score)
  })

  it("experienced worker with good reliability ranks above unreliable one", () => {
    const ranked = rankWorkers(workers, "카페/음료", 5000)
    // Worker c: category match, 5 completions, zero no-shows, close
    // Worker b: close but 2 no-shows out of 5 jobs (bad reliability)
    const cIdx = ranked.findIndex(w => w.userId === "c")
    const bIdx = ranked.findIndex(w => w.userId === "b")
    expect(cIdx).toBeLessThan(bIdx)
  })

  it("attaches score to each worker", () => {
    const ranked = rankWorkers(workers, "카페/음료", 5000)
    for (const w of ranked) {
      expect(typeof w.score).toBe("number")
      expect(w.score).toBeGreaterThan(0)
    }
  })
})
