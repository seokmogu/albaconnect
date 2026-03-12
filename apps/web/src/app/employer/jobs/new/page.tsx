"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import api from "@/lib/api"
import { JOB_CATEGORIES } from "@albaconnect/shared"
import KakaoMap from "@/components/KakaoMap"

export default function NewJobPage() {
  const router = useRouter()
  const [step, setStep] = useState<"info" | "location" | "confirm">("info")
  const [form, setForm] = useState({
    title: "",
    category: "",
    startAt: "",
    endAt: "",
    hourlyRate: "",
    headcount: "1",
    address: "",
    lat: 0,
    lng: 0,
    description: "",
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)

  const durationHours = form.startAt && form.endAt
    ? Math.max(0, (new Date(form.endAt).getTime() - new Date(form.startAt).getTime()) / (1000 * 60 * 60))
    : 0

  const totalAmount = durationHours > 0
    ? Math.round(Number(form.hourlyRate) * durationHours * Number(form.headcount))
    : 0

  const getCurrentLocation = () => {
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        // Use Kakao REST API for reverse geocoding
        try {
          const res = await fetch(
            `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
            { headers: { Authorization: `KakaoAK ${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}` } }
          )
          const data = await res.json()
          const addr = data.documents?.[0]?.address?.address_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
          setForm(f => ({ ...f, lat, lng, address: addr }))
        } catch {
          setForm(f => ({ ...f, lat, lng, address: `현재 위치 (${lat.toFixed(4)}, ${lng.toFixed(4)})` }))
        }
        setLocationLoading(false)
      },
      () => {
        setError("위치를 가져올 수 없습니다. 주소를 직접 입력해주세요.")
        setLocationLoading(false)
      }
    )
  }

  const handleSubmit = async () => {
    setError("")
    setLoading(true)
    try {
      if (!form.lat || !form.lng) {
        setError("위치를 설정해주세요")
        setLoading(false)
        return
      }
      const { data } = await api.post("/jobs", {
        title: form.title,
        category: form.category,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
        hourlyRate: Number(form.hourlyRate),
        headcount: Number(form.headcount),
        lat: form.lat,
        lng: form.lng,
        address: form.address,
        description: form.description,
      })
      router.push(`/employer/jobs/${data.job.id}`)
    } catch (err: any) {
      setError(err.response?.data?.error ?? "공고 등록에 실패했습니다")
      setStep("info")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">←</button>
        <h1 className="font-bold text-xl">공고 등록</h1>
      </div>

      <div className="px-4 py-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">공고 제목</label>
            <input className="input-field" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: 카페 오픈 시간 서빙 알바" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">직종</label>
            <div className="flex flex-wrap gap-2">
              {JOB_CATEGORIES.map(cat => (
                <button key={cat} type="button"
                  onClick={() => setForm(f => ({ ...f, category: cat }))}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    form.category === cat ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시작 시간</label>
              <input type="datetime-local" className="input-field text-sm" value={form.startAt} onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">종료 시간</label>
              <input type="datetime-local" className="input-field text-sm" value={form.endAt} onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시급 (원)</label>
              <input type="number" className="input-field" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))} placeholder="10000" min="9860" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">모집 인원</label>
              <input type="number" className="input-field" value={form.headcount} onChange={e => setForm(f => ({ ...f, headcount: e.target.value }))} min="1" max="50" />
            </div>
          </div>

          {/* Payment summary */}
          {durationHours > 0 && totalAmount > 0 && (
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="text-sm text-blue-700 space-y-1">
                <div className="flex justify-between"><span>근무 시간</span><span>{durationHours}시간</span></div>
                <div className="flex justify-between"><span>1인 임금</span><span>{Math.round(Number(form.hourlyRate) * durationHours).toLocaleString()}원</span></div>
                <div className="flex justify-between font-bold border-t border-blue-200 pt-1 mt-1">
                  <span>총 예치금 ({form.headcount}명)</span>
                  <span>{totalAmount.toLocaleString()}원</span>
                </div>
                <div className="text-xs text-blue-500">* 플랫폼 수수료 10% 별도</div>
              </div>
            </div>
          )}

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">근무 위치</label>
            <div className="flex gap-2 mb-2">
              <input
                className="input-field flex-1"
                value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="주소를 입력하거나 현재 위치 사용"
              />
              <button
                type="button"
                onClick={getCurrentLocation}
                disabled={locationLoading}
                className="px-3 py-2 bg-gray-100 rounded-xl text-sm font-medium hover:bg-gray-200 whitespace-nowrap"
              >
                {locationLoading ? "⏳" : "📍 현재"}
              </button>
            </div>
            {form.lat && form.lng ? (
              <div className="space-y-2">
                <div className="text-xs text-green-600">✓ 위치 설정됨 ({form.lat.toFixed(4)}, {form.lng.toFixed(4)})</div>
                <KakaoMap
                  lat={form.lat}
                  lng={form.lng}
                  zoom={15}
                  selectable
                  onSelect={(lat, lng) => setForm(f => ({ ...f, lat, lng }))}
                  className="w-full h-48 rounded-xl"
                />
                <div className="text-xs text-gray-400">지도를 클릭하면 위치를 조정할 수 있습니다</div>
              </div>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상세 내용</label>
            <textarea
              className="input-field h-24 resize-none"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="업무 내용, 복장, 주의사항 등을 입력해주세요"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || !form.title || !form.category || !form.startAt || !form.endAt || !form.hourlyRate || !form.address}
          className="btn-primary"
        >
          {loading ? "등록 중..." : `공고 등록 (${totalAmount.toLocaleString()}원 예치)`}
        </button>
      </div>
    </div>
  )
}
