"use client"

import { useState, useMemo, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

export interface PublicJob {
  id: string
  title: string
  category: string
  hourly_rate: number
  total_amount: number
  address: string
  start_at: string
  end_at: string
  headcount: number
  company_name: string
}

const CATEGORIES = [
  { value: "", label: "전체" },
  { value: "카페", label: "☕ 카페" },
  { value: "편의점", label: "🏪 편의점" },
  { value: "배달", label: "🛵 배달" },
  { value: "청소", label: "🧹 청소" },
  { value: "물류", label: "📦 물류" },
  { value: "요양", label: "❤️ 요양" },
  { value: "기타", label: "🔧 기타" },
]

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

function formatCity(address: string): string {
  const parts = address.split(" ")
  return parts.slice(0, 2).join(" ")
}

function JobCard({ job }: { job: PublicJob }) {
  return (
    <Link href={`/jobs/${job.id}`} className="block">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-blue-200 transition-all duration-200 cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
            {job.category}
          </span>
          <span className="text-xs text-gray-400">{formatDate(job.start_at)}</span>
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1 line-clamp-2">{job.title}</h3>
        <p className="text-sm text-gray-500 mb-3">{job.company_name}</p>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-lg font-bold text-blue-600">
              {job.hourly_rate.toLocaleString()}원
            </span>
            <span className="text-xs text-gray-400 ml-1">/시간</span>
          </div>
          <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-lg">
            📍 {formatCity(job.address)}
          </span>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          모집 {job.headcount}명
        </div>
      </div>
    </Link>
  )
}

interface JobBoardProps {
  initialJobs: PublicJob[]
}

export default function JobBoard({ initialJobs }: JobBoardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [category, setCategory] = useState(searchParams.get("category") ?? "")
  const [location, setLocation] = useState(searchParams.get("location") ?? "")
  const [minPay, setMinPay] = useState(Number(searchParams.get("min_pay") ?? 0))
  const [maxPay, setMaxPay] = useState(Number(searchParams.get("max_pay") ?? 50000))

  // Sync URL params whenever filters change
  useEffect(() => {
    const params = new URLSearchParams()
    if (category) params.set("category", category)
    if (location) params.set("location", location)
    if (minPay > 0) params.set("min_pay", String(minPay))
    if (maxPay < 50000) params.set("max_pay", String(maxPay))
    const qs = params.toString()
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false })
  }, [category, location, minPay, maxPay, router])

  const filtered = useMemo(() => {
    return initialJobs.filter((job) => {
      if (category && job.category !== category) return false
      if (location && !job.address.includes(location)) return false
      if (minPay > 0 && job.hourly_rate < minPay) return false
      if (maxPay < 50000 && job.hourly_rate > maxPay) return false
      return true
    })
  }, [initialJobs, category, location, minPay, maxPay])

  return (
    <div>
      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 space-y-4">
        {/* Category tabs */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">업종</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  category === cat.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Location search */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">지역</p>
          <input
            type="text"
            placeholder="예: 서울 강남구"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {/* Pay range slider */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            시급 범위:{" "}
            <span className="text-blue-600 font-semibold">
              {minPay.toLocaleString()}원 ~ {maxPay >= 50000 ? "제한없음" : `${maxPay.toLocaleString()}원`}
            </span>
          </p>
          <div className="flex gap-3 items-center">
            <input
              type="range"
              min={0}
              max={50000}
              step={1000}
              value={minPay}
              onChange={(e) => setMinPay(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <input
              type="range"
              min={0}
              max={50000}
              step={1000}
              value={maxPay}
              onChange={(e) => setMaxPay(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500 mb-4">
        <span className="font-semibold text-gray-800">{filtered.length}개</span>의 공고
      </p>

      {/* Job grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-base font-medium">조건에 맞는 공고가 없어요</p>
          <p className="text-sm mt-1">필터를 조정해보세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}
