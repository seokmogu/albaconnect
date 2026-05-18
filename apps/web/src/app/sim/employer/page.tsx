/**
 * /sim/employer — 사장님 목록 (Albamon 톤앤매너)
 */
import Link from "next/link"
import { loadEmployers, loadPostings } from "../_lib/data"
import { Store, MapPin, Star, FileText, ChevronLeft } from "lucide-react"

export const dynamic = "force-dynamic"

const CATEGORY_LABEL: Record<string, string> = {
  cafe: "카페", restaurant: "음식점", retail: "유통", event: "이벤트",
  cleaning: "청소", delivery: "배달", manufacturing: "제조", other: "기타",
}

export default async function EmployerListPage() {
  const [employers, postings] = await Promise.all([loadEmployers(), loadPostings()])

  const postingCount = postings.reduce<Record<string, number>>((acc, p) => {
    acc[p.employerId] = (acc[p.employerId] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#1A1A1A]">
      {/* Top header */}
      <header className="bg-white border-b border-[#EEEEEE] px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#FF6E0D] flex items-center justify-center">
              <Store size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#1A1A1A]">사장님 목록</h1>
              <p className="text-xs text-[#999999]">강남구 사업장 {employers.length}개</p>
            </div>
          </div>
          <Link
            href="/sim/admin"
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-[#EEEEEE] text-[#666666] hover:bg-[#F5F6F8] transition-colors"
          >
            <ChevronLeft size={13} />관제 대시보드
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employers.map((e) => (
            <Link
              key={e.id}
              href={`/sim/employer/${e.id}`}
              className="block bg-white border border-[#EEEEEE] rounded-xl p-5 hover:border-[#FF6E0D] hover:shadow-hover transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[#1A1A1A] text-base truncate group-hover:text-[#FF6E0D] transition-colors">
                    {e.name}
                  </h3>
                </div>
                <span className="ml-2 shrink-0 text-xs px-2.5 py-1 rounded-full bg-[#F0F0F0] text-[#666666] font-medium">
                  {CATEGORY_LABEL[e.category] ?? e.category}
                </span>
              </div>

              <div className="space-y-1.5 mb-3">
                <p className="text-xs text-[#999999] flex items-center gap-1">
                  <MapPin size={11} />
                  {e.nearestHub} · {e.dong}
                </p>
                <p className="text-xs text-[#999999] flex items-center gap-1">
                  <Star size={11} className="text-[#F59E0B]" />
                  {e.avgRating} ({e.reviewCount}개 리뷰)
                </p>
              </div>

              <div className="pt-3 border-t border-[#F0F0F0] flex items-center justify-between">
                <span className="text-xs text-[#999999] flex items-center gap-1">
                  <FileText size={11} />
                  활성 공고
                </span>
                <span className="text-sm font-bold text-[#FF6E0D]">
                  {postingCount[e.id] ?? 0}건
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
