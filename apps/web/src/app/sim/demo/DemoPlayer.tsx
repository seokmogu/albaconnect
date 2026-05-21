"use client"

/**
 * DemoPlayer — 3분할 실시간 데모 플레이어 (영상 녹화용).
 *
 * 좌(구인자) · 중(구직자) · 우(관리자) 세 시점이 같은 dispatch 이벤트를
 * 동시에 반영한다. 타임라인을 2.6초 간격으로 자동 재생.
 */

import { useEffect, useState } from "react"
import { Store, User, MapPin, Banknote, Clock, Users, CheckCircle, Star, Play, Pause, RotateCcw } from "lucide-react"

export interface DemoStep {
  postingId: string
  employer: { id: string; name: string; hub: string; location: { lat: number; lng: number } }
  worker: { id: string; name: string; avgRating: number; ratingCount: number; completionRate: number; location: { lat: number; lng: number } }
  posting: { title: string; hourlyRate: number; durationHours: number; headcount: number; category: string; employmentType: string | null }
  acceptedReason: string | null
  acceptedSecondsToDecide: number | null
}

interface Props {
  steps: DemoStep[]
  totalEmployers: number
  totalWorkers: number
  totalDispatches: number
}

const EMPLOYMENT_LABEL: Record<string, string> = { gig: "긱", daily: "일일", short: "단기", long: "장기" }
const EMPLOYMENT_COLOR: Record<string, string> = { gig: "#FF6E0D", daily: "#3B82F6", short: "#A855F7", long: "#22C55E" }

// 강남구 미니맵 좌표 투영
const BOUNDS = { minLat: 37.46, maxLat: 37.54, minLng: 126.99, maxLng: 127.12 }
const MAP_W = 320, MAP_H = 260
function project(loc: { lat: number; lng: number }) {
  return {
    x: ((loc.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * MAP_W,
    y: MAP_H - ((loc.lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * MAP_H,
  }
}

type Phase = "posting" | "matching" | "accepted"

export function DemoPlayer({ steps, totalEmployers, totalWorkers, totalDispatches }: Props) {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>("posting")
  const [playing, setPlaying] = useState(true)

  const step = steps[idx]

  // 재생 루프: posting → matching → accepted → 다음 step
  useEffect(() => {
    if (!playing || !step) return
    const seq: Phase[] = ["posting", "matching", "accepted"]
    const cur = seq.indexOf(phase)
    const timer = setTimeout(() => {
      if (cur < 2) {
        setPhase(seq[cur + 1])
      } else {
        setIdx((i) => (i + 1) % steps.length)
        setPhase("posting")
      }
    }, phase === "accepted" ? 2200 : 1300)
    return () => clearTimeout(timer)
  }, [playing, phase, idx, step, steps.length])

  if (!step) {
    return <div className="min-h-screen bg-[#0F1117] text-white flex items-center justify-center">데모 데이터 없음</div>
  }

  const matchedSoFar = steps.slice(0, idx + (phase === "accepted" ? 1 : 0))

  const subtitle =
    phase === "posting" ? `사장님이 "${step.posting.title}" 공고를 등록합니다`
    : phase === "matching" ? `6요소 매칭 알고리즘이 반경 내 워커를 정렬합니다`
    : `워커 ${step.worker.name}님이 ${step.acceptedSecondsToDecide ?? "—"}초 만에 수락했습니다`

  return (
    <div className="min-h-screen bg-[#0F1117] text-white p-6">
      {/* 헤더 */}
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#FF6E0D] flex items-center justify-center font-black">A</div>
          <div>
            <h1 className="text-lg font-black">알바몬 커넥트 — 실시간 매칭 데모</h1>
            <p className="text-xs text-slate-400">강남구 · 사업장 {totalEmployers} · 구직자 {totalWorkers.toLocaleString()} · dispatch {totalDispatches}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPlaying((p) => !p)} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold flex items-center gap-1.5">
            {playing ? <Pause size={13} /> : <Play size={13} />}{playing ? "일시정지" : "재생"}
          </button>
          <button onClick={() => { setIdx(0); setPhase("posting") }} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold flex items-center gap-1.5">
            <RotateCcw size={13} />처음
          </button>
        </div>
      </header>

      {/* 자막 */}
      <div className="bg-[#FF6E0D]/15 border border-[#FF6E0D]/30 rounded-xl px-4 py-2.5 mb-4 text-center">
        <span className="text-sm font-semibold text-[#FF8A3D]">
          [{idx + 1}/{steps.length}] {subtitle}
        </span>
      </div>

      {/* 3분할 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 좌 — 구인자 */}
        <Panel title="구인자 (사장님)" icon={<Store size={15} />} accent="#FF6E0D">
          <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
            <MapPin size={11} />{step.employer.hub} · {step.employer.name}
          </div>
          <div className={`rounded-xl border p-3 transition-all ${phase === "accepted" ? "border-[#22C55E]/40 bg-[#22C55E]/5" : "border-white/10 bg-white/5"}`}>
            <div className="flex items-start justify-between mb-1.5">
              <h3 className="text-sm font-bold leading-tight">{step.posting.title}</h3>
              {phase === "accepted"
                ? <span className="shrink-0 ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#22C55E] font-bold flex items-center gap-0.5"><CheckCircle size={9} />매칭</span>
                : <span className="shrink-0 ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#FF6E0D] font-bold">{phase === "posting" ? "등록" : "매칭 중"}</span>}
            </div>
            {step.posting.employmentType && (
              <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mb-1.5"
                style={{ color: EMPLOYMENT_COLOR[step.posting.employmentType], backgroundColor: `${EMPLOYMENT_COLOR[step.posting.employmentType]}22` }}>
                {EMPLOYMENT_LABEL[step.posting.employmentType]}
              </span>
            )}
            <div className="flex gap-2.5 text-[11px] text-slate-300">
              <span className="flex items-center gap-0.5"><Banknote size={10} className="text-[#FF6E0D]" />{step.posting.hourlyRate.toLocaleString()}원</span>
              <span className="flex items-center gap-0.5"><Clock size={10} />{step.posting.durationHours}h</span>
              <span className="flex items-center gap-0.5"><Users size={10} />{step.posting.headcount}명</span>
            </div>
            {phase === "accepted" && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <p className="text-xs font-bold text-[#22C55E]">✓ {step.worker.name} 매칭 완료</p>
                <p className="text-[10px] text-slate-400 mt-0.5">⭐ {step.worker.avgRating} · 신뢰도 {Math.round(step.worker.completionRate * 100)}%</p>
              </div>
            )}
          </div>
        </Panel>

        {/* 중 — 구직자 */}
        <Panel title="구직자 (워커)" icon={<User size={15} />} accent="#22C55E">
          <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
            <Star size={11} className="text-yellow-400" />{step.worker.name} · {step.worker.avgRating > 0 ? step.worker.avgRating : "신규"}
          </div>
          {phase === "posting" ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-xs text-slate-500">
              매칭 알림 대기 중…
            </div>
          ) : (
            <div className={`rounded-xl border-2 p-3 transition-all ${phase === "accepted" ? "border-[#22C55E]/50 bg-[#22C55E]/5" : "border-[#FF6E0D]/40 bg-[#FF6E0D]/5"}`}>
              <div className="flex items-start justify-between mb-1.5">
                <h3 className="text-sm font-bold leading-tight">{step.posting.title}</h3>
                {phase === "matching"
                  ? <span className="shrink-0 ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#FF6E0D] font-bold">30초</span>
                  : <span className="shrink-0 ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#22C55E] font-bold">수락함</span>}
              </div>
              <p className="text-[11px] text-slate-400 mb-2">{step.employer.name}</p>
              <div className="flex gap-2.5 text-[11px] text-slate-300 mb-2">
                <span className="text-[#FF6E0D] font-bold">{step.posting.hourlyRate.toLocaleString()}원</span>
                <span>{step.posting.durationHours}h</span>
              </div>
              {phase === "matching" ? (
                <div className="flex gap-1.5">
                  <span className="flex-1 py-1.5 bg-[#22C55E] rounded-lg text-center text-xs font-bold">수락</span>
                  <span className="flex-1 py-1.5 bg-white/10 rounded-lg text-center text-xs font-bold text-slate-400">거절</span>
                </div>
              ) : (
                step.acceptedReason && <p className="text-[10px] text-[#22C55E] italic">&quot;{step.acceptedReason}&quot;</p>
              )}
            </div>
          )}
        </Panel>

        {/* 우 — 관리자 */}
        <Panel title="관리자 (관제)" icon={<MapPin size={15} />} accent="#3B82F6">
          <div className="text-xs text-slate-400 mb-2">실시간 매칭 {matchedSoFar.length}건</div>
          <div className="bg-[#0B0E15] rounded-xl border border-white/10 overflow-hidden">
            <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full h-auto">
              <defs>
                <pattern id="g" width="26" height="26" patternUnits="userSpaceOnUse">
                  <path d="M 26 0 L 0 0 0 26" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#g)" />
              {/* 누적 매칭 라인 */}
              {matchedSoFar.map((s) => {
                const a = project(s.employer.location)
                const b = project(s.worker.location)
                return <line key={s.postingId} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#FF6E0D" strokeWidth="0.8" opacity="0.4" />
              })}
              {/* 현재 step 강조 */}
              {(() => {
                const a = project(step.employer.location)
                const b = project(step.worker.location)
                return (
                  <g>
                    {phase !== "posting" && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#FF6E0D" strokeWidth="2" opacity="0.9" />}
                    <circle cx={a.x} cy={a.y} r="5" fill="#FF6E0D" />
                    {phase !== "posting" && <circle cx={b.x} cy={b.y} r="5" fill="#22C55E" />}
                  </g>
                )
              })()}
            </svg>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <MiniKpi label="누적 매칭" value={matchedSoFar.length} />
            <MiniKpi label="진행 dispatch" value={`${idx + 1}/${steps.length}`} />
          </div>
        </Panel>
      </div>

      {/* 진행 바 */}
      <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-[#FF6E0D] transition-all" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
      </div>
    </div>
  )
}

function Panel({ title, icon, accent, children }: { title: string; icon: React.ReactNode; accent: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#161B27] border border-white/8 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-white/8">
        <span style={{ color: accent }}>{icon}</span>
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function MiniKpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white/5 rounded-lg px-2 py-1.5 text-center">
      <p className="text-base font-black text-[#3B82F6]">{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  )
}
