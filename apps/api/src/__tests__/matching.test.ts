import { describe, it, expect } from "vitest"
import { distanceKm } from "../services/matching.js"

describe("distanceKm (Haversine)", () => {
  it("returns ~0 for identical coordinates", () => {
    const dist = distanceKm(37.5665, 126.978, 37.5665, 126.978)
    expect(dist).toBe(0)
  })

  it("returns ~10.5 km from Seoul City Hall to Gangnam Station", () => {
    // Seoul City Hall: 37.5665, 126.9780
    // Gangnam Station: 37.4979, 127.0276
    const dist = distanceKm(37.5665, 126.978, 37.4979, 127.0276)
    expect(dist).toBeGreaterThan(8)
    expect(dist).toBeLessThan(12)
  })

  it("returns ~5 km from Hongdae to Sinchon", () => {
    // Hongdae: 37.5572, 126.9249
    // Sinchon: 37.5552, 126.9369
    const dist = distanceKm(37.5572, 126.9249, 37.5552, 126.9369)
    expect(dist).toBeGreaterThan(0.5)
    expect(dist).toBeLessThan(3)
  })

  it("returns correct direction symmetry (A to B == B to A)", () => {
    const d1 = distanceKm(37.5665, 126.978, 37.4979, 127.0276)
    const d2 = distanceKm(37.4979, 127.0276, 37.5665, 126.978)
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001)
  })

  it("returns positive distance for any non-identical points", () => {
    const dist = distanceKm(0, 0, 1, 1)
    expect(dist).toBeGreaterThan(0)
  })
})
