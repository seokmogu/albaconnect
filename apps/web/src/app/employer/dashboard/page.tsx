"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/store/auth"
import api from "@/lib/api"
import { JobCardSkeleton } from "@/components/Skeleton"
import NotificationBell from "@/components/NotificationBell"

const STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  open: { label: "모집중", color: "bg-green-100 text-green-700", emoji: "🟢" },
  matched: { label: "매칭완료", color: "bg-blue-100 text-blue-700", emoji: "🔵" },
  in_progress: { label: "진행중", color: "bg-yellow-100 text-yellow-700", emoji: "🟡" },
  completed: { label: "완료", color: "bg-gray-100 text-gray-600", emoji: "✅" },
  cancelled: { label: "취소됨", color: "bg-red-100 text-red-600", emoji: "❌" },
}

export default function EmployerDashboard() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { router.push("/login"); return }
    if (user.role !== "employer") { router.push("/worker/home"); return }

    api.get("/jobs", { params: { status: "all", limit: 50 } }).then(({ data }) => {
      setJobs(data.jobs ?? [])
    }).finally(() => setLoading(false))
  }, [user, router])

  const handleCancel = async (jobId: string) => {
    if (!confirm("공고를 취소하시겠습니까? 확정된 구직자가 있을 경우 패널티가 발생할 수 있습니다.")) return
    try {
      const { data } = await api.put(`/jobs/${jobId}/cancel`)
      setJobs(jobs => jobs.map(j => j.id === jobId ? { ...j, status: "cancelled" } : j))
      if (data.penaltiesApplied > 0) {
        alert(`패널티 발생: ${data.totalPenalty.toLocaleString()}원이 구직자에게 지급됩니다.`)
      }
    } catch (err: any) {
      alert(err.response?.data?.error ?? "취소에 실패했습니다")
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10 flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-500">{user.name}님</div>
          <div className="font-bold text-xl">공고 관리</div>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button onClick={() => { logout(); router.push("/") }} className="text-gray-400 text-sm">로그아웃</button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "모집중", count: jobs.filter(j => j.status === "open").length, color: "text-green-600" },
            { label: "매칭완료", count: jobs.filter(j => j.status === "matched").length, color: "text-blue-600" },
            { label: "전체", count: jobs.length, color: "text-gray-700" },
          ].map(s => (
            <div key={s.label} className="card text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Jobs list */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <JobCardSkeleton key={i} />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-gray-500 mb-4">등록된 공고가 없습니다</div>
            <Link href="/employer/jobs/new" className="btn-primary inline-block w-auto px-6">
              첫 공고 등록하기
            </Link>
          </div>
        ) : (
          jobs.map(job => {
            const statusInfo = STATUS_LABELS[job.status] ?? { label: job.status, color: "bg-gray-100 text-gray-600", emoji: "⚪" }
            return (
              <div key={job.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 mb-1">{job.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                      {statusInfo.emoji} {statusInfo.label}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-gray-500 space-y-1 mt-2">
                  <div>📍 {job.address}</div>
                  <div>🕐 {new Date(job.start_at).toLocaleDateString("ko-KR")}</div>
                  <div>👥 {job.matched_count ?? 0}/{job.headcount}명 매칭</div>
                  <div>💰 {Number(job.hourly_rate).toLocaleString()}원/시간</div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Link href={`/employer/jobs/${job.id}`}
                    className="flex-1 text-center py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
                    상세보기
                  </Link>
                  {["open", "matched"].includes(job.status) && (
                    <button
                      onClick={() => handleCancel(job.id)}
                      className="flex-1 py-2 border border-red-200 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <Link
        href="/employer/jobs/new"
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-blue-700 transition-colors"
      >
        +
      </Link>
    </div>
  )
}
