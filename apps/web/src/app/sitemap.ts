import type { MetadataRoute } from "next"

const SITE_URL = "https://albaconnect.kr"
const MAX_PAGES = 50

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/jobs`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ]

  // Paginate through all public jobs
  const allJobs: Array<{ id: string; start_at: string }> = []
  let page = 1

  while (page <= MAX_PAGES) {
    try {
      const res = await fetch(`${apiUrl}/api/v2/jobs/public?page=${page}&limit=100`, {
        next: { revalidate: 3600 },
      })
      if (!res.ok) break
      const data = await res.json()
      const jobs: Array<{ id: string; start_at: string }> = data.jobs ?? []
      if (jobs.length === 0) break
      allJobs.push(...jobs)
      if (jobs.length < 100) break
      page++
    } catch {
      break
    }
  }

  const jobRoutes: MetadataRoute.Sitemap = allJobs.map((job) => ({
    url: `${SITE_URL}/jobs/${job.id}`,
    lastModified: new Date(job.start_at),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }))

  return [...staticRoutes, ...jobRoutes]
}
