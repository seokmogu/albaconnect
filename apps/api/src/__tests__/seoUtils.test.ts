import { describe, expect, it } from "vitest"

// ─── Inline copy of buildJobPosting for isolated API-layer testing ─────────────
// (mirrors apps/web/src/lib/seo.ts — avoids Next.js env dependency in API tests)

interface PublicJobDetail {
  id: string
  title: string
  category: string
  hourly_rate: number
  total_amount: number
  address: string
  start_at: string
  end_at: string
  headcount: number
  description: string
  company_name: string
}

function buildJobPosting(job: PublicJobDetail): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description,
    datePosted: job.start_at,
    validThrough: job.end_at,
    hiringOrganization: {
      "@type": "Organization",
      name: job.company_name,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        streetAddress: job.address,
        addressCountry: "KR",
      },
    },
    baseSalary: {
      "@type": "MonetaryAmount",
      currency: "KRW",
      value: {
        "@type": "QuantitativeValue",
        value: job.hourly_rate,
        unitText: "HOUR",
      },
    },
    employmentType: "PART_TIME",
    occupationalCategory: job.category,
    totalJobOpenings: job.headcount,
  }
}

// ─── Sitemap pagination logic (mirrors apps/web/src/app/sitemap.ts) ────────────
async function paginateSitemapJobs(
  fetchPage: (page: number) => Promise<Array<{ id: string; start_at: string }>>
): Promise<Array<{ id: string; start_at: string }>> {
  const MAX_PAGES = 50
  const allJobs: Array<{ id: string; start_at: string }> = []
  let page = 1
  while (page <= MAX_PAGES) {
    const jobs = await fetchPage(page)
    if (jobs.length === 0) break
    allJobs.push(...jobs)
    if (jobs.length < 100) break
    page++
  }
  return allJobs
}

// ─── Tests ─────────────────────────────────────────────────────────────────────
const SAMPLE_JOB: PublicJobDetail = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  title: "카페 아르바이트",
  category: "카페",
  hourly_rate: 12000,
  total_amount: 96000,
  address: "서울 강남구 테헤란로 123",
  start_at: "2026-04-01T09:00:00Z",
  end_at: "2026-04-01T17:00:00Z",
  headcount: 2,
  description: "카페 홀서빙 및 음료 제조 담당",
  company_name: "스타벅스 강남점",
}

describe("buildJobPosting", () => {
  it("returns correct schema.org/JobPosting fields", () => {
    const ld = buildJobPosting(SAMPLE_JOB)

    expect(ld["@context"]).toBe("https://schema.org")
    expect(ld["@type"]).toBe("JobPosting")
    expect(ld.title).toBe(SAMPLE_JOB.title)
    expect(ld.description).toBe(SAMPLE_JOB.description)
    expect(ld.datePosted).toBe(SAMPLE_JOB.start_at)
    expect(ld.validThrough).toBe(SAMPLE_JOB.end_at)
    expect(ld.employmentType).toBe("PART_TIME")
    expect(ld.occupationalCategory).toBe(SAMPLE_JOB.category)
    expect(ld.totalJobOpenings).toBe(SAMPLE_JOB.headcount)
  })

  it("sets hiringOrganization.name = company_name", () => {
    const ld = buildJobPosting(SAMPLE_JOB)
    const org = ld.hiringOrganization as Record<string, unknown>
    expect(org["@type"]).toBe("Organization")
    expect(org.name).toBe(SAMPLE_JOB.company_name)
  })

  it("sets correct baseSalary with KRW HOUR unit", () => {
    const ld = buildJobPosting(SAMPLE_JOB)
    const salary = ld.baseSalary as Record<string, unknown>
    expect(salary.currency).toBe("KRW")
    const val = salary.value as Record<string, unknown>
    expect(val.value).toBe(SAMPLE_JOB.hourly_rate)
    expect(val.unitText).toBe("HOUR")
  })

  it("has no null or undefined required fields", () => {
    const ld = buildJobPosting(SAMPLE_JOB)
    const requiredKeys = [
      "title",
      "description",
      "datePosted",
      "validThrough",
      "hiringOrganization",
      "jobLocation",
      "baseSalary",
    ]
    for (const key of requiredKeys) {
      expect(ld[key]).not.toBeNull()
      expect(ld[key]).not.toBeUndefined()
    }
  })
})

describe("sitemap pagination", () => {
  it("returns all jobs when paginating: 100 on page 1, 50 on page 2, 0 on page 3", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      id: `job-page1-${i}`,
      start_at: "2026-04-01T09:00:00Z",
    }))
    const page2 = Array.from({ length: 50 }, (_, i) => ({
      id: `job-page2-${i}`,
      start_at: "2026-04-02T09:00:00Z",
    }))

    const fetchPage = async (page: number) => {
      if (page === 1) return page1
      if (page === 2) return page2
      return []
    }

    const allJobs = await paginateSitemapJobs(fetchPage)
    expect(allJobs).toHaveLength(150)
    expect(allJobs[0].id).toBe("job-page1-0")
    expect(allJobs[100].id).toBe("job-page2-0")
  })

  it("stops at MAX_PAGES to prevent infinite loop", async () => {
    let calls = 0
    // Always returns 100 items — would be infinite without MAX_PAGES cap
    const fetchPage = async (_page: number) => {
      calls++
      return Array.from({ length: 100 }, (_, i) => ({
        id: `job-${calls}-${i}`,
        start_at: "2026-04-01T09:00:00Z",
      }))
    }

    const allJobs = await paginateSitemapJobs(fetchPage)
    expect(calls).toBe(50) // MAX_PAGES cap
    expect(allJobs).toHaveLength(5000)
  })
})
