"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import api from "@/lib/api"
import { PLATFORM_FEE_RATE } from "@albaconnect/shared"

export default function EscrowPage() {
  const { id: jobId } = useParams()
  const router = useRouter()
  const [job, setJob] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    api.get(`/jobs/${jobId}`).then(({ data }) => setJob(data.job)).finally(() => setLoading(false))
  }, [jobId])

  const handlePay = async () => {
    setPaying(true)
    try {
      // In production: open Toss Payments widget here
      // For MVP: direct stub escrow
      await api.post("/payments/escrow", { jobId })
      router.push(`/employer/jobs/${jobId}?escrowed=1`)
    } catch (err: any) {
      alert(err.response?.data?.error ?? "결제에 실패했습니다")
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">불러오는 중...</div>
  if (!job) return <div className="text-center py-12 text-gray-500">공고를 찾을 수 없습니다</div>

  const platformFee = Math.round(job.total_amount * PLATFORM_FEE_RATE)
  const total = job.total_amount + platformFee

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <button onClick={() => router.back()} className="text-gray-500 mb-6">← 뒤로</button>
      <h1 className="text-2xl font-bold mb-6">임금 예치</h1>

      <div className="card mb-4">
        <h3 className="font-bold text-gray-900 mb-3">{job.title}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>근무 임금</span>
            <span>{Number(job.total_amount).toLocaleString()}원</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>플랫폼 수수료 (10%)</span>
            <span>{platformFee.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 border-t pt-2 text-base">
            <span>총 결제금액</span>
            <span>{total.toLocaleString()}원</span>
          </div>
        </div>
      </div>

      <div className="card mb-6 bg-blue-50 border border-blue-100">
        <div className="text-sm text-blue-700 space-y-1">
          <div className="font-semibold mb-2">💡 예치금 보호 정책</div>
          <div>• 예치금은 플랫폼이 안전하게 보관합니다</div>
          <div>• 근무 완료 확인 후 구직자에게 지급됩니다</div>
          <div>• 구직자 노쇼 시 전액 반환됩니다</div>
          <div>• 취소 시 정책에 따라 환불됩니다</div>
        </div>
      </div>

      {job.escrow_status === "escrowed" ? (
        <div className="card text-center py-6 bg-green-50">
          <div className="text-3xl mb-2">✅</div>
          <div className="font-bold text-green-600">이미 예치 완료된 공고입니다</div>
        </div>
      ) : (
        <button onClick={handlePay} disabled={paying} className="btn-primary text-lg py-4">
          {paying ? "처리 중..." : `${total.toLocaleString()}원 결제하기`}
        </button>
      )}

      <p className="text-xs text-gray-400 text-center mt-3">
        토스페이먼츠로 안전하게 결제됩니다
      </p>
    </div>
  )
}
