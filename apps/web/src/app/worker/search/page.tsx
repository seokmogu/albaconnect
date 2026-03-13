"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import api from "@/lib/api"
import { JOB_CATEGORIES } from "@albaconnect/shared"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { JobCardSkeleton } from "@/components/Skeleton"
import KakaoMap from "@/components/KakaoMap"

interface Job {
  id: string
  title: string
  category: string
  start_at: string
  end_at: string
  hourly_rate: number
  total_amount: number
  headcount: number
  matched_count: number
  address: string
  lat: number
  lng: number
  status: string
  employer_name: string
  company_name: string
  distance?: number
}

export default function JobSearchPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [filters, setFilters] = useState({
    category: "",
    minPay: "",
    maxDistance: "5",
    date: "",
  })

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        status: "open",
        limit: "30",
      }
      if (userLocation) {
        params.lat = String(userLocation.lat)
        params.lng = String(userLocation.lng)
        params.radius_km = filters.maxDistance
      }
      if (filters.category) params.category = filters.category
      if (filters.minPay) params.min_hourly_rate = filters.minPay
      if (filters.date) params.start_date = filters.date

      const { data } = await api.get("/jobs", { params })
      const result: Job[] = data.jobs ?? []

      setJobs(result)
    } catch {
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [userLocation, filters])

  useEffect(() => {
    // Get location on mount
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => fetchJobs()
    )
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10">
        <h1 className="font-bold text-xl mb-3">알바 찾기</h1>

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setFilters(f => ({ ...f, category: "" }))}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border ${
                !filters.category ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"
              }`}
            >
              전체
            </button>
            {JOB_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setFilters(f => ({ ...f, category: f.category === cat ? "" : cat }))}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border ${
                  filters.category === cat ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="date"
              className="input-field text-sm flex-1"
              value={filters.date}
              onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
            />
            <select
              className="input-field text-sm flex-1"
              value={filters.maxDistance}
              onChange={e => setFilters(f => ({ ...f, maxDistance: e.target.value }))}
            >
              <option value="1">1km 이내</option>
              <option value="3">3km 이내</option>
              <option value="5">5km 이내</option>
              <option value="10">10km 이내</option>
            </select>
            <input
              type="number"
              placeholder="최소 시급"
              className="input-field text-sm flex-1"
              value={filters.minPay}
              onChange={e => setFilters(f => ({ ...f, minPay: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* Map view when location is available */}
      {userLocation && jobs.length > 0 && !loading && (
        <div className="px-4 mb-3">
          <KakaoMap
            lat={userLocation.lat}
            lng={userLocation.lng}
            zoom={13}
            markers={jobs.filter(j => j.lat && j.lng).map(j => ({
              lat: j.lat,
              lng: j.lng,
              title: j.title,
              category: j.category,
              hourlyRate: j.hourly_rate,
            }))}
            className="w-full h-52 rounded-2xl"
          />
          <div className="text-xs text-gray-400 text-center mt-1">지도에서 공고 위치를 확인하세요</div>
        </div>
      )}

      <div className="px-4 py-3">
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <JobCardSkeleton key={i} />)}</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔍</div>
            <div className="text-gray-500">조건에 맞는 공고가 없습니다</div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-gray-500">{jobs.length}개 공고</div>
            {jobs.map(job => {
              const durationMs = new Date(job.end_at).getTime() - new Date(job.start_at).getTime()
              const durationHours = durationMs / (1000 * 60 * 60)
              const earnings = Math.round(job.hourly_rate * durationHours)

              return (
                <div key={job.id} className="card">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          {job.category}
                        </span>
                        {job.distance && (
                          <span className="text-xs text-gray-400">
                            📍 {job.distance < 1000
                              ? `${Math.round(job.distance)}m`
                              : `${(job.distance / 1000).toFixed(1)}km`}
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-gray-900">{job.title}</h3>
                      <div className="text-sm text-gray-500">{job.company_name || job.employer_name}</div>
                    </div>
                    <div className="text-right ml-3">
                      <div className="font-bold text-blue-600">{job.hourly_rate.toLocaleString()}원</div>
                      <div className="text-xs text-gray-400">시급</div>
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 space-y-1 border-t pt-2 mt-2">
                    <div>🕐 {format(new Date(job.start_at), "M월 d일 (EEE) HH:mm", { locale: ko })} · {durationHours}시간</div>
                    <div>📍 {job.address}</div>
                    <div className="flex items-center justify-between">
                      <span>👥 {job.matched_count}/{job.headcount}명</span>
                      <span className="font-semibold text-green-600">예상 {earnings.toLocaleString()}원</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t flex">
        <Link href="/worker/home" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">🏠</span><span className="text-xs mt-0.5">홈</span>
        </Link>
        <Link href="/worker/search" className="flex-1 flex flex-col items-center py-3 text-blue-600">
          <span className="text-xl">🔍</span><span className="text-xs mt-0.5">찾기</span>
        </Link>
        <Link href="/worker/jobs" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">📋</span><span className="text-xs mt-0.5">알바</span>
        </Link>
        <Link href="/worker/profile" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">👤</span><span className="text-xs mt-0.5">프로필</span>
        </Link>
      </nav>
    </div>
  )
}
