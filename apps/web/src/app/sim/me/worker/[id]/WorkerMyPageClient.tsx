"use client"

/**
 * 구직자 마이페이지 클라이언트 (US-2/3/10/11) — 모바일 우선, Albamon 톤앤매너.
 *
 * 세션 메모리 상태: 수락/거절(US-3), 스케줄 규칙(US-10), 라이브 매칭(US-11).
 * 새로고침 시 서버 스냅샷 기준으로 리셋된다.
 */

import { useState } from "react"
import Link from "next/link"
import type { Worker, Dispatch, Posting, ScheduleRule } from "../../../_lib/data"
import { getLegal, LEGAL_GRADE_STYLE } from "../../../_lib/legal"
import { haversineMeters, withinGeofence } from "../../../_lib/geo"
import {
  ChevronLeft, Star, MapPin, Bell, Briefcase, Calendar, User,
  Banknote, Clock, Users, CheckCircle, Plus, Trash2, Shield, AlertTriangle, X, FileText,
  Navigation, LogIn, LogOut
} from "lucide-react"

// US-12: 지오펜스 체크인 반경(미터)
const GEOFENCE_RADIUS_M = 200

interface CheckinState {
  inAt: number | null
  outAt: number | null
  /** 사업장 도착 시뮬 — true면 워커가 사업장 좌표에 있다고 간주 */
  atSite: boolean
}

// data.ts는 server-only(node:fs)라 클라이언트 컴포넌트에서 값 import 불가 → 로컬 정의.
const EMPLOYMENT_LABEL: Record<string, string> = {
  gig: "긱", daily: "일일", short: "단기", long: "장기",
}
const EMPLOYMENT_COLOR: Record<string, string> = {
  gig: "#FF6E0D",
  daily: "#3B82F6",
  short: "#A855F7",
  long: "#22C55E",
}

interface DispatchView {
  dispatch: Dispatch
  posting: Posting
}

interface Props {
  worker: Worker
  notifications: DispatchView[]
  activeJobs: DispatchView[]
}

const HUBS = [
  { name: "강남역", lat: 37.4979, lng: 127.0276 },
  { name: "삼성역", lat: 37.5085, lng: 127.0631 },
  { name: "역삼역", lat: 37.5008, lng: 127.0365 },
  { name: "신논현역", lat: 37.5045, lng: 127.0252 },
  { name: "부산역", lat: 35.1151, lng: 129.0413 },
  { name: "서면", lat: 35.1579, lng: 129.0594 },
]
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"]

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}
function hhmmToMin(v: string): number {
  const [h, m] = v.split(":").map(Number)
  return h * 60 + m
}

type Tab = "알림" | "일감" | "스케줄" | "내정보"

export function WorkerMyPageClient({ worker, notifications: initialNotifs, activeJobs: initialJobs }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("알림")
  const [notifs, setNotifs] = useState(initialNotifs)
  const [jobs, setJobs] = useState(initialJobs)
  const [schedule, setSchedule] = useState<ScheduleRule[]>(worker.availability?.schedule ?? [])
  const [liveOn, setLiveOn] = useState(worker.availability?.live.enabled ?? false)
  const [liveHub, setLiveHub] = useState(HUBS[0].name)
  const [showSchedForm, setShowSchedForm] = useState(false)

  const [formDays, setFormDays] = useState<number[]>([])
  const [formStart, setFormStart] = useState("12:00")
  const [formEnd, setFormEnd] = useState("18:00")
  const [formHub, setFormHub] = useState(HUBS[0].name)

  // US-13: 전자 근로 합의서 모달 상태
  const [agreementTarget, setAgreementTarget] = useState<DispatchView | null>(null)

  // US-12: 지오펜스 체크인 상태 (postingId 별)
  const [checkins, setCheckins] = useState<Record<string, CheckinState>>({})

  function getCheckin(postingId: string): CheckinState {
    return checkins[postingId] ?? { inAt: null, outAt: null, atSite: false }
  }
  // 사업장 도착 시뮬 — 워커 위치를 사업장 좌표로 이동시킨다
  function simArrive(postingId: string) {
    setCheckins((prev) => ({
      ...prev,
      [postingId]: { ...getCheckin(postingId), atSite: true },
    }))
  }
  // 체크인 — 사업장 반경 밖이면 거부
  function checkIn(v: DispatchView) {
    const id = v.dispatch.postingId
    const st = getCheckin(id)
    const myLoc = st.atSite ? v.posting.employerLocation : worker.location
    if (!withinGeofence(myLoc, v.posting.employerLocation, GEOFENCE_RADIUS_M)) {
      alert("사업장 반경 밖입니다. 사업장에 도착한 뒤 체크인하세요.")
      return
    }
    setCheckins((prev) => ({ ...prev, [id]: { ...st, inAt: Date.now() } }))
  }
  function checkOut(postingId: string) {
    const st = getCheckin(postingId)
    if (st.inAt == null) return
    setCheckins((prev) => ({ ...prev, [postingId]: { ...st, outAt: Date.now() } }))
  }

  // US-3: 수락 → 합의서 모달 표시
  function accept(postingId: string) {
    const v = notifs.find((n) => n.dispatch.postingId === postingId)
    if (!v) return
    setAgreementTarget(v)
  }

  // US-13: 합의서 동의 → 진행 일감으로 이동
  function confirmAgreement() {
    if (!agreementTarget) return
    const v = agreementTarget
    setNotifs((prev) => prev.filter((n) => n.dispatch.postingId !== v.dispatch.postingId))
    setJobs((prev) => [...prev, { ...v, dispatch: { ...v.dispatch, acceptedBy: worker.id } }])
    setAgreementTarget(null)
  }

  // US-13: 합의서 취소 → 알림 목록 유지
  function cancelAgreement() {
    setAgreementTarget(null)
  }
  // US-3: 거절
  function reject(postingId: string) {
    setNotifs((prev) => prev.filter((n) => n.dispatch.postingId !== postingId))
  }

  // US-10: 스케줄 규칙 추가
  function addRule() {
    if (formDays.length === 0) { alert("요일을 선택하세요"); return }
    const startMin = hhmmToMin(formStart)
    const endMin = hhmmToMin(formEnd)
    if (startMin >= endMin) { alert("종료 시각이 시작 시각보다 빨라요"); return }
    const hub = HUBS.find((h) => h.name === formHub)!
    setSchedule((prev) => [...prev, {
      id: `r-${Date.now()}`,
      days: [...formDays].sort(),
      startMin, endMin,
      hubName: hub.name,
      center: { lat: hub.lat, lng: hub.lng },
      radiusMeters: 3000,
    }])
    setFormDays([])
    setShowSchedForm(false)
  }
  function removeRule(id: string) {
    setSchedule((prev) => prev.filter((r) => r.id !== id))
  }
  function toggleFormDay(d: number) {
    setFormDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#1A1A1A] pb-20">
      {/* US-13: 전자 근로 합의서 모달 */}
      {agreementTarget && (
        <AgreementModal
          dispatchView={agreementTarget}
          workerName={worker.name}
          onConfirm={confirmAgreement}
          onCancel={cancelAgreement}
        />
      )}
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <header className="bg-[#1A1A1A] text-white px-5 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <Link href="/sim/me" className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors">
              <ChevronLeft size={14} />다른 계정
            </Link>
            <span className="text-xs px-2.5 py-1 rounded-full bg-[#FF6E0D] font-bold">워커 모드</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black">{worker.name}</h1>
              <p className="text-xs text-white/50 mt-0.5 flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Star size={10} className="text-yellow-400" />
                  {worker.avgRating > 0 ? `${worker.avgRating} (${worker.ratingCount})` : "신규"}
                </span>
                <span>신뢰도 {Math.round(worker.completionRate * 100)}%</span>
              </p>
            </div>
            {/* 라이브 매칭 토글 — 헤더에 상시 노출 */}
            <button
              onClick={() => setLiveOn((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                liveOn ? "bg-[#FF6E0D] text-white" : "bg-white/10 text-white/60"
              }`}
              aria-pressed={liveOn}
              aria-label="라이브 매칭 토글"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${liveOn ? "bg-white" : "bg-white/40"}`} />
              LIVE {liveOn ? "ON" : "OFF"}
            </button>
          </div>

          {/* 라이브 ON 시 위치 선택 */}
          {liveOn && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-[#FF6E0D] shrink-0" />
                <select
                  value={liveHub}
                  onChange={(e) => setLiveHub(e.target.value)}
                  className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white appearance-none"
                >
                  {HUBS.map((h) => <option key={h.name} value={h.name} className="text-[#1A1A1A]">{h.name}</option>)}
                </select>
              </div>
              <p className="text-xs text-[#FF6E0D] mt-1.5">{liveHub} 반경 3km 공고 수신 중</p>
            </div>
          )}
        </header>

        {/* 콘텐츠 */}
        <div className="p-4 space-y-4">
          {/* 알림 탭 */}
          {activeTab === "알림" && (
            <section>
              <h2 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-1.5">
                <Bell size={14} className="text-[#FF6E0D]" />
                새 매칭 알림
                {notifs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#FF6E0D] text-white text-[10px] font-bold leading-none">
                    {notifs.length}
                  </span>
                )}
              </h2>
              {notifs.length === 0 ? (
                <div className="bg-white border border-[#EEEEEE] rounded-2xl p-8 text-center">
                  <Bell size={24} className="text-[#CCCCCC] mx-auto mb-2" />
                  <p className="text-sm text-[#999999]">받은 알림이 없습니다</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {notifs.slice(0, 10).map(({ dispatch, posting }) => {
                    const legal = getLegal(posting.draft.category)
                    const gs = LEGAL_GRADE_STYLE[legal.grade]
                    return (
                    <li key={dispatch.postingId} className="bg-white border-2 border-[#FF6E0D]/25 rounded-2xl p-4">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-bold text-[#1A1A1A] text-sm leading-tight">{posting.draft.title}</h3>
                        <span className="shrink-0 ml-2 text-xs px-2 py-0.5 rounded-full bg-[#FF6E0D] text-white font-bold">30초</span>
                      </div>
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        <p className="text-xs text-[#999999]">{posting.employerName}</p>
                        {posting.employmentType && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{
                              color: EMPLOYMENT_COLOR[posting.employmentType],
                              backgroundColor: `${EMPLOYMENT_COLOR[posting.employmentType]}1A`,
                            }}
                          >
                            {EMPLOYMENT_LABEL[posting.employmentType]}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gs.badge}`}>{gs.label}</span>
                        {legal.grade !== "A" && (
                          <span className="flex items-center gap-0.5 text-[10px] text-yellow-600" title={legal.warning}>
                            <AlertTriangle size={9} />{legal.warning}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-3 text-xs text-[#666666] mb-4">
                        <span className="flex items-center gap-1">
                          <Banknote size={11} className="text-[#FF4D4D]" />
                          <span className="text-[#FF4D4D] font-bold">{posting.draft.hourlyRate.toLocaleString()}원</span>
                        </span>
                        <span className="flex items-center gap-1"><Clock size={11} />{posting.draft.durationHours}h</span>
                        <span className="flex items-center gap-1"><Users size={11} />{posting.draft.headcount}명</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => accept(dispatch.postingId)}
                          className="flex-1 py-3 bg-[#FF6E0D] text-white rounded-xl font-black text-sm hover:bg-[#E55E00] active:scale-[0.98] transition-all"
                        >
                          수락
                        </button>
                        <button
                          onClick={() => reject(dispatch.postingId)}
                          className="flex-1 py-3 bg-[#F0F0F0] text-[#666666] rounded-xl font-black text-sm hover:bg-[#E5E5E5] active:scale-[0.98] transition-all"
                        >
                          거절
                        </button>
                      </div>
                    </li>
                  )
                  })}
                </ul>
              )}
            </section>
          )}

          {/* 일감 탭 */}
          {activeTab === "일감" && (
            <section>
              <h2 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-1.5">
                <Briefcase size={14} className="text-[#FF6E0D]" />
                진행 중 일감 ({jobs.length})
              </h2>
              {jobs.length === 0 ? (
                <div className="bg-white border border-[#EEEEEE] rounded-2xl p-8 text-center">
                  <Briefcase size={24} className="text-[#CCCCCC] mx-auto mb-2" />
                  <p className="text-sm text-[#999999]">진행 중인 일감 없음</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {jobs.map((v) => (
                    <li key={v.dispatch.postingId} className="bg-white border border-[#EEEEEE] rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-bold text-[#1A1A1A] text-sm">{v.posting.draft.title}</h3>
                        <span className="flex items-center gap-1 text-xs text-[#22C55E] font-semibold">
                          <CheckCircle size={11} />확정
                        </span>
                      </div>
                      <p className="text-xs text-[#999999] mb-2">{v.posting.employerName}</p>
                      <div className="flex items-center gap-2 mb-3">
                        <Banknote size={14} className="text-[#FF4D4D]" />
                        <span className="text-base font-black text-[#FF4D4D]">
                          {(v.posting.draft.hourlyRate * v.posting.draft.durationHours).toLocaleString()}원
                        </span>
                        <span className="text-xs text-[#CCCCCC]">예상 정산</span>
                      </div>
                      <GeofenceCheckin
                        view={v}
                        state={getCheckin(v.dispatch.postingId)}
                        workerLoc={worker.location}
                        onArrive={() => simArrive(v.dispatch.postingId)}
                        onCheckIn={() => checkIn(v)}
                        onCheckOut={() => checkOut(v.dispatch.postingId)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 bg-[#22C55E]/8 border border-[#22C55E]/20 rounded-2xl p-4 flex items-start gap-2">
                <Shield size={14} className="text-[#22C55E] shrink-0 mt-0.5" />
                <p className="text-xs text-[#22C55E] leading-relaxed">
                  토스 에스크로 — 근무 완료 확인 시 당일 또는 익일 즉시 입금
                </p>
              </div>
            </section>
          )}

          {/* 스케줄 탭 */}
          {activeTab === "스케줄" && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-[#1A1A1A] flex items-center gap-1.5">
                  <Calendar size={14} className="text-[#FF6E0D]" />
                  예약 스케줄 ({schedule.length})
                </h2>
                <button
                  onClick={() => setShowSchedForm((v) => !v)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-[#FF6E0D] text-white font-bold hover:bg-[#E55E00] transition-colors"
                >
                  {showSchedForm ? "닫기" : <><Plus size={12} />추가</>}
                </button>
              </div>

              {schedule.length === 0 && !showSchedForm && (
                <div className="bg-white border border-[#EEEEEE] rounded-2xl p-8 text-center">
                  <Calendar size={24} className="text-[#CCCCCC] mx-auto mb-2" />
                  <p className="text-sm text-[#999999]">등록된 스케줄이 없습니다</p>
                </div>
              )}

              {schedule.length > 0 && (
                <ul className="space-y-2 mb-4">
                  {schedule.map((r) => (
                    <li key={r.id} className="bg-white border border-[#EEEEEE] rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#1A1A1A]">
                          {r.days.map((d) => DAY_LABELS[d]).join(" · ")}
                        </p>
                        <p className="text-xs text-[#999999] mt-0.5">
                          {minToHHMM(r.startMin)} ~ {minToHHMM(r.endMin)} · {r.hubName}
                        </p>
                      </div>
                      <button
                        onClick={() => removeRule(r.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-[#FF4D4D] hover:bg-[#FF4D4D]/10 transition-colors"
                        aria-label="스케줄 삭제"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {showSchedForm && (
                <div className="bg-white border border-[#EEEEEE] rounded-2xl p-4 space-y-4">
                  <div>
                    <label className="text-xs font-bold text-[#666666] block mb-2">요일</label>
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((label, d) => (
                        <button
                          key={d}
                          onClick={() => toggleFormDay(d)}
                          className={`flex-1 h-10 rounded-lg text-xs font-bold transition-colors ${
                            formDays.includes(d)
                              ? "bg-[#FF6E0D] text-white"
                              : "bg-[#F0F0F0] text-[#666666] hover:bg-[#E5E5E5]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-[#666666] block mb-1.5">시작</label>
                      <input
                        type="time"
                        value={formStart}
                        onChange={(e) => setFormStart(e.target.value)}
                        className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF6E0D] transition-colors"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-bold text-[#666666] block mb-1.5">종료</label>
                      <input
                        type="time"
                        value={formEnd}
                        onChange={(e) => setFormEnd(e.target.value)}
                        className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF6E0D] transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#666666] block mb-1.5">활동 지역</label>
                    <select
                      value={formHub}
                      onChange={(e) => setFormHub(e.target.value)}
                      className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF6E0D] transition-colors"
                    >
                      {HUBS.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={addRule}
                    className="w-full py-3 bg-[#FF6E0D] text-white rounded-xl font-black text-sm hover:bg-[#E55E00] transition-colors"
                  >
                    스케줄 추가
                  </button>
                </div>
              )}
            </section>
          )}

          {/* 내정보 탭 */}
          {activeTab === "내정보" && (
            <section className="space-y-3">
              <div className="bg-white border border-[#EEEEEE] rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#F0F0F0] flex items-center justify-center">
                    <User size={24} className="text-[#999999]" />
                  </div>
                  <div>
                    <h3 className="font-black text-[#1A1A1A] text-lg">{worker.name}</h3>
                    <p className="text-xs text-[#999999]">{worker.id}</p>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between py-2 border-b border-[#F0F0F0]">
                    <span className="text-[#999999] flex items-center gap-1.5"><Star size={13} />평점</span>
                    <span className="font-bold text-[#F59E0B]">
                      {worker.avgRating > 0 ? `${worker.avgRating} (${worker.ratingCount}개)` : "신규"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[#F0F0F0]">
                    <span className="text-[#999999] flex items-center gap-1.5"><CheckCircle size={13} />신뢰도</span>
                    <span className="font-bold text-[#22C55E]">{Math.round(worker.completionRate * 100)}%</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[#F0F0F0]">
                    <span className="text-[#999999] flex items-center gap-1.5"><MapPin size={13} />위치</span>
                    <span className="font-medium text-[#333333] text-xs">{worker.location.lat.toFixed(4)}, {worker.location.lng.toFixed(4)}</span>
                  </div>
                  <div className="pt-1">
                    <p className="text-[#999999] text-xs mb-1.5">카테고리</p>
                    <div className="flex flex-wrap gap-1.5">
                      {worker.categories.map((c) => (
                        <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-[#F0F0F0] text-[#666666]">{c}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white border border-[#EEEEEE] rounded-2xl p-5">
                <h4 className="text-xs font-bold text-[#999999] mb-2">페르소나</h4>
                <p className="text-sm text-[#333333] leading-relaxed">{worker.persona}</p>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 하단 탭바 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#EEEEEE] z-20 safe-area-inset-bottom" aria-label="메인 네비게이션">
        <div className="max-w-md mx-auto grid grid-cols-4">
          {(
            [
              { tab: "알림" as Tab, icon: <Bell size={20} />, badge: notifs.length },
              { tab: "일감" as Tab, icon: <Briefcase size={20} />, badge: jobs.length },
              { tab: "스케줄" as Tab, icon: <Calendar size={20} />, badge: 0 },
              { tab: "내정보" as Tab, icon: <User size={20} />, badge: 0 },
            ] as const
          ).map(({ tab, icon, badge }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                activeTab === tab ? "text-[#FF6E0D]" : "text-[#CCCCCC]"
              }`}
              aria-current={activeTab === tab ? "page" : undefined}
            >
              {icon}
              <span className="text-[10px] font-medium">{tab}</span>
              {badge > 0 && (
                <span className="absolute top-1.5 right-4 w-4 h-4 rounded-full bg-[#FF4D4D] text-white text-[9px] font-black flex items-center justify-center">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

// ---------------------------------------------------------------------------
// US-12: 지오펜스 체크인 (양측 동의 근로시간 기록)
// ---------------------------------------------------------------------------
interface GeofenceCheckinProps {
  view: DispatchView
  state: CheckinState
  workerLoc: { lat: number; lng: number }
  onArrive: () => void
  onCheckIn: () => void
  onCheckOut: () => void
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}
function fmtElapsed(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}분 ${s}초` : `${s}초`
}

function GeofenceCheckin({ view, state, workerLoc, onArrive, onCheckIn, onCheckOut }: GeofenceCheckinProps) {
  const empLoc = view.posting.employerLocation
  const myLoc = state.atSite ? empLoc : workerLoc
  const dist = Math.round(haversineMeters(myLoc, empLoc))
  const inRange = dist <= GEOFENCE_RADIUS_M
  const checkedIn = state.inAt != null
  const checkedOut = state.outAt != null

  // 체크아웃 완료 — 근로시간 기록
  if (checkedIn && checkedOut) {
    return (
      <div className="bg-[#22C55E]/8 border border-[#22C55E]/25 rounded-xl p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <CheckCircle size={13} className="text-[#22C55E]" />
          <span className="text-xs font-bold text-[#22C55E]">근로시간 기록 완료 (양측 동의)</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <CheckinStat label="체크인" value={fmtClock(state.inAt!)} />
          <CheckinStat label="체크아웃" value={fmtClock(state.outAt!)} />
          <CheckinStat label="근로시간" value={fmtElapsed(state.outAt! - state.inAt!)} highlight />
        </div>
      </div>
    )
  }

  // 체크인됨, 근무 중
  if (checkedIn) {
    return (
      <div className="bg-[#FF6E0D]/8 border border-[#FF6E0D]/25 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF6E0D] animate-pulse" />
            <span className="text-xs font-bold text-[#FF6E0D]">근무 중 · 체크인 {fmtClock(state.inAt!)}</span>
          </div>
          <button
            onClick={onCheckOut}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1A1A1A] text-white text-xs font-bold hover:bg-black transition-colors"
          >
            <LogOut size={12} />체크아웃
          </button>
        </div>
      </div>
    )
  }

  // 미체크인 — 지오펜스 판정
  return (
    <div className="bg-[#F5F6F8] border border-[#EEEEEE] rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Navigation size={12} className={inRange ? "text-[#22C55E]" : "text-[#999999]"} />
        <span className="text-xs text-[#666666]">
          사업장까지 <span className="font-bold text-[#1A1A1A]">{dist.toLocaleString()}m</span>
          <span className="text-[#CCCCCC]"> · 체크인 반경 {GEOFENCE_RADIUS_M}m</span>
        </span>
      </div>
      {inRange ? (
        <button
          onClick={onCheckIn}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-[#FF6E0D] text-white text-sm font-bold hover:bg-[#E55E00] active:scale-[0.98] transition-all"
        >
          <LogIn size={13} />지오펜스 체크인
        </button>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] text-[#999999] leading-snug">
            사업장 반경 밖입니다. 체크인하려면 사업장에 도착해야 합니다.
          </p>
          <button
            onClick={onArrive}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-white border border-[#FF6E0D] text-[#FF6E0D] text-sm font-bold hover:bg-[#FF6E0D]/5 transition-colors"
          >
            <MapPin size={13} />사업장 도착 (시뮬)
          </button>
        </div>
      )}
    </div>
  )
}

function CheckinStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-[#999999] mb-0.5">{label}</p>
      <p className={`text-xs font-bold ${highlight ? "text-[#FF6E0D]" : "text-[#1A1A1A]"}`}>{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// US-13: 전자 근로 합의서 모달
// ---------------------------------------------------------------------------
interface AgreementModalProps {
  dispatchView: DispatchView
  workerName: string
  onConfirm: () => void
  onCancel: () => void
}

function AgreementModal({ dispatchView, workerName, onConfirm, onCancel }: AgreementModalProps) {
  const { posting } = dispatchView
  const hourlyRate = posting.draft.hourlyRate
  const hours = posting.draft.durationHours
  const total = hourlyRate * hours
  const empType = posting.employmentType ?? "gig"

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-0 pb-0"
      role="dialog"
      aria-modal="true"
      aria-label="전자 근로 합의서"
    >
      <div className="w-full max-w-md bg-white rounded-t-2xl shadow-2xl overflow-y-auto max-h-[92dvh]">
        {/* 모달 헤더 */}
        <div className="sticky top-0 bg-[#FF6E0D] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-white" />
            <h2 className="text-white font-black text-base">전자 근로 합의서</h2>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 당사자 정보 */}
          <section className="bg-[#F5F6F8] rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-[#999999] uppercase tracking-wide">당사자</h3>
            <div className="flex justify-between text-sm">
              <span className="text-[#666666]">사업장명</span>
              <span className="font-bold text-[#1A1A1A]">{posting.employerName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#666666]">워커명</span>
              <span className="font-bold text-[#1A1A1A]">{workerName}</span>
            </div>
          </section>

          {/* 근무 조건 */}
          <section className="bg-[#F5F6F8] rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-[#999999] uppercase tracking-wide">근무 조건</h3>
            <div className="flex justify-between text-sm">
              <span className="text-[#666666]">업무 내용</span>
              <span className="font-bold text-[#1A1A1A] text-right max-w-[60%]">{posting.draft.title}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#666666]">근무 시간</span>
              <span className="font-bold text-[#1A1A1A]">{hours}시간</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#666666]">근무 장소</span>
              <span className="font-bold text-[#1A1A1A] text-right max-w-[60%]">{posting.draft.address ?? posting.employerName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#666666]">고용형태</span>
              <span className="font-bold text-[#1A1A1A]">{EMPLOYMENT_LABEL[empType] ?? empType}</span>
            </div>
          </section>

          {/* 급여 및 정산 */}
          <section className="bg-[#F5F6F8] rounded-xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-[#999999] uppercase tracking-wide">급여 및 정산</h3>
            <div className="flex justify-between text-sm">
              <span className="text-[#666666]">시급</span>
              <span className="font-bold text-[#FF4D4D]">{hourlyRate.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#666666]">총 지급액</span>
              <span className="font-black text-[#FF4D4D] text-base">{total.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#666666]">정산 방식</span>
              <span className="font-bold text-[#22C55E]">토스 에스크로 (근무 완료 즉시)</span>
            </div>
          </section>

          {/* 취소·노쇼 규정 */}
          <section className="bg-[#FFF7ED] border border-[#FF6E0D]/20 rounded-xl p-4">
            <h3 className="text-xs font-bold text-[#FF6E0D] mb-1.5 flex items-center gap-1">
              <AlertTriangle size={11} />취소·노쇼 규정
            </h3>
            <p className="text-xs text-[#666666] leading-relaxed">
              근무 시작 1시간 전 취소 시 패널티 없음. 노쇼(무단결근) 시 신뢰도 점수 차감 및 매칭 제한이 적용됩니다.
            </p>
          </section>

          {/* 플랫폼 지위 명시 */}
          <section className="bg-[#F0F9FF] border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <Shield size={13} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 leading-relaxed">
                알바몬 커넥트는 중개자이며 근로계약 당사자는 사업주와 워커입니다. 본 합의서는 양 당사자 간 근로조건 확인 기록으로 사용됩니다.
              </p>
            </div>
          </section>

          {/* 동의 버튼 */}
          <div className="pt-2 pb-6 space-y-2">
            <button
              onClick={onConfirm}
              className="w-full py-4 bg-[#FF6E0D] text-white rounded-xl font-black text-base hover:bg-[#E55E00] active:scale-[0.98] transition-all"
            >
              동의하고 계약 확정
            </button>
            <button
              onClick={onCancel}
              className="w-full py-3 bg-[#F0F0F0] text-[#666666] rounded-xl font-bold text-sm hover:bg-[#E5E5E5] active:scale-[0.98] transition-all"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
