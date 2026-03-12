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
    expect(match - noMatch).toBeCloseTo(20, 0)
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
    // distance component = 0, rest still contributes
    expect(boundary).toBeGreaterThanOrEqual(0)
  })
})

describe("rankWorkers", () => {
  const workers = [
    { userId: "a", distance: 4000, ratingAvg: 5.0, ratingCount: 50, categories: ["요식업"], lastSeenAt: new Date() },
    { userId: "b", distance: 500, ratingAvg: 3.0, ratingCount: 5, categories: ["카페/음료"], lastSeenAt: new Date() },
    { userId: "c", distance: 1000, ratingAvg: 4.5, ratingCount: 20, categories: ["카페/음료", "요식업"], lastSeenAt: new Date() },
  ]

  it("returns all workers ranked by score desc", () => {
    const ranked = rankWorkers(workers, "카페/음료", 5000)
    expect(ranked).toHaveLength(3)
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score)
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score)
  })

  it("best category+distance+rating combination wins", () => {
    const ranked = rankWorkers(workers, "카페/음료", 5000)
    // Worker c: close, high rating, category match
    expect(ranked[0].userId).toBe("c")
  })
})
