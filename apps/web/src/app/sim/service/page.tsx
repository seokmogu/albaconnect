/**
 * /sim/service — 개인 C2C 용역 의뢰 목록.
 *
 * 용역 트랙: 개인(individual) → 수행자, 도급계약, 건당 보수.
 * 고용 트랙(사업주↔워커)과 별개 — 근로계약 아님.
 *
 * Server Component. 데이터 로드·필터·위장도급 감지는 서버에서,
 * 카드 인터랙션(합의서 모달)은 ServiceCardList 클라이언트 컴포넌트로 위임.
 */
import Link from "next/link"
import { ChevronLeft, AlertCircle, RefreshCw } from "lucide-react"
import { loadServiceRequests, SERVICE_CATEGORY_LABEL, detectRepeatRequesters } from "../_lib/data"
import type { ServiceCategory } from "../_lib/data"
import { ServiceCardList } from "./_components/ServiceCardList"

export const dynamic = "force-dynamic"

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

  // US-15B: 위장도급 감지는 전체 데이터 기준 (필터 무관)
  const repeatMap = detectRepeatRequesters(allRequests)
  const repeatRequesters = [...repeatMap.keys()]

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#1A1A1A]">
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
        <div className="flex items-start gap-3 bg-primary/10 border border-primary/20 rounded-xl p-4 mb-4">
          <AlertCircle size={18} className="text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-primary-dark" style={{ wordBreak: "keep-all" }}>
            <span className="font-bold">용역 트랙 — 개인 간 도급, 근로계약 아님.</span>{" "}
            이 의뢰는 사업주와 근로자의 고용 관계가 아닌, 개인이 개인에게 일의 완성을 위탁하는
            도급 계약입니다. 최저임금법 및 근로기준법 적용 대상이 아닙니다.
          </p>
        </div>

        {/* US-15B: 위장도급 감지 요약 */}
        {repeatRequesters.length > 0 && (
          <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <RefreshCw size={18} className="text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-800" style={{ wordBreak: "keep-all" }}>
              <span className="font-bold">반복·정기 의뢰자 {repeatRequesters.length}명 감지.</span>{" "}
              동일 의뢰자가 3건 이상 의뢰하면 실질 근로(위장도급) 위험이 있어, 해당 카드에
              고용형(근로계약) 트랙 전환 안내가 표시됩니다.
            </p>
          </div>
        )}

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

        <ServiceCardList requests={requests} repeatRequesters={repeatRequesters} />
      </main>
    </div>
  )
}

function FilterChip({
  href, label, active, count,
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
