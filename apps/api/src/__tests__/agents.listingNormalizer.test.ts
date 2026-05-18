/**
 * Unit tests for ListingNormalizer schema and PII strip.
 *
 * Does NOT call Anthropic (requires API key + network).
 * Integration test with real LLM call is in apps/api/src/__tests__/integration/
 * and gated by env var INTEGRATION_LLM=1.
 *
 * SPEC: .agency/research/spec-agent-001-listing-normalizer.md §9
 */

import { describe, it, expect } from "vitest"
import {
  ListingDraftSchema,
  NormalizerOutputSchema,
} from "../agents/listingNormalizer"

describe("ListingDraftSchema", () => {
  const valid = {
    title: "강남역 카페 음료 제조 3명",
    category: "cafe" as const,
    startAt: "2026-05-14T18:00:00+09:00",
    endAt: "2026-05-14T22:00:00+09:00",
    hourlyRate: 14000,
    headcount: 3,
    lat: 37.4979,
    lng: 127.0276,
    address: "강남역 5번 출구 근처",
    description: "음료 제조, 손님 응대 가능자",
    tags: ["바리스타", "음료제조", "초보가능"],
  }

  it("accepts a fully valid draft", () => {
    const result = ListingDraftSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it("rejects category outside the 8-enum set", () => {
    const result = ListingDraftSchema.safeParse({ ...valid, category: "something_else" })
    expect(result.success).toBe(false)
  })

  it("rejects sub-minimum-wage hourly rate (schema floor 1000)", () => {
    const result = ListingDraftSchema.safeParse({ ...valid, hourlyRate: 500 })
    expect(result.success).toBe(false)
  })

  it("rejects absurd hourly rate (schema ceiling 100000)", () => {
    const result = ListingDraftSchema.safeParse({ ...valid, hourlyRate: 1_000_000 })
    expect(result.success).toBe(false)
  })

  it("rejects headcount over 50", () => {
    const result = ListingDraftSchema.safeParse({ ...valid, headcount: 100 })
    expect(result.success).toBe(false)
  })

  it("accepts null lat/lng (geocoding deferred)", () => {
    const result = ListingDraftSchema.safeParse({ ...valid, lat: null, lng: null })
    expect(result.success).toBe(true)
  })

  it("rejects lat outside Korea bounding box", () => {
    const result = ListingDraftSchema.safeParse({ ...valid, lat: 50.0, lng: 127.0 })
    expect(result.success).toBe(false)
  })

  it("rejects lng outside Korea bounding box", () => {
    const result = ListingDraftSchema.safeParse({ ...valid, lat: 37.5, lng: 100.0 })
    expect(result.success).toBe(false)
  })

  it("rejects too many tags", () => {
    const result = ListingDraftSchema.safeParse({
      ...valid,
      tags: Array.from({ length: 10 }, (_, i) => `tag${i}`),
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid ISO8601 startAt without offset", () => {
    const result = ListingDraftSchema.safeParse({ ...valid, startAt: "2026-05-14T18:00:00" })
    expect(result.success).toBe(false)
  })
})

describe("NormalizerOutputSchema", () => {
  const draft = {
    title: "테스트 공고",
    category: "other" as const,
    startAt: "2026-05-14T18:00:00+09:00",
    endAt: "2026-05-14T22:00:00+09:00",
    hourlyRate: 12000,
    headcount: 1,
    lat: null,
    lng: null,
    address: "강남",
    description: "테스트",
    tags: [],
  }

  it("accepts confidence in [0,1]", () => {
    expect(
      NormalizerOutputSchema.safeParse({
        draft,
        warnings: [],
        confidence: 0.85,
        needsHumanReview: false,
      }).success,
    ).toBe(true)
  })

  it("rejects confidence > 1", () => {
    expect(
      NormalizerOutputSchema.safeParse({
        draft,
        warnings: [],
        confidence: 1.2,
        needsHumanReview: false,
      }).success,
    ).toBe(false)
  })

  it("requires warnings array (can be empty)", () => {
    expect(
      NormalizerOutputSchema.safeParse({
        draft,
        warnings: [{ field: "hourlyRate", message: "최저임금 미만입니다" }],
        confidence: 0.5,
        needsHumanReview: true,
      }).success,
    ).toBe(true)
  })
})
