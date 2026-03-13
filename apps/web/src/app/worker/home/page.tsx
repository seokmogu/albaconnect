"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuthStore } from "@/store/auth"
import api from "@/lib/api"
import { useJobOfferListener, sendLocationUpdate, useSocket } from "@/hooks/useSocket"
import JobOfferModal from "@/components/JobOfferModal"
import NotificationBell from "@/components/NotificationBell"
import KakaoMap from "@/components/KakaoMap"
import type { JobOfferEvent } from "@albaconnect/shared"
import { format } from "date-fns"
import { ko } from "date-fns/locale"

interface RecommendedJob {
  id: string
  title: string
  category: string
  start_at: string
  end_at: string
  hourly_rate: number
  address: string
  employer_name: string
  company_name: string
  distance: number | null
  score: number
}

export default function WorkerHomePage() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [isAvailable, setIsAvailable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [currentOffer, setCurrentOffer] = useState<JobOfferEvent | null>(null)
  const [error, setError] = useState("")
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [recommendedJobs, setRecommendedJobs] = useState<RecommendedJob[]>([])
  const [pushPermission, setPushPermission] = useState<NotificationPermission | "unsupported">("default")
  const [pushLoading, setPushLoading] = useState(false)
  const socket = useSocket()

  useEffect(() => {
    if (!user) { router.push("/login"); return }
    if (user.role !== "worker") { router.push("/employer/dashboard"); return }

    // Fetch current availability status
    api.get("/workers/profile").then(({ data }) => {
      setIsAvailable(data.isAvailable)
    }).catch(() => {})

    // Fetch recommended jobs
    api.get("/workers/recommended-jobs", { params: { limit: 5 } }).then(({ data }) => {
      setRecommendedJobs(data.jobs ?? [])
    }).catch(() => {})
  }, [user, router])

  // Service worker registration + push permission state
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushPermission("unsupported")
      return
    }
    // Check current permission state
    setPushPermission(Notification.permission)
    // Register service worker (idempotent)
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[SW] Registration failed:", err)
    })
  }, [])

  const handleEnablePush = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return
    setPushLoading(true)
    try {
      const permission = await Notification.requestPermission()
      setPushPermission(permission)
      if (permission !== "granted") return

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
      })
      await api.post("/workers/push-subscription", subscription.toJSON())
    } catch (err) {
      console.warn("[Push] Subscription failed:", err)
    } finally {
      setPushLoading(false)
    }
  }, [])

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
        setMyLocation({ lat, lng })

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
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button onClick={() => { logout(); router.push("/") }} className="text-gray-400 text-sm">로그아웃</button>
        </div>
      </div>

      <div className="px-4 py-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {/* Push Notification Permission Banner */}
        {pushPermission === "default" && (
          <div className="card bg-amber-50 border border-amber-200 p-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-amber-800 text-sm">🔔 알림 설정</div>
              <div className="text-xs text-amber-700 mt-0.5">앱 종료 상태에서도 새 알바 제안 알림을 받으세요.</div>
            </div>
            <button
              onClick={handleEnablePush}
              disabled={pushLoading}
              className="btn-primary text-sm px-4 py-2 whitespace-nowrap bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold disabled:opacity-50"
            >
              {pushLoading ? "처리 중..." : "알림 허용"}
            </button>
          </div>
        )}
        {pushPermission === "denied" && (
          <div className="card bg-gray-50 border border-gray-200 p-3 text-xs text-gray-500 text-center">
            🔕 푸시 알림이 차단되어 있습니다. 브라우저 설정에서 허용해주세요.
          </div>
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

        {/* Mini Map — show when available + location known */}
        {isAvailable && myLocation && (
          <div className="card p-0 overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">📍 내 위치 (반경 5km 탐색 중)</span>
              <span className="text-xs text-green-500 font-medium">● 활성</span>
            </div>
            <KakaoMap
              lat={myLocation.lat}
              lng={myLocation.lng}
              zoom={13}
              className="w-full h-48"
            />
          </div>
        )}

        {/* Quick stats / Recent jobs */}
        <div className="card">
          <h3 className="font-bold text-gray-700 mb-3">빠른 이동</h3>
          <div className="grid grid-cols-3 gap-3">
            <Link href="/worker/jobs"
              className="bg-gray-50 rounded-xl p-4 text-center hover:bg-gray-100 transition-colors">
              <div className="text-2xl mb-1">📋</div>
              <div className="text-sm font-medium">내 알바</div>
            </Link>
            <Link href="/worker/search"
              className="bg-blue-50 rounded-xl p-4 text-center hover:bg-blue-100 transition-colors">
              <div className="text-2xl mb-1">🔍</div>
              <div className="text-sm font-medium text-blue-700">알바 찾기</div>
            </Link>
            <Link href="/worker/profile"
              className="bg-gray-50 rounded-xl p-4 text-center hover:bg-gray-100 transition-colors">
              <div className="text-2xl mb-1">👤</div>
              <div className="text-sm font-medium">내 프로필</div>
            </Link>
          </div>
        </div>

        {/* Recommended jobs */}
        {recommendedJobs.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-700">✨ 추천 공고</h3>
              <Link href="/worker/search" className="text-xs text-blue-500 font-medium">전체 보기</Link>
            </div>
            <div className="space-y-3">
              {recommendedJobs.map(job => {
                const durationMs = new Date(job.end_at).getTime() - new Date(job.start_at).getTime()
                const durationHours = durationMs / (1000 * 60 * 60)
                return (
                  <Link key={job.id} href={`/worker/search`} className="block bg-gray-50 rounded-xl p-3 hover:bg-gray-100 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                            {job.category}
                          </span>
                          {job.distance !== null && (
                            <span className="text-xs text-gray-400">
                              📍 {job.distance < 1000
                                ? `${Math.round(job.distance)}m`
                                : `${(job.distance / 1000).toFixed(1)}km`}
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-sm text-gray-900 truncate">{job.title}</div>
                        <div className="text-xs text-gray-500">
                          {format(new Date(job.start_at), "M/d(EEE) HH:mm", { locale: ko })} · {durationHours}h
                        </div>
                      </div>
                      <div className="ml-3 text-right flex-shrink-0">
                        <div className="font-bold text-blue-600 text-sm">{job.hourly_rate.toLocaleString()}원</div>
                        <div className="text-xs text-gray-400">시급</div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

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
