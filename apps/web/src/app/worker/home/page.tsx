"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuthStore } from "@/store/auth"
import api from "@/lib/api"
import { useJobOfferListener, sendLocationUpdate, useSocket } from "@/hooks/useSocket"
import JobOfferModal from "@/components/JobOfferModal"
import type { JobOfferEvent } from "@albaconnect/shared"

export default function WorkerHomePage() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [isAvailable, setIsAvailable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [currentOffer, setCurrentOffer] = useState<JobOfferEvent | null>(null)
  const [error, setError] = useState("")
  const socket = useSocket()

  useEffect(() => {
    if (!user) { router.push("/login"); return }
    if (user.role !== "worker") { router.push("/employer/dashboard"); return }

    // Fetch current availability status
    api.get("/workers/profile").then(({ data }) => {
      setIsAvailable(data.isAvailable)
    }).catch(() => {})
  }, [user, router])

  const handleOfferReceived = useCallback((offer: JobOfferEvent) => {
    setCurrentOffer(offer)
  }, [])

  const handleOfferCancelled = useCallback(({ jobId }: { jobId: string }) => {
    if (currentOffer?.jobId === jobId) setCurrentOffer(null)
  }, [currentOffer])

  useJobOfferListener(handleOfferReceived, handleOfferCancelled)

  const toggleAvailability = async () => {
    setLoading(true)
    setError("")

    if (!isAvailable) {
      // Request location first
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        )
        const { latitude: lat, longitude: lng } = pos.coords

        await api.put("/workers/availability", { isAvailable: true, lat, lng })
        setIsAvailable(true)

        // Start sending location updates
        const interval = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            (p) => sendLocationUpdate(p.coords.latitude, p.coords.longitude),
            () => {}
          )
        }, 30000) // every 30s

        // Store interval id to clear later (simplified - in production use a ref)
        ;(window as any).__locationInterval = interval
      } catch (err: any) {
        setError("위치 권한이 필요합니다. 브라우저 설정에서 허용해주세요.")
      }
    } else {
      await api.put("/workers/availability", { isAvailable: false })
      setIsAvailable(false)
      clearInterval((window as any).__locationInterval)
    }

    setLoading(false)
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div>
          <div className="text-sm text-gray-500">안녕하세요,</div>
          <div className="font-bold text-lg">{user.name}님 👋</div>
        </div>
        <button onClick={() => { logout(); router.push("/") }} className="text-gray-400 text-sm">로그아웃</button>
      </div>

      <div className="px-4 py-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {/* Availability Toggle */}
        <div className={`card p-6 text-center transition-all ${isAvailable ? "bg-blue-600 text-white" : "bg-white"}`}>
          <div className="text-5xl mb-3">{isAvailable ? "🟢" : "⚪"}</div>
          <div className="text-xl font-bold mb-1">
            {isAvailable ? "매칭 대기 중" : "오프라인"}
          </div>
          <div className={`text-sm mb-5 ${isAvailable ? "text-blue-100" : "text-gray-500"}`}>
            {isAvailable
              ? "주변 알바 요청을 받는 중입니다"
              : "ON을 누르면 주변 알바를 매칭받습니다"}
          </div>
          <button
            onClick={toggleAvailability}
            disabled={loading}
            className={`px-10 py-4 rounded-full text-lg font-bold transition-all ${
              isAvailable
                ? "bg-white text-blue-600 hover:bg-blue-50"
                : "bg-blue-600 text-white hover:bg-blue-700"
            } disabled:opacity-50`}
          >
            {loading ? "처리중..." : isAvailable ? "OFF" : "ON"}
          </button>
        </div>

        {/* Quick stats / Recent jobs */}
        <div className="card">
          <h3 className="font-bold text-gray-700 mb-3">빠른 이동</h3>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/worker/jobs"
              className="bg-gray-50 rounded-xl p-4 text-center hover:bg-gray-100 transition-colors">
              <div className="text-2xl mb-1">📋</div>
              <div className="text-sm font-medium">내 알바 목록</div>
            </Link>
            <Link href="/worker/profile"
              className="bg-gray-50 rounded-xl p-4 text-center hover:bg-gray-100 transition-colors">
              <div className="text-2xl mb-1">👤</div>
              <div className="text-sm font-medium">내 프로필</div>
            </Link>
          </div>
        </div>

        {/* How it works */}
        {!isAvailable && (
          <div className="card">
            <h3 className="font-bold text-gray-700 mb-3">이용 방법</h3>
            <div className="space-y-3">
              {[
                { n: "1", t: "ON 버튼을 누르세요", d: "위치 권한 허용 후 대기 상태가 됩니다" },
                { n: "2", t: "매칭 알림이 옵니다", d: "주변 구인 공고가 자동 매칭됩니다" },
                { n: "3", t: "15초 내 수락하세요", d: "미수락시 다음 구직자에게 넘어갑니다" },
                { n: "4", t: "일 완료 후 정산", d: "플랫폼이 임금을 안전하게 지급합니다" },
              ].map(step => (
                <div key={step.n} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 font-bold text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                    {step.n}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{step.t}</div>
                    <div className="text-xs text-gray-500">{step.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t flex">
        <Link href="/worker/home" className="flex-1 flex flex-col items-center py-3 text-blue-600">
          <span className="text-xl">🏠</span>
          <span className="text-xs mt-0.5">홈</span>
        </Link>
        <Link href="/worker/jobs" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">📋</span>
          <span className="text-xs mt-0.5">알바</span>
        </Link>
        <Link href="/worker/profile" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">👤</span>
          <span className="text-xs mt-0.5">프로필</span>
        </Link>
      </nav>

      {/* Job Offer Modal */}
      {currentOffer && (
        <JobOfferModal
          offer={currentOffer}
          onClose={() => setCurrentOffer(null)}
        />
      )}
    </div>
  )
}
