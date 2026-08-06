/**
 * /sim/admin — 관리자 관제 대시보드.
 * Albamon 톤앤매너 적용 (데스크탑 최적화)
 */

import Link from "next/link"
import { loadSnapshot } from "../_lib/data"
import { getLegal, LEGAL_GRADE_STYLE, type LegalGrade } from "../_lib/legal"
import { LayoutDashboard, Store, Users, Zap, TrendingUp, Clock, MapPin, Tag, AlertTriangle, ShieldCheck } from "lucide-react"
import { DisputeTriagePanel } from "./_components/DisputeTriagePanel"

export const dynamic = "force-dynamic"

const GANGNAM_BOUNDS = {
  minLat: 37.475, maxLat: 37.535,
  minLng: 127.000, maxLng: 127.115,
}

const SVG_W = 900
const SVG_H = 600

function projectToSvg(loc: { lat: number; lng: number }): { x: number; y: number } {
  const x = ((loc.lng - GANGNAM_BOUNDS.minLng) / (GANGNAM_BOUNDS.maxLng - GANGNAM_BOUNDS.minLng)) * SVG_W
  const y = SVG_H - ((loc.lat - GANGNAM_BOUNDS.minLat) / (GANGNAM_BOUNDS.maxLat - GANGNAM_BOUNDS.minLat)) * SVG_H
  return { x, y }
}

const CATEGORY_COLOR: Record<string, string> = {
  cafe: "#FF6E0D",
  restaurant: "#FF4D4D",
  retail: "#FF6E0D",
  event: "#A855F7",
  cleaning: "#22C55E",
  delivery: "#F59E0B",
  manufacturing: "#64748B",
  other: "#94A3B8",
}

const CATEGORY_LABEL: Record<string, string> = {
  cafe: "카페",
  restaurant: "음식점",
  retail: "유통",
  event: "이벤트",
  cleaning: "청소",
  delivery: "배달",
  manufacturing: "제조",
  other: "기타",
}

export default async function SimAdminPage() {
  const snap = await loadSnapshot()

  const matched = snap.dispatches.filter((d) => d.acceptedBy).length
  const matchRate = snap.dispatches.length > 0 ? Math.round((matched / snap.dispatches.length) * 100) : 0
  const decideTimes = snap.dispatches
    .map((d) => d.acceptedSecondsToDecide)
    .filter((s): s is number => typeof s === "number")
  const avgMatchSec = decideTimes.length > 0
    ? Math.round((decideTimes.reduce((a, b) => a + b, 0) / decideTimes.length) * 10) / 10
    : 0

  const catCount = snap.employers.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1
    return acc
  }, {})

  // 법적 등급 분포 집계
  const gradeCount = snap.employers.reduce<Record<LegalGrade, number>>(
    (acc, e) => { acc[getLegal(e.category).grade]++; return acc },
    { A: 0, B: 0, C: 0 }
  )
  const totalEmp = snap.employers.length || 1
  const gradePct = {
    A: Math.round((gradeCount.A / totalEmp) * 100),
    B: Math.round((gradeCount.B / totalEmp) * 100),
    C: Math.round((gradeCount.C / totalEmp) * 100),
  }

  return (
    <div className="min-h-screen bg-[#0F1117] text-slate-100 p-6 max-w-none">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#FF6E0D] flex items-center justify-center">
            <LayoutDashboard size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">알바몬 커넥트 관제 대시보드</h1>
            <p className="text-xs text-slate-400 mt-0.5">강남구 시뮬레이터</p>
          </div>
        </div>
        <nav className="flex gap-2 text-xs">
          <Link href="/sim/admin" className="px-3 py-1.5 rounded-lg bg-[#FF6E0D] text-white font-semibold flex items-center gap-1.5">
            <LayoutDashboard size={13} />관리자
          </Link>
          <Link href="/sim/employer" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5">
            <Store size={13} />사장님 목록
          </Link>
          <Link href="/sim/worker" className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5">
            <Users size={13} />워커 목록
          </Link>
        </nav>
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <Kpi label="사업장" value={snap.employers.length} unit="개" accent="#FF6E0D" icon={<Store size={14} />} />
        <Kpi label="공고" value={snap.postings.length} unit="건" accent="#FF6E0D" icon={<Tag size={14} />} />
        <Kpi label="구직자" value={snap.workers.length} unit="명" accent="#22C55E" icon={<Users size={14} />} />
        <Kpi label="Dispatch" value={snap.dispatches.length} unit="회" accent="#A855F7" icon={<Zap size={14} />} />
        <Kpi label="매칭률" value={matchRate} unit="%" accent="#FF4D4D" icon={<TrendingUp size={14} />} />
        <Kpi label="평균 매칭" value={avgMatchSec} unit="초" accent="#F59E0B" icon={<Clock size={14} />} />
      </section>

      {/* Live map */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-[#161B27] border border-white/8 rounded-xl p-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <MapPin size={14} className="text-[#FF6E0D]" />
              강남구 라이브 지도
            </h2>
            <p className="text-xs text-slate-500">{snap.employers.length}개 사업장 · {snap.workers.length}명 워커</p>
          </div>
          <div className="bg-[#0F1117] rounded-lg overflow-hidden border border-white/6">
            <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-auto">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
              {snap.workers.map((w) => {
                const p = projectToSvg(w.location)
                return <circle key={w.id} cx={p.x} cy={p.y} r="2" fill="#22C55E" opacity="0.4" />
              })}
              {(() => {
                const empById = new Map(snap.employers.map((e) => [e.id, e]))
                const wkById = new Map(snap.workers.map((w) => [w.id, w]))
                const postById = new Map(snap.postings.map((p) => [p.id, p]))
                return snap.dispatches
                  .filter((d) => d.acceptedBy)
                  .slice(0, 200)
                  .map((d) => {
                    const post = postById.get(d.postingId)
                    const emp = post ? empById.get(post.employerId) : undefined
                    const wk = d.acceptedBy ? wkById.get(d.acceptedBy) : undefined
                    if (!emp || !wk) return null
                    const a = projectToSvg(emp.location)
                    const b = projectToSvg(wk.location)
                    return (
                      <line
                        key={d.postingId}
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        stroke="#FF6E0D" strokeWidth="0.7" opacity="0.35"
                      />
                    )
                  })
              })()}
              {snap.employers.map((e) => {
                const p = projectToSvg(e.location)
                const color = CATEGORY_COLOR[e.category] ?? CATEGORY_COLOR.other
                return (
                  <g key={e.id}>
                    <circle cx={p.x} cy={p.y} r="6" fill={color} opacity="0.85" />
                    <circle cx={p.x} cy={p.y} r="10" fill={color} opacity="0.2" />
                  </g>
                )
              })}
              {[
                { label: "강남역", lat: 37.4979, lng: 127.0276 },
                { label: "역삼", lat: 37.5008, lng: 127.0365 },
                { label: "선릉", lat: 37.5045, lng: 127.0492 },
                { label: "삼성", lat: 37.5085, lng: 127.0631 },
                { label: "신사", lat: 37.5172, lng: 127.0203 },
                { label: "압구정", lat: 37.5273, lng: 127.0288 },
                { label: "양재", lat: 37.4843, lng: 127.0341 },
                { label: "대치", lat: 37.4998, lng: 127.0581 },
              ].map((h) => {
                const p = projectToSvg({ lat: h.lat, lng: h.lng })
                return (
                  <text key={h.label} x={p.x + 8} y={p.y - 8} fill="#94a3b8" fontSize="11" fontFamily="sans-serif">
                    {h.label}
                  </text>
                )
              })}
            </svg>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-xs">
            {Object.entries(CATEGORY_COLOR).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-slate-300">{CATEGORY_LABEL[cat] ?? cat}</span>
                <span className="text-slate-500">({catCount[cat] ?? 0})</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
              <span className="text-slate-400">워커</span>
            </div>
          </div>
        </div>

        {/* Category distribution + Legal grade summary */}
        <div className="space-y-4">
          <div className="bg-[#161B27] border border-white/8 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <Tag size={14} className="text-[#FF6E0D]" />
              카테고리 분포
            </h2>
            <div className="space-y-2.5">
              {Object.entries(catCount)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, n]) => {
                  const pct = Math.round((n / snap.employers.length) * 100)
                  const legal = getLegal(cat)
                  const gs = LEGAL_GRADE_STYLE[legal.grade]
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1 items-center">
                        <span className="flex items-center gap-1.5 text-slate-300">
                          {CATEGORY_LABEL[cat] ?? cat}
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gs.badge}`}>{gs.label}</span>
                          {legal.grade !== "A" && (
                            <AlertTriangle size={10} className="text-yellow-400" aria-label={legal.warning} />
                          )}
                        </span>
                        <span className="text-slate-500">{n}개 ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLOR[cat] }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* 법적 등급 분포 요약 */}
          <div className="bg-[#161B27] border border-white/8 rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-[#FF6E0D]" />
              법적 등급 분포
            </h2>
            <div className="space-y-2">
              {(["A", "B", "C"] as LegalGrade[]).map((g) => {
                const gs = LEGAL_GRADE_STYLE[g]
                return (
                  <div key={g}>
                    <div className="flex justify-between text-xs mb-1 items-center">
                      <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${gs.badge}`}>
                        {g === "A" ? "A — 자유 주선" : g === "B" ? "B — 조건부" : "C — 주선 금지"}
                      </span>
                      <span className="text-slate-400">{gradeCount[g]}개 ({gradePct[g]}%)</span>
                    </div>
                    <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${gs.dot}`} style={{ width: `${gradePct[g]}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-slate-600 mt-3 leading-relaxed">
              * 법률 자문 아님 — 출시 전 노무사·법무 검토 필수 (Job_Category_Legal_Matrix.md)
            </p>
          </div>
        </div>
      </section>

      {/* Recent postings + dispatches */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#161B27] border border-white/8 rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Tag size={14} className="text-[#FF6E0D]" />
            최근 공고 ({snap.postings.length})
          </h2>
          {snap.postings.length === 0 ? (
            <p className="text-xs text-slate-500">아직 공고 없음. <code className="text-slate-300">node sim/seed/seed-postings.mjs --limit 100</code> 실행 필요.</p>
          ) : (
            <ul className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {snap.postings.slice(0, 30).map((p) => {
                const legal = getLegal(p.draft.category)
                const gs = LEGAL_GRADE_STYLE[legal.grade]
                return (
                  <li key={p.id} className="border-l-2 border-[#FF6E0D] pl-3 py-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm text-slate-100 font-medium">{p.draft.title}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gs.badge}`}>{gs.label}</span>
                      {legal.grade !== "A" && legal.warning && (
                        <span title={legal.warning} aria-label={legal.warning}>
                          <AlertTriangle size={11} className="text-yellow-400" />
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <Link href={`/sim/employer/${p.employerId}`} className="hover:text-slate-300 underline">{p.employerName}</Link>
                      {" · "}
                      <span className="text-[#FF4D4D] font-semibold">{p.draft.hourlyRate.toLocaleString()}원</span>/{p.draft.durationHours}h
                      {" · "}{p.draft.headcount}명
                      {" · "}<span className="text-[#22C55E]">conf {p.draft.confidence}</span>
                    </p>
                    {legal.grade !== "A" && legal.warning && (
                      <p className="text-[10px] text-yellow-600 mt-0.5">{legal.warning}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="bg-[#161B27] border border-white/8 rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Zap size={14} className="text-[#FF6E0D]" />
            최근 Dispatch ({snap.dispatches.length})
          </h2>
          {snap.dispatches.length === 0 ? (
            <p className="text-xs text-slate-500">아직 dispatch 없음. dispatch runner를 다음 단계에서 구현.</p>
          ) : (
            <ul className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {snap.dispatches.slice(-30).reverse().map((d) => (
                <li key={d.postingId} className="border-l-2 border-[#22C55E] pl-3 py-1.5">
                  <p className="text-sm text-slate-100 font-medium">posting <code className="text-xs text-slate-400">{d.postingId}</code></p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {d.acceptedBy ? (
                      <span className="text-[#22C55E] font-semibold">매칭 확정 · {d.acceptedBy}</span>
                    ) : (
                      <span className="text-[#FF4D4D]">미매칭</span>
                    )}
                    {" · "}{d.rankedWorkerIds.length}명 알림
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* US-14: 분쟁 트리아지 */}
      <DisputeTriagePanel />
    </div>
  )
}

function Kpi({ label, value, unit, accent, icon }: { label: string; value: number; unit: string; accent: string; icon: React.ReactNode }) {
  return (
    <div className="bg-[#161B27] border border-white/8 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-2" style={{ color: accent }}>
        {icon}
        <p className="text-xs text-slate-400">{label}</p>
      </div>
      <p className="flex items-baseline gap-1">
        <span className="text-2xl font-bold" style={{ color: accent }}>{value.toLocaleString()}</span>
        <span className="text-xs text-slate-500">{unit}</span>
      </p>
    </div>
  )
}
