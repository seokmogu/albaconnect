/**
 * /sim/employer/[id] — 사장님 상세 화면 (Albamon 톤앤매너)
 */
import Link from "next/link"
import { notFound } from "next/navigation"
import { loadEmployers, loadPostings, loadDispatches, loadWorkers } from "../../_lib/data"
import { ChevronLeft, MapPin, Star, Banknote, Clock, Users, Tag, CheckCircle, AlertCircle, Circle, User } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function EmployerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [employers, allPostings, dispatches, workers] = await Promise.all([
    loadEmployers(), loadPostings(), loadDispatches(), loadWorkers(),
  ])
  const employer = employers.find((e) => e.id === id)
  if (!employer) notFound()

  const postings = allPostings.filter((p) => p.employerId === id)
  const myDispatches = dispatches.filter((d) => postings.some((p) => p.id === d.postingId))
  const matched = myDispatches.filter((d) => d.acceptedBy).length
  const workerById = new Map(workers.map((w) => [w.id, w]))

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#1A1A1A]">
      {/* Header */}
      <header className="bg-white border-b border-[#EEEEEE] px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/sim/employer"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#EEEEEE] text-[#666666] hover:bg-[#F5F6F8] transition-colors"
              aria-label="목록으로"
            >
              <ChevronLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-[#1A1A1A]">{employer.name}</h1>
              <p className="text-xs text-[#999999] flex items-center gap-1 mt-0.5">
                <MapPin size={10} />{employer.nearestHub} · {employer.dong}
                <span className="mx-1">·</span>
                <Star size={10} className="text-[#F59E0B]" />{employer.avgRating} ({employer.reviewCount})
                <span className="mx-1">·</span>
                {employer.category}
              </p>
            </div>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-[#22C55E]/10 text-[#22C55E] font-semibold border border-[#22C55E]/20">
              사장님 모드
            </span>
            <Link href="/sim/admin" className="px-3 py-1.5 rounded-lg border border-[#EEEEEE] text-[#666666] hover:bg-[#F5F6F8] transition-colors">
              관제
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: KPI + 공고 */}
        <section className="lg:col-span-2 space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-4 gap-3">
            <Kpi label="활성 공고" value={postings.length} unit="건" />
            <Kpi label="Dispatch" value={myDispatches.length} unit="회" />
            <Kpi label="매칭 확정" value={matched} unit="건" accent="#22C55E" />
            <Kpi label="월 예산" value={Math.round(employer.monthlyJobBudget / 10000)} unit="만원" />
          </div>

          {/* 공고 목록 */}
          <div>
            <h2 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-1.5">
              <Tag size={14} className="text-[#FF6E0D]" />
              진행 중인 공고 ({postings.length})
            </h2>
            {postings.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-[#EEEEEE] text-sm text-[#999999]">
                아직 등록된 공고가 없습니다.
              </div>
            ) : (
              <ul className="space-y-3">
                {postings.map((p) => {
                  const dispatch = myDispatches.find((d) => d.postingId === p.id)
                  const acceptedWorker = dispatch?.acceptedBy ? workerById.get(dispatch.acceptedBy) : null
                  return (
                    <li key={p.id} className="bg-white border border-[#EEEEEE] rounded-xl p-5">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-[#1A1A1A] text-base">{p.draft.title}</h3>
                        {acceptedWorker ? (
                          <span className="shrink-0 ml-2 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#22C55E]/10 text-[#22C55E] font-semibold">
                            <CheckCircle size={11} />매칭 확정
                          </span>
                        ) : dispatch ? (
                          <span className="shrink-0 ml-2 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#F59E0B]/10 text-[#F59E0B] font-semibold">
                            <AlertCircle size={11} />응답 대기
                          </span>
                        ) : (
                          <span className="shrink-0 ml-2 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#F0F0F0] text-[#999999]">
                            <Circle size={11} />Dispatch 전
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#999999] mb-3 italic">"{p.rawText}"</p>
                      <div className="flex flex-wrap gap-4 text-xs text-[#666666] mb-3">
                        <span className="flex items-center gap-1">
                          <Banknote size={12} className="text-[#FF4D4D]" />
                          <span className="text-[#FF4D4D] font-bold">{p.draft.hourlyRate.toLocaleString()}원</span>/h
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />{p.draft.durationHours}시간
                        </span>
                        <span className="flex items-center gap-1">
                          <Users size={12} />{p.draft.headcount}명
                        </span>
                        <span className="flex items-center gap-1">
                          <Tag size={12} />{p.draft.category}
                        </span>
                      </div>
                      {(p.draft.tags ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {p.draft.tags.map((t) => (
                            <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-[#F0F0F0] text-[#666666]">{t}</span>
                          ))}
                        </div>
                      )}
                      {acceptedWorker && (
                        <div className="mt-3 pt-3 border-t border-[#F0F0F0]">
                          <p className="text-xs text-[#999999] mb-1">매칭된 워커</p>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#F0F0F0] flex items-center justify-center">
                              <User size={14} className="text-[#999999]" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-[#1A1A1A]">{acceptedWorker.name}</p>
                              <p className="text-xs text-[#999999] flex items-center gap-1">
                                <Star size={10} className="text-[#F59E0B]" />
                                {acceptedWorker.avgRating} ({acceptedWorker.ratingCount}) · 신뢰도 {Math.round(acceptedWorker.completionRate * 100)}%
                              </p>
                            </div>
                          </div>
                          {dispatch?.acceptedReason && (
                            <p className="text-xs text-[#22C55E] mt-2 italic">"{dispatch.acceptedReason}"</p>
                          )}
                          {typeof dispatch?.acceptedSecondsToDecide === "number" && (
                            <p className="text-xs text-[#CCCCCC] mt-0.5">수락까지 {dispatch.acceptedSecondsToDecide}초</p>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-[#CCCCCC] mt-3">
                        등록: {new Date(p.createdAt).toLocaleString("ko-KR")} · confidence {p.draft.confidence}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Right: 매장 정보 */}
        <aside className="space-y-4">
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-1.5">
              <MapPin size={14} className="text-[#FF6E0D]" />위치
            </h3>
            <p className="text-sm text-[#333333] font-medium">{employer.nearestHub}</p>
            <p className="text-xs text-[#999999] mt-0.5">{employer.dong}</p>
            <p className="text-xs text-[#CCCCCC] font-mono mt-2">{employer.location.lat.toFixed(4)}, {employer.location.lng.toFixed(4)}</p>
          </div>
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-3">매장 페르소나</h3>
            <p className="text-xs text-[#666666] leading-relaxed word-break-keep-all">{employer.persona}</p>
          </div>
          <div className="bg-[#22C55E]/8 border border-[#22C55E]/20 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#22C55E] mb-2 flex items-center gap-1.5">
              <CheckCircle size={14} />매칭 현황
            </h3>
            <p className="text-xs text-[#22C55E] leading-relaxed word-break-keep-all">
              {matched > 0
                ? `공고 ${postings.length}건 중 ${matched}건이 워커와 매칭 확정됐어요.`
                : "아직 매칭된 공고가 없습니다."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Kpi({ label, value, unit, accent }: { label: string; value: number; unit: string; accent?: string }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-4">
      <p className="text-xs text-[#999999] mb-1">{label}</p>
      <p className="flex items-baseline gap-1">
        <span className="text-xl font-bold" style={{ color: accent ?? "#1A1A1A" }}>{value.toLocaleString()}</span>
        <span className="text-xs text-[#CCCCCC]">{unit}</span>
      </p>
    </div>
  )
}
