/**
 * US-14: 분쟁 트리아지 패널 — 관제 대시보드용 서버 컴포넌트.
 *
 * dispute.ts(순수)의 샘플 분쟁을 규칙 기반 트리아지하고
 * 유형 분포·준비금 현황·분쟁별 권장 조치를 다크 테마로 렌더한다.
 */
import { ShieldAlert, Scale } from "lucide-react"
import {
  SAMPLE_DISPUTES, RESERVE_POOL_TOTAL, triageDispute,
  DISPUTE_TYPE_LABEL,
} from "../../_lib/dispute"
import type { DisputeSeverity, DisputeType } from "../../_lib/dispute"

const SEVERITY_STYLE: Record<DisputeSeverity, { badge: string; label: string }> = {
  high:   { badge: "bg-red-500/15 text-red-400 border border-red-500/30", label: "긴급" },
  medium: { badge: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30", label: "보통" },
  low:    { badge: "bg-slate-500/15 text-slate-400 border border-slate-500/30", label: "낮음" },
}

export function DisputeTriagePanel() {
  const triaged = SAMPLE_DISPUTES.map((d) => ({ dispute: d, result: triageDispute(d) }))

  // 유형 분포
  const typeCounts = new Map<DisputeType, number>()
  for (const { result } of triaged) {
    typeCounts.set(result.type, (typeCounts.get(result.type) ?? 0) + 1)
  }

  // 준비금 현황
  const reserveUsed = triaged.reduce((sum, { result }) => sum + result.reservePayout, 0)
  const reserveLeft = RESERVE_POOL_TOTAL - reserveUsed
  const usedPct = Math.round((reserveUsed / RESERVE_POOL_TOTAL) * 100)

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <ShieldAlert size={14} className="text-[#FF6E0D]" />
        분쟁 트리아지 ({triaged.length})
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 준비금 + 유형 분포 */}
        <div className="space-y-4">
          <div className="bg-[#161B27] border border-white/8 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-3 text-[#FF6E0D]">
              <Scale size={13} />
              <span className="text-xs font-semibold">분쟁 준비금</span>
            </div>
            <p className="text-2xl font-black text-slate-100">
              {reserveLeft.toLocaleString()}
              <span className="text-xs font-normal text-slate-500 ml-1">원 잔액</span>
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div className="h-full bg-[#FF6E0D]" style={{ width: `${usedPct}%` }} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              총 {RESERVE_POOL_TOTAL.toLocaleString()}원 중 {reserveUsed.toLocaleString()}원 선보상 ({usedPct}%)
            </p>
          </div>
          <div className="bg-[#161B27] border border-white/8 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-300 mb-2">유형 분포</p>
            <ul className="space-y-1.5">
              {[...typeCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <li key={type} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{DISPUTE_TYPE_LABEL[type]}</span>
                    <span className="font-bold text-slate-100">{count}건</span>
                  </li>
                ))}
            </ul>
          </div>
        </div>

        {/* 분쟁 목록 */}
        <div className="lg:col-span-2 bg-[#161B27] border border-white/8 rounded-xl p-4">
          <ul className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
            {triaged.map(({ dispute, result }) => {
              const sev = SEVERITY_STYLE[result.severity]
              return (
                <li key={dispute.id} className="border-l-2 border-[#FF6E0D] pl-3 py-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="text-[10px] text-slate-500 font-mono">{dispute.id}</span>
                    <p className="text-sm text-slate-100 font-medium">{dispute.postingTitle}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sev.badge}`}>{sev.label}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/8 text-slate-300">
                      {DISPUTE_TYPE_LABEL[result.type]}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      신고: {dispute.reporter === "employer" ? "사업주" : "워커"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-snug">{dispute.description}</p>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    <span className="text-[#FF6E0D] font-semibold">권장 조치 ·</span> {result.recommendedAction}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[11px]">
                    {dispute.claimAmount > 0 && (
                      <span className="text-slate-500">청구 {dispute.claimAmount.toLocaleString()}원</span>
                    )}
                    {result.reservePayout > 0 && (
                      <span className="text-[#22C55E] font-semibold">
                        준비금 선보상 {result.reservePayout.toLocaleString()}원
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
