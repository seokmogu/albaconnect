import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { buildJobPosting, type PublicJobDetail } from "@/lib/seo"

export const dynamic = "force-dynamic"

async function getJob(id: string): Promise<PublicJobDetail | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
  // UUID validation
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    return null
  }
  try {
    const res = await fetch(`${apiUrl}/api/v2/jobs/public/${id}`, { cache: "no-store" })
    if (!res.ok) return null
    const data = await res.json()
    return data.job ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const job = await getJob(id)
  if (!job) {
    return { title: "공고를 찾을 수 없습니다 | AlbaConnect" }
  }
  const description = `${job.category} · ${job.hourly_rate.toLocaleString()}원/시간 · ${job.address.split(" ").slice(0, 2).join(" ")}`
  return {
    title: `${job.title} | AlbaConnect`,
    description,
    openGraph: {
      title: `${job.title} | AlbaConnect`,
      description,
      type: "website",
      url: `https://albaconnect.kr/jobs/${job.id}`,
      images: [{ url: "/og-job.png", width: 1200, height: 630, alt: job.title }],
    },
  }
}


function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const job = await getJob(id)
  if (!job) notFound()

  const jsonLd = buildJobPosting(job)
  const durationHours =
    (new Date(job.end_at).getTime() - new Date(job.start_at).getTime()) / (1000 * 60 * 60)
  const redirectUrl = encodeURIComponent(`/jobs/${job.id}`)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white px-6 py-8">
          <div className="max-w-2xl mx-auto">
            <Link href="/jobs" className="text-blue-200 text-sm mb-4 block hover:text-white">
              ← 구인게시판으로
            </Link>
            <span className="text-xs font-semibold bg-white/20 px-2.5 py-1 rounded-full">
              {job.category}
            </span>
            <h1 className="text-xl font-bold mt-3 mb-1">{job.title}</h1>
            <p className="text-blue-100 text-sm">{job.company_name}</p>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {/* Pay & date card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-2xl font-bold text-blue-600">
                  {job.hourly_rate.toLocaleString()}원
                </span>
                <span className="text-sm text-gray-400 ml-1">/시간</span>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">총 예상 수입</p>
                <p className="text-base font-semibold text-gray-800">
                  {job.total_amount.toLocaleString()}원
                </p>
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex gap-2">
                <span className="text-gray-400 w-16 shrink-0">📅 일정</span>
                <span>
                  {formatDate(job.start_at)} ~ {formatDate(job.end_at)}
                  <span className="text-gray-400 ml-1">({durationHours}시간)</span>
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400 w-16 shrink-0">📍 위치</span>
                <span>{job.address}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400 w-16 shrink-0">👥 모집</span>
                <span>{job.headcount}명</span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">공고 상세</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
              {job.description}
            </p>
          </div>

          {/* Employer */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">고용주 정보</h2>
            <p className="text-sm text-gray-800 font-medium">{job.company_name}</p>
          </div>

          {/* Apply CTA */}
          <div className="pt-2 pb-8">
            <Link
              href={`/login?redirect=${redirectUrl}`}
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl transition-colors text-base shadow-md"
            >
              지원하기 →
            </Link>
            <p className="text-center text-xs text-gray-400 mt-2">
              로그인 후 바로 지원됩니다
            </p>
          </div>
        </div>
      </main>
    </>
  )
}
