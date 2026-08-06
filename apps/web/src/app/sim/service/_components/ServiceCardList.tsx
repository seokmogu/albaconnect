"use client"

/**
 * 용역 의뢰 카드 목록 + 전자 용역 합의서 모달 (US-15A).
 *
 * /sim/service 서버 페이지에서 카드 그리드 부분을 위임받는 클라이언트 컴포넌트.
 * data.ts(server-only)는 import 하지 않고 service.ts(순수)만 사용한다.
 */

import { useState } from "react"
import {
  ShoppingBag, Home, Wrench, Package, PawPrint, Clock, Bike,
  MapPin, FileText, X, Scale, AlertTriangle, RefreshCw,
} from "lucide-react"
import { SERVICE_CATEGORY_LABEL } from "../../_lib/service"
import type { ServiceCategory, ServiceRequest } from "../../_lib/service"
import { LEGAL_GRADE_STYLE } from "../../_lib/legal"

const CATEGORY_ICON: Record<ServiceCategory, React.ReactNode> = {
  errand:       <ShoppingBag size={18} />,
  homecleaning: <Home size={18} />,
  assembly:     <Wrench size={18} />,
  moving:       <Package size={18} />,
  pet:          <PawPrint size={18} />,
  queue:        <Clock size={18} />,
  walkdelivery: <Bike size={18} />,
}

interface Props {
  requests: ServiceRequest[]
  /** US-15B: 반복·정기 의뢰자명 집합 (위장도급 의심) */
  repeatRequesters: string[]
}

export function ServiceCardList({ requests, repeatRequesters }: Props) {
  const [target, setTarget] = useState<ServiceRequest | null>(null)
  const repeatSet = new Set(repeatRequesters)

  if (requests.length === 0) {
    return <p className="text-center text-[#999] py-16 text-sm">해당 카테고리의 의뢰가 없습니다.</p>
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {requests.map((req) => (
          <ServiceCard
            key={req.id}
            req={req}
            isRepeat={repeatSet.has(req.requesterName)}
            onAgree={() => setTarget(req)}
          />
        ))}
      </div>
      {target && (
        <ServiceAgreementModal req={target} onClose={() => setTarget(null)} />
      )}
    </>
  )
}

// ── 의뢰 카드 ────────────────────────────────────────────────────────────────
function ServiceCard({
  req, isRepeat, onAgree,
}: {
  req: ServiceRequest
  isRepeat: boolean
  onAgree: () => void
}) {
  const catLabel = SERVICE_CATEGORY_LABEL[req.serviceCategory]
  const gradeStyle = LEGAL_GRADE_STYLE[req.legalGrade]

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-2xl p-5 hover:border-[#FF6E0D] hover:shadow-md transition-all flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#FF6E0D]/10 flex items-center justify-center text-[#FF6E0D]">
            {CATEGORY_ICON[req.serviceCategory]}
          </div>
          <span className="text-xs font-semibold text-[#FF6E0D]">{catLabel}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${gradeStyle.badge}`}>
          {gradeStyle.label}
        </span>
      </div>

      <h3 className="font-bold text-[#1A1A1A] text-sm leading-snug mb-1" style={{ wordBreak: "keep-all" }}>
        {req.title}
      </h3>
      <p className="text-xs text-[#888] mb-3">
        의뢰자 <span className="text-[#444] font-medium">{req.requesterName}</span> · 개인
      </p>

      <div className="flex items-center justify-between">
        <p className="text-lg font-black text-[#FF4D4D]">
          {req.fee.toLocaleString()}원
          <span className="text-xs font-normal text-[#999] ml-1">/ 건</span>
        </p>
        <span className="text-xs text-[#888]">
          약 {req.estimatedHours >= 1 ? `${req.estimatedHours}시간` : `${req.estimatedHours * 60}분`}
        </span>
      </div>

      <div className="flex items-center gap-1 mt-2 text-xs text-[#999]">
        <MapPin size={11} />
        <span>{req.hubName} 인근</span>
      </div>

      {/* US-15B: 위장도급 안내 */}
      {isRepeat && (
        <div className="flex items-start gap-1.5 mt-3 bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-2">
          <RefreshCw size={12} className="text-yellow-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-yellow-700 leading-snug" style={{ wordBreak: "keep-all" }}>
            이 의뢰자는 반복·정기 의뢰 패턴이 감지되었습니다. 정기 업무는 위장도급
            위험이 있어 <span className="font-bold">고용형(근로계약) 트랙</span> 전환을 권장합니다.
          </p>
        </div>
      )}

      <button
        onClick={onAgree}
        className="mt-3 w-full py-2.5 bg-[#FF6E0D] text-white rounded-xl font-bold text-sm hover:bg-[#E55E00] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
      >
        <FileText size={14} />용역 합의 진행
      </button>
    </div>
  )
}

// ── US-15A: 전자 용역 합의서 모달 ────────────────────────────────────────────
function ServiceAgreementModal({ req, onClose }: { req: ServiceRequest; onClose: () => void }) {
  const [agreed, setAgreed] = useState(false)
  const [done, setDone] = useState(false)
  const catLabel = SERVICE_CATEGORY_LABEL[req.serviceCategory]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="전자 용역 합의서"
    >
      <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-y-auto max-h-[92dvh]">
        <div className="sticky top-0 bg-[#FF6E0D] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale size={16} className="text-white" />
            <h2 className="text-white font-black text-base">전자 용역 합의서</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-10 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#22C55E]/15 flex items-center justify-center">
              <FileText size={26} className="text-[#22C55E]" />
            </div>
            <h3 className="font-black text-[#1A1A1A] text-lg">용역 계약 성립</h3>
            <p className="text-sm text-[#666666] leading-relaxed">
              양 당사자가 도급계약에 동의했습니다. 일의 완성 후 토스 에스크로로 보수가 지급됩니다.
            </p>
            <button
              onClick={onClose}
              className="mt-2 w-full py-3 bg-[#F0F0F0] text-[#666666] rounded-xl font-bold text-sm hover:bg-[#E5E5E5] transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* 계약 성격 — 도급, 근로계약 아님 */}
            <section className="bg-[#FFF7ED] border border-primary/20 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <Scale size={13} className="text-primary shrink-0 mt-0.5" />
                <p className="text-xs text-primary-dark leading-relaxed">
                  본 합의서는 <span className="font-bold">민법상 도급계약</span>입니다. 일의 완성을
                  목적으로 하며 <span className="font-bold">근로계약이 아닙니다</span>. 근로기준법·
                  최저임금법·4대보험은 적용되지 않으며, 의뢰자·수행자는 모두 개인입니다.
                </p>
              </div>
            </section>

            {/* 당사자 */}
            <section className="bg-[#F5F6F8] rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-bold text-[#999999] uppercase tracking-wide">당사자</h3>
              <Row label="의뢰자 (개인)" value={req.requesterName} />
              <Row label="수행자" value="본인 (수락 시 확정)" />
            </section>

            {/* 용역 내용 */}
            <section className="bg-[#F5F6F8] rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-bold text-[#999999] uppercase tracking-wide">용역 내용</h3>
              <Row label="구분" value={catLabel} />
              <Row label="일의 내용" value={req.title} wide />
              <Row label="수행 장소" value={`${req.hubName} 인근`} />
              <Row label="예상 소요" value={
                req.estimatedHours >= 1 ? `${req.estimatedHours}시간` : `${req.estimatedHours * 60}분`
              } />
            </section>

            {/* 보수 — 시급 아닌 건당 */}
            <section className="bg-[#F5F6F8] rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-bold text-[#999999] uppercase tracking-wide">보수 (건당 도급)</h3>
              <div className="flex justify-between text-sm">
                <span className="text-[#666666]">완성 시 보수</span>
                <span className="font-black text-[#FF4D4D] text-base">{req.fee.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#666666]">지급 방식</span>
                <span className="font-bold text-[#22C55E]">토스 에스크로 (완성 확인 시)</span>
              </div>
              <p className="text-[11px] text-[#999999] leading-relaxed pt-1">
                시급이 아닌 일의 완성에 대한 건당 보수입니다. 작업 시간과 무관하게 합의된 결과물 기준으로 지급됩니다.
              </p>
            </section>

            {/* 면책·분쟁 */}
            <section className="bg-[#FFF7ED] border border-[#FF6E0D]/20 rounded-xl p-4">
              <h3 className="text-xs font-bold text-[#FF6E0D] mb-1.5 flex items-center gap-1">
                <AlertTriangle size={11} />책임·분쟁
              </h3>
              <p className="text-xs text-[#666666] leading-relaxed">
                알바몬 커넥트는 용역 중개자이며 계약 당사자가 아닙니다. 일의 하자·분쟁은
                양 당사자 간 도급계약 법리에 따라 해결하며, 플랫폼은 에스크로·분쟁 트리아지를 지원합니다.
              </p>
            </section>

            {/* 동의 체크 */}
            <label className="flex items-start gap-2.5 px-1 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#FF6E0D]"
              />
              <span className="text-xs text-[#444444] leading-relaxed">
                위 내용을 확인했으며, 본 의뢰가 <span className="font-bold">근로계약이 아닌 도급계약</span>임에
                동의합니다.
              </span>
            </label>

            <div className="pt-1 pb-6 space-y-2">
              <button
                onClick={() => setDone(true)}
                disabled={!agreed}
                className="w-full py-4 rounded-xl font-black text-base transition-all disabled:bg-[#E5E5E5] disabled:text-[#AAAAAA] enabled:bg-[#FF6E0D] enabled:text-white enabled:hover:bg-[#E55E00] enabled:active:scale-[0.98]"
              >
                동의하고 용역 계약 확정
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 bg-[#F0F0F0] text-[#666666] rounded-xl font-bold text-sm hover:bg-[#E5E5E5] active:scale-[0.98] transition-all"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-[#666666] shrink-0">{label}</span>
      <span className={`font-bold text-[#1A1A1A] text-right ${wide ? "max-w-[60%]" : ""}`}>{value}</span>
    </div>
  )
}
