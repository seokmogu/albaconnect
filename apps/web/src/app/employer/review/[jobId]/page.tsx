"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import api from "@/lib/api"

export default function EmployerWriteReviewPage() {
  const { jobId } = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const workerId = searchParams.get("workerId") ?? ""
  const workerName = searchParams.get("workerName") ?? "구직자"
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    if (rating === 0 || !workerId) return
    setLoading(true)
    try {
      await api.post("/reviews", { jobId, revieweeId: workerId, rating, comment })
      setSubmitted(true)
      setTimeout(() => router.back(), 1500)
    } catch (err: any) {
      alert(err.response?.data?.error ?? "리뷰 등록 실패")
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4">
        <div className="text-5xl">⭐</div>
        <div className="text-xl font-bold text-green-600">리뷰 등록 완료!</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <button onClick={() => router.back()} className="text-gray-500 mb-6">← 뒤로</button>
      <h1 className="text-2xl font-bold mb-2">리뷰 작성</h1>
      <p className="text-gray-500 mb-8">{workerName}님에 대한 리뷰를 남겨주세요</p>

      <div className="card space-y-6">
        <div className="text-center">
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s} type="button"
                onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)}
                onClick={() => setRating(s)}
                className={`text-4xl transition-transform ${(hovered || rating) >= s ? "text-yellow-400 scale-110" : "text-gray-200"}`}
              >★</button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              {["", "별로였어요", "아쉬웠어요", "괜찮았어요", "좋았어요", "최고였어요"][rating]}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">후기 (선택)</label>
          <textarea
            className="input-field h-28 resize-none"
            value={comment} onChange={e => setComment(e.target.value)}
            placeholder="구직자분과의 경험을 공유해주세요"
            maxLength={500}
          />
        </div>
        <button onClick={handleSubmit} disabled={loading || rating === 0} className="btn-primary">
          {loading ? "등록 중..." : "리뷰 등록"}
        </button>
      </div>
    </div>
  )
}
