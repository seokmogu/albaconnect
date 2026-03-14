import type { Metadata } from "next"
import JobBoard, { type PublicJob } from "./JobBoard"

export const revalidate = 60

export const metadata: Metadata = {
  title: "알바 구인구직 | AlbaConnect",
  description: "카페, 편의점, 배달, 청소 등 다양한 단기 알바를 찾아보세요. 시급 직접 확인, 즉시 지원 가능.",
  openGraph: {
    title: "알바 구인구직 | AlbaConnect",
    description: "카페, 편의점, 배달, 청소 등 다양한 단기 알바를 찾아보세요.",
    type: "website",
    url: "https://albaconnect.kr/jobs",
    images: [{ url: "/og-job.png", width: 1200, height: 630, alt: "AlbaConnect 구인게시판" }],
  },
}

async function getPublicJobs(): Promise<PublicJob[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
  try {
    const res = await fetch(`${apiUrl}/api/v2/jobs/public?limit=100`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.jobs ?? []
  } catch {
    return []
  }
}

export default async function JobsPage() {
  const jobs = await getPublicJobs()

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white px-6 py-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-3xl mb-2">⚡</div>
          <h1 className="text-2xl font-bold mb-1">오늘의 알바 공고</h1>
          <p className="text-blue-100 text-sm">
            {jobs.length > 0 ? `현재 ${jobs.length}개의 공고가 있어요` : "새 공고가 곧 등록돼요"}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <JobBoard initialJobs={jobs} />
      </div>
    </main>
  )
}
