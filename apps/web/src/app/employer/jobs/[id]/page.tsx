"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import api from "@/lib/api"

const APP_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  offered: { label: "수락 대기중", color: "bg-yellow-100 text-yellow-700" },
  accepted: { label: "확정", color: "bg-blue-100 text-blue-700" },
  completed: { label: "완료", color: "bg-green-100 text-green-700" },
  rejected: { label: "거절", color: "bg-gray-100 text-gray-500" },
  timeout: { label: "시간초과", color: "bg-gray-100 text-gray-500" },
  noshow: { label: "노쇼", color: "bg-red-100 text-red-700" },
}

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [job, setJob] = useState<any>(null)
  const [applications, setApplications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const justEscrowed = searchParams.get("escrowed") === "1"

  useEffect(() => {
    api.get(`/jobs/${params.id}`).then(({ data }) => {
      setJob(data.job)
      setApplications(data.applications ?? [])
    }).finally(() => setLoading(false))
  }, [params.id])

  const handleNoShow = async (appId: string) => {
    if (!confirm("노쇼 처리하시겠습니까? 해당 구직자의 임금이 몰수됩니다.")) return
    try {
      await api.post(`/applications/${appId}/noshow`)
      setApplications(apps => apps.map(a => a.id === appId ? { ...a, status: "noshow" } : a))
    } catch (err: any) {
      alert(err.response?.data?.error ?? "처리 실패")
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">불러오는 중...</div>
  if (!job) return <div className="text-center py-12 text-gray-500">공고를 찾을 수 없습니다</div>

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">←</button>
        <h1 className="font-bold text-lg flex-1 truncate">{job.title}</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        {justEscrowed && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm">
            ✅ 예치 완료! 구직자 매칭이 시작됩니다.
          </div>
        )}

        {/* Job info */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">{job.category}</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              job.status === "open" ? "bg-green-100 text-green-700" :
              job.status === "matched" ? "bg-blue-100 text-blue-700" :
              "bg-gray-100 text-gray-600"
            }`}>{job.status}</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              job.escrow_status === "escrowed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
            }`}>
              {job.escrow_status === "escrowed" ? "💰 예치완료" : "⏳ 미예치"}
            </span>
          </div>
          <div className="space-y-2 text-sm text-gray-600">
            <div>📍 {job.address}</div>
            <div>🕐 {new Date(job.start_at).toLocaleDateString("ko-KR")} {new Date(job.start_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} ~ {new Date(job.end_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</div>
            <div>💰 {Number(job.hourly_rate).toLocaleString()}원/시간</div>
            <div>👥 {job.matched_count ?? 0}/{job.headcount}명 매칭</div>
          </div>
          <div className="mt-3 pt-3 border-t text-sm text-gray-700 leading-relaxed">{job.description}</div>

          {/* Escrow CTA */}
          {job.escrow_status === "pending" && job.status !== "cancelled" && (
            <Link href={`/employer/jobs/${job.id}/escrow`}
              className="mt-3 block w-full text-center py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
              💳 임금 예치하기
            </Link>
          )}
        </div>

        {/* Applications */}
        <div className="card">
          <h3 className="font-bold text-gray-700 mb-3">매칭 현황 ({applications.filter(a => a.status === "accepted").length}명 확정)</h3>
          {applications.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">
              {job.escrow_status === "pending"
                ? "예치 완료 후 매칭이 시작됩니다"
                : "아직 매칭된 구직자가 없습니다"}
            </div>
          ) : (
            <div className="space-y-3">
              {applications.map((app: any) => {
                const statusInfo = APP_STATUS_LABELS[app.status] ?? { label: app.status, color: "bg-gray-100 text-gray-500" }
                return (
                  <div key={app.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <div className="font-medium text-sm">{app.worker_name}</div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span>⭐ {Number(app.worker_rating ?? 0).toFixed(1)}</span>
                        {(app.worker_categories ?? []).slice(0, 2).map((c: string) => (
                          <span key={c} className="bg-gray-100 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      {app.status === "accepted" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleNoShow(app.id)}
                            className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-2 py-0.5 rounded"
                          >
                            노쇼
                          </button>
                          <Link
                            href={`/employer/review/${job.id}?workerId=${app.worker_id}&workerName=${app.worker_name}`}
                            className="text-xs text-blue-500 border border-blue-200 px-2 py-0.5 rounded"
                          >
                            리뷰
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
