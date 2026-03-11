"use client"

import { useEffect, useState } from "react"
import type { JobOfferEvent } from "@albaconnect/shared"
import { OFFER_TIMEOUT_SECONDS } from "@albaconnect/shared"
import api from "@/lib/api"

interface Props {
  offer: JobOfferEvent
  onClose: () => void
}

export default function JobOfferModal({ offer, onClose }: Props) {
  const [timeLeft, setTimeLeft] = useState(OFFER_TIMEOUT_SECONDS)
  const [loading, setLoading] = useState(false)
  const [responded, setResponded] = useState(false)

  useEffect(() => {
    const expiresAt = new Date(offer.expiresAt).getTime()
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onClose()
      }
    }, 100)
    return () => clearInterval(interval)
  }, [offer.expiresAt, onClose])

  const handleAccept = async () => {
    setLoading(true)
    try {
      await api.post(`/applications/${offer.applicationId}/accept`)
      setResponded(true)
      setTimeout(onClose, 1500)
    } catch (err: any) {
      alert(err.response?.data?.error ?? "수락에 실패했습니다")
      onClose()
    }
    setLoading(false)
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      await api.post(`/applications/${offer.applicationId}/reject`)
    } catch {}
    onClose()
    setLoading(false)
  }

  const progress = (timeLeft / OFFER_TIMEOUT_SECONDS) * 100
  const isUrgent = timeLeft <= 5

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-t-3xl p-6 animate-slide-up">
        {responded ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">✅</div>
            <div className="text-xl font-bold text-green-600">수락 완료!</div>
            <div className="text-gray-500 mt-1">구인자에게 알림이 전송됩니다</div>
          </div>
        ) : (
          <>
            {/* Timer bar */}
            <div className="w-full h-2 bg-gray-200 rounded-full mb-5">
              <div
                className={`h-2 rounded-full transition-all ${isUrgent ? "bg-red-500" : "bg-blue-500"}`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-500">매칭 요청</span>
              <span className={`text-2xl font-bold tabular-nums ${isUrgent ? "text-red-500" : "text-blue-600"}`}>
                {timeLeft}초
              </span>
            </div>

            <div className="bg-blue-50 rounded-2xl p-4 mb-5">
              <h3 className="font-bold text-lg text-gray-900 mb-1">{offer.title}</h3>
              <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                <span className="bg-white px-2 py-0.5 rounded-full border">{offer.category}</span>
                <span>📍 {offer.address}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500">시급</div>
                  <div className="font-bold text-blue-600">{offer.hourlyRate.toLocaleString()}원</div>
                </div>
                <div className="bg-white rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500">근무 시간</div>
                  <div className="font-bold">{offer.durationHours}시간</div>
                </div>
                <div className="bg-white rounded-xl p-3 text-center col-span-2">
                  <div className="text-xs text-gray-500">예상 수입</div>
                  <div className="font-bold text-green-600">
                    {(offer.hourlyRate * offer.durationHours).toLocaleString()}원
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleReject}
                disabled={loading}
                className="py-4 rounded-2xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                거절
              </button>
              <button
                onClick={handleAccept}
                disabled={loading}
                className="py-4 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? "처리중..." : "수락 ✓"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
