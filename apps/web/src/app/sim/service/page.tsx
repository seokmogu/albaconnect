/**
 * /sim/service — 개인 C2C 용역 의뢰 목록.
 *
 * 용역 트랙: 개인(individual) → 수행자, 도급계약, 건당 보수.
 * 고용 트랙(사업주↔워커)과 별개 — 근로계약 아님.
 *
 * Server Component. data.ts의 loadServiceRequests() 직접 사용.
 */
import { loadServiceRequests } from "../_lib/data"
import { SERVICE_CATEGORY_LABEL } from "../_lib/data"
import { LEGAL_GRADE_STYLE } from "../_lib/legal"
import Link from "next/link"
import {
  ShoppingBag,
  Home,
  Wrench,
  Package,
  PawPrint,
  Clock,
  Bike,
  MapPin,
  ChevronLeft,
  AlertCircle,
} from "lucide-react"
import type { ServiceCategory, ServiceRequest } from "../_lib/data"

export const dynamic = "force-dynamic"

// ── 카테고리 아이콘 맵 ──────────────────────────────────────────────────────
const CATEGORY_ICON: Record<ServiceCategory, React.ReactNode> = {
  errand:       <ShoppingBag size={18} />,
  homecleaning: <Home size={18} />,
  assembly:     <Wrench size={18} />,
  moving:       <Package size={18} />,
  pet:          <PawPrint size={18} />,
  queue:        <Clock size={18} />,
  walkdelivery: <Bike size={18} />,
}

const ALL_CATEGORIES = Object.keys(SERVICE_CATEGORY_LABEL) as ServiceCategory[]

export default async function ServicePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>
}) {
  const params = await searchParams
  const selectedCat = params.cat as ServiceCategory | undefined

  const allRequests = await loadServiceRequests()
  const requests = selectedCat
    ? allRequests.filter((r) => r.serviceCategory === selectedCat)
    : allRequests

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#1A1A1A]">
      {/* 헤더 */}
      <header className="bg-[#FF6E0D] text-white">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <Link
            href="/sim"
            className="inline-flex items-center gap-1 text-white/70 hover:text-white text-sm mb-4"
          >
            <ChevronLeft size={14} /> 시뮬레이터 홈
          </Link>
          <h1 className="text-2xl font-black leading-tight" style={{ wordBreak: "keep-all" }}>
            용역 의뢰 둘러보기
          </h1>
          <p className="text-sm text-white/80 mt-1">
            강남구 개인 C2C 용역 — {allRequests.length}건
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {/* 용역 트랙 안내 배너 */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <AlertCircle size={18} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800" style={{ wordBreak: "keep-all" }}>
            <span className="font-bold">용역 트랙 — 개인 간 도급, 근로계약 아님.</span>{" "}
            이 의뢰는 사업주와 근로자의 고용 관계가 아닌, 개인이 개인에게 일의 완성을 위탁하는
            도급 계약입니다. 최저임금법 및 근로기준법 적용 대상이 아닙니다.
          </p>
        </div>

        {/* 카테고리 필터 칩 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <FilterChip href="/sim/service" label="전체" active={!selectedCat} count={allRequests.length} />
          {ALL_CATEGORIES.map((cat) => {
            const count = allRequests.filter((r) => r.serviceCategory === cat).length
            return (
              <FilterChip
                key={cat}
                href={`/sim/service?cat=${cat}`}
                label={SERVICE_CATEGORY_LABEL[cat]}
                active={selectedCat === cat}
                count={count}
              />
            )
          })}
        </div>

        {/* 의뢰 카드 그리드 */}
        {requests.length === 0 ? (
          <p className="text-center text-[#999] py-16 text-sm">해당 카테고리의 의뢰가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {requests.map((req) => (
              <ServiceCard key={req.id} req={req} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ── 필터 칩 ─────────────────────────────────────────────────────────────────
function FilterChip({
  href,
  label,
  active,
  count,
}: {
  href: string
  label: string
  active: boolean
  count: number
}) {
  return (
    <Link
      href={href}
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
        active
          ? "bg-[#FF6E0D] text-white border-[#FF6E0D]"
          : "bg-white text-[#444] border-[#EEEEEE] hover:border-[#FF6E0D] hover:text-[#FF6E0D]",
      ].join(" ")}
    >
      {label}
      <span
        className={[
          "text-xs px-1.5 py-0.5 rounded-full",
          active ? "bg-white/20 text-white" : "bg-[#F5F6F8] text-[#888]",
        ].join(" ")}
      >
        {count}
      </span>
    </Link>
  )
}

// ── 의뢰 카드 ────────────────────────────────────────────────────────────────
function ServiceCard({ req }: { req: ServiceRequest }) {
  const catLabel = SERVICE_CATEGORY_LABEL[req.serviceCategory]
  const icon = CATEGORY_ICON[req.serviceCategory]
  const gradeStyle = LEGAL_GRADE_STYLE[req.legalGrade]

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-2xl p-5 hover:border-[#FF6E0D] hover:shadow-md transition-all">
      {/* 카테고리 + 법적등급 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#FF6E0D]/10 flex items-center justify-center text-[#FF6E0D]">
            {icon}
          </div>
          <span className="text-xs font-semibold text-[#FF6E0D]">{catLabel}</span>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${gradeStyle.badge}`}>
          {gradeStyle.label}
        </span>
      </div>

      {/* 제목 */}
      <h3 className="font-bold text-[#1A1A1A] text-sm leading-snug mb-1" style={{ wordBreak: "keep-all" }}>
        {req.title}
      </h3>

      {/* 의뢰자 */}
      <p className="text-xs text-[#888] mb-3">
        의뢰자 <span className="text-[#444] font-medium">{req.requesterName}</span> · 개인
      </p>

      {/* 보수 + 예상시간 */}
      <div className="flex items-center justify-between">
        <p className="text-lg font-black text-[#FF4D4D]">
          {req.fee.toLocaleString()}원
          <span className="text-xs font-normal text-[#999] ml-1">/ 건</span>
        </p>
        <span className="text-xs text-[#888]">
          약 {req.estimatedHours >= 1
            ? `${req.estimatedHours}시간`
            : `${req.estimatedHours * 60}분`}
        </span>
      </div>

      {/* 위치 */}
      <div className="flex items-center gap-1 mt-2 text-xs text-[#999]">
        <MapPin size={11} />
        <span>{req.hubName} 인근</span>
      </div>
    </div>
  )
}
