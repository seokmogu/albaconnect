/**
 * SEO utilities for public job pages
 * Pure functions — safe to import in server and test environments
 */

export interface PublicJobDetail {
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

/**
 * Build a schema.org/JobPosting structured data object for Google Jobs indexing.
 * All required fields are included; returns a complete JSON-LD object.
 */
export function buildJobPosting(job: PublicJobDetail): Record<string, unknown> {
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
