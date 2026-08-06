/**
 * /sim/worker — 구직자 목록 (Albamon 톤앤매너, 페이지네이션)
 */
import Link from "next/link"
import { loadWorkers } from "../_lib/data"
import { Users, Star, ChevronLeft, CheckCircle } from "lucide-react"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 60

export default async function WorkerListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; cat?: string }>
}) {
  const { page: pageRaw, cat } = await searchParams
  const allWorkers = await loadWorkers()

  const filtered = cat
    ? allWorkers.filter((w) => w.categories.includes(cat))
    : allWorkers

  const page = Math.max(1, Number(pageRaw) || 1)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * PAGE_SIZE
  const workers = filtered.slice(start, start + PAGE_SIZE)

  const categories = [...new Set(allWorkers.flatMap((w) => w.categories))].sort()
  const qs = (p: number) => `?page=${p}${cat ? `&cat=${cat}` : ""}`

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#1A1A1A]">
      {/* Header */}
      <header className="bg-white border-b border-[#EEEEEE] px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#22C55E] flex items-center justify-center">
              <Users size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#1A1A1A]">구직자 목록</h1>
              <p className="text-xs text-[#999999]">
                {cat ? `${cat} ` : "전체 "}{filtered.length.toLocaleString()}명 · {safePage}/{totalPages} 페이지
              </p>
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
        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-5">
          <Link
            href="/sim/worker"
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              !cat
                ? "bg-[#FF6E0D] text-white"
                : "bg-white border border-[#EEEEEE] text-[#666666] hover:border-[#FF6E0D] hover:text-[#FF6E0D]"
            }`}
          >
            전체
          </Link>
          {categories.map((c) => (
            <Link
              key={c}
              href={`/sim/worker?cat=${c}`}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                cat === c
                  ? "bg-[#FF6E0D] text-white"
                  : "bg-white border border-[#EEEEEE] text-[#666666] hover:border-[#FF6E0D] hover:text-[#FF6E0D]"
              }`}
            >
              {c}
            </Link>
          ))}
        </div>

        {workers.length === 0 ? (
          <div className="p-8 bg-white rounded-xl border border-[#EEEEEE] text-center">
            <p className="text-sm text-[#999999]">시드된 구직자가 없습니다.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workers.map((w) => (
                <Link
                  key={w.id}
                  href={`/sim/worker/${w.id}`}
                  className="block bg-white border border-[#EEEEEE] rounded-xl p-5 hover:border-[#22C55E] hover:shadow-hover transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-[#1A1A1A] group-hover:text-[#22C55E] transition-colors">
                        {w.name}
                      </h3>
                      <p className="text-xs text-[#CCCCCC] mt-0.5">{w.id}</p>
                    </div>
                    <span className={`shrink-0 ml-2 text-xs px-2.5 py-1 rounded-full font-semibold ${
                      w.available
                        ? "bg-[#22C55E]/10 text-[#22C55E]"
                        : "bg-[#F0F0F0] text-[#999999]"
                    }`}>
                      {w.available ? "수신 ON" : "수신 OFF"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-2 text-xs text-[#999999]">
                    <span className="flex items-center gap-1">
                      <Star size={11} className="text-[#F59E0B]" />
                      {w.avgRating > 0 ? `${w.avgRating} (${w.ratingCount})` : "신규"}
                    </span>
                    <span>신뢰도 {Math.round(w.completionRate * 100)}%</span>
                    {w.verified && (
                      <span className="flex items-center gap-0.5 text-[#FF6E0D]">
                        <CheckCircle size={10} />인증
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#999999] mb-3 truncate">{w.persona}</p>

                  <div className="flex flex-wrap gap-1.5">
                    {w.categories.map((c) => (
                      <span key={c} className="text-xs px-2.5 py-0.5 rounded-full bg-[#F0F0F0] text-[#666666]">{c}</span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            <nav className="flex items-center justify-center gap-1.5 mt-8 flex-wrap" aria-label="페이지 네비게이션">
              {safePage > 1 && (
                <Link href={qs(safePage - 1)} className="px-3 py-1.5 text-xs rounded-lg bg-white border border-[#EEEEEE] text-[#666666] hover:border-[#FF6E0D] hover:text-[#FF6E0D] transition-colors">
                  이전
                </Link>
              )}
              {pageNumbers(safePage, totalPages).map((p, i) =>
                p === "..." ? (
                  <span key={`e${i}`} className="px-2 text-xs text-[#CCCCCC]">…</span>
                ) : (
                  <Link
                    key={p}
                    href={qs(p as number)}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      p === safePage
                        ? "bg-[#FF6E0D] text-white font-semibold"
                        : "bg-white border border-[#EEEEEE] text-[#666666] hover:border-[#FF6E0D] hover:text-[#FF6E0D]"
                    }`}
                  >
                    {p}
                  </Link>
                ),
              )}
              {safePage < totalPages && (
                <Link href={qs(safePage + 1)} className="px-3 py-1.5 text-xs rounded-lg bg-white border border-[#EEEEEE] text-[#666666] hover:border-[#FF6E0D] hover:text-[#FF6E0D] transition-colors">
                  다음
                </Link>
              )}
            </nav>
          </>
        )}
      </div>
    </div>
  )
}

function pageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | "...")[] = [1]
  const lo = Math.max(2, current - 2)
  const hi = Math.min(total - 1, current + 2)
  if (lo > 2) out.push("...")
  for (let p = lo; p <= hi; p++) out.push(p)
  if (hi < total - 1) out.push("...")
  out.push(total)
  return out
}
