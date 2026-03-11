"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import api from "@/lib/api"
import { formatDistanceToNow } from "date-fns"
import { ko } from "date-fns/locale"

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  offered: { label: "수락 대기", color: "bg-yellow-100 text-yellow-700" },
  accepted: { label: "확정", color: "bg-blue-100 text-blue-700" },
  completed: { label: "완료", color: "bg-green-100 text-green-700" },
  rejected: { label: "거절", color: "bg-gray-100 text-gray-500" },
  timeout: { label: "시간초과", color: "bg-gray-100 text-gray-500" },
  noshow: { label: "노쇼", color: "bg-red-100 text-red-700" },
}

export default function WorkerJobsPage() {
  const [applications, setApplications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")

  useEffect(() => {
    api.get("/applications").then(({ data }) => {
      setApplications(data.applications)
    }).finally(() => setLoading(false))
  }, [])

  const filtered = filter === "all"
    ? applications
    : applications.filter(a => a.status === filter)

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10">
        <h1 className="font-bold text-xl">내 알바 목록</h1>
      </div>

      {/* Filter */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto">
        {[
          { key: "all", label: "전체" },
          { key: "accepted", label: "확정" },
          { key: "completed", label: "완료" },
          { key: "offered", label: "대기중" },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f.key ? "bg-blue-600 text-white" : "bg-white text-gray-600 border"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3 py-2">
        {loading ? (
          <div className="text-center py-12 text-gray-400">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-gray-500">알바 내역이 없습니다</div>
            <Link href="/worker/home" className="text-blue-600 text-sm mt-2 block">홈에서 매칭받기</Link>
          </div>
        ) : (
          filtered.map((app: any) => {
            const statusInfo = STATUS_LABELS[app.status] ?? { label: app.status, color: "bg-gray-100 text-gray-600" }
            return (
              <div key={app.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-gray-900">{app.job_title}</h3>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                </div>
                <div className="text-sm text-gray-500 space-y-1">
                  <div>📍 {app.address}</div>
                  <div>🕐 {new Date(app.start_at).toLocaleDateString("ko-KR")} {new Date(app.start_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</div>
                  <div>💰 {Number(app.hourly_rate).toLocaleString()}원/시간</div>
                </div>
                {app.status === "accepted" && (
                  <button
                    onClick={async () => {
                      await api.post(`/applications/${app.id}/complete`)
                      setApplications(apps => apps.map(a => a.id === app.id ? { ...a, status: "completed" } : a))
                    }}
                    className="mt-3 w-full py-2 bg-green-600 text-white rounded-xl text-sm font-semibold"
                  >
                    근무 완료 확인
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t flex">
        <Link href="/worker/home" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">🏠</span><span className="text-xs mt-0.5">홈</span>
        </Link>
        <Link href="/worker/jobs" className="flex-1 flex flex-col items-center py-3 text-blue-600">
          <span className="text-xl">📋</span><span className="text-xs mt-0.5">알바</span>
        </Link>
        <Link href="/worker/profile" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">👤</span><span className="text-xs mt-0.5">프로필</span>
        </Link>
      </nav>
    </div>
  )
}
