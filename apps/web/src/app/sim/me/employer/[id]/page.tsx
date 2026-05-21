/**
 * /sim/me/employer/[id] — 구인자 마이페이지 (Albamon 톤앤매너, 모바일 우선)
 */
import Link from "next/link"
import { notFound } from "next/navigation"
import { loadEmployers, loadPostings, loadDispatches, loadWorkers, EMPLOYMENT_LABEL } from "../../../_lib/data"
import { getLegal, LEGAL_GRADE_STYLE } from "../../../_lib/legal"
import { ChevronLeft, Store, MapPin, Star, Tag, Banknote, Clock, Users, CheckCircle, AlertCircle, Circle, User, AlertTriangle } from "lucide-react"

const EMPLOYMENT_COLOR: Record<string, string> = {
  gig: "#FF6E0D",
  daily: "#3B82F6",
  short: "#A855F7",
  long: "#22C55E",
}

export const dynamic = "force-dynamic"

export default async function EmployerMyPage({ params }: { params: Promise<{ id: string }> }) {
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
    <div className="min-h-screen bg-[#F5F6F8] text-[#1A1A1A] pb-24">
      {/* 모바일 헤더 */}
      <header className="bg-[#FF6E0D] text-white px-5 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <Link href="/sim/me" className="flex items-center gap-1 text-xs text-white/80 hover:text-white transition-colors">
            <ChevronLeft size={14} />다른 계정
          </Link>
          <span className="text-xs px-2.5 py-1 rounded-full bg-white/20 font-semibold">사장님 모드</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Store size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black">{employer.name}</h1>
            <p className="text-xs text-white/70 flex items-center gap-1 mt-0.5">
              <MapPin size={10} />{employer.nearestHub} · {employer.dong}
              <Star size={10} className="ml-1 text-yellow-300" />{employer.avgRating}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-4 gap-2">
          <Kpi label="공고" value={postings.length} />
          <Kpi label="Dispatch" value={myDispatches.length} />
          <Kpi label="매칭" value={matched} accent="#22C55E" />
          <Kpi label="예산(만)" value={Math.round(employer.monthlyJobBudget / 10000)} />
        </div>

        {/* 매칭 현황 배너 */}
        {matched > 0 ? (
          <div className="bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-xl p-4 flex items-start gap-2">
            <CheckCircle size={16} className="text-[#22C55E] shrink-0 mt-0.5" />
            <p className="text-sm text-[#22C55E] font-medium">
              공고 {postings.length}건 중 <span className="font-black">{matched}건</span>이 워커와 매칭 확정됐어요.
            </p>
          </div>
        ) : (
          <div className="bg-[#F0F0F0] border border-[#EEEEEE] rounded-xl p-4 flex items-start gap-2">
            <AlertCircle size={16} className="text-[#999999] shrink-0 mt-0.5" />
            <p className="text-sm text-[#999999]">아직 매칭된 공고가 없습니다.</p>
          </div>
        )}

        {/* 공고 목록 */}
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-1.5">
            <Tag size={14} className="text-[#FF6E0D]" />내 공고 ({postings.length})
          </h2>
          {postings.length === 0 ? (
            <div className="p-6 text-center bg-white rounded-xl border border-[#EEEEEE] text-sm text-[#999999]">
              등록된 공고가 없습니다.
            </div>
          ) : (
            <ul className="space-y-3">
              {postings.map((p) => {
                const dispatch = myDispatches.find((d) => d.postingId === p.id)
                const acceptedWorker = dispatch?.acceptedBy ? workerById.get(dispatch.acceptedBy) : null
                const legal = getLegal(p.draft.category)
                const gs = LEGAL_GRADE_STYLE[legal.grade]
                return (
                  <li key={p.id} className="bg-white border border-[#EEEEEE] rounded-xl p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-bold text-[#1A1A1A] text-sm leading-tight">{p.draft.title}</h3>
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gs.badge}`}>{gs.label}</span>
                          {legal.grade !== "A" && legal.warning && (
                            <span className="flex items-center gap-0.5 text-[10px] text-yellow-600" title={legal.warning}>
                              <AlertTriangle size={10} />{legal.warning}
                            </span>
                          )}
                        </div>
                      </div>
                      {acceptedWorker ? (
                        <span className="shrink-0 ml-2 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#22C55E]/10 text-[#22C55E] font-semibold">
                          <CheckCircle size={10} />매칭
                        </span>
                      ) : dispatch ? (
                        <span className="shrink-0 ml-2 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#F59E0B]/10 text-[#F59E0B] font-semibold">
                          <AlertCircle size={10} />대기
                        </span>
                      ) : (
                        <span className="shrink-0 ml-2 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[#F0F0F0] text-[#999999]">
                          <Circle size={10} />대기전
                        </span>
                      )}
                    </div>
                    {p.employmentType && (
                      <span
                        className="inline-block text-xs font-bold px-2 py-0.5 rounded mb-2"
                        style={{
                          color: EMPLOYMENT_COLOR[p.employmentType],
                          backgroundColor: `${EMPLOYMENT_COLOR[p.employmentType]}1A`,
                        }}
                      >
                        {EMPLOYMENT_LABEL[p.employmentType]}
                      </span>
                    )}
                    <div className="flex gap-3 text-xs text-[#666666] mb-2">
                      <span className="flex items-center gap-1">
                        <Banknote size={11} className="text-[#FF4D4D]" />
                        <span className="text-[#FF4D4D] font-bold">{p.draft.hourlyRate.toLocaleString()}원</span>
                      </span>
                      <span className="flex items-center gap-1"><Clock size={11} />{p.draft.durationHours}h</span>
                      <span className="flex items-center gap-1"><Users size={11} />{p.draft.headcount}명</span>
                    </div>
                    {acceptedWorker && (
                      <div className="mt-2 pt-2 border-t border-[#F0F0F0] flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#F0F0F0] flex items-center justify-center">
                          <User size={12} className="text-[#999999]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#1A1A1A]">{acceptedWorker.name}</p>
                          <p className="text-xs text-[#999999] flex items-center gap-1">
                            <Star size={9} className="text-[#F59E0B]" />{acceptedWorker.avgRating} ({acceptedWorker.ratingCount}) · 신뢰도 {Math.round(acceptedWorker.completionRate * 100)}%
                          </p>
                        </div>
                      </div>
                    )}
                    {dispatch?.acceptedReason && (
                      <p className="text-xs text-[#22C55E] mt-2 italic">&quot;{dispatch.acceptedReason}&quot;</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* 하단 탭바 (모바일) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#EEEEEE] z-20">
        <div className="max-w-lg mx-auto grid grid-cols-4">
          <TabItem icon={<Store size={20} />} label="공고" active />
          <TabItem icon={<CheckCircle size={20} />} label="매칭" />
          <TabItem icon={<Banknote size={20} />} label="정산" />
          <TabItem icon={<User size={20} />} label="내정보" />
        </div>
      </nav>
    </div>
  )
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-3 text-center">
      <p className="text-lg font-black" style={{ color: accent ?? "#1A1A1A" }}>{value.toLocaleString()}</p>
      <p className="text-xs text-[#999999] mt-0.5">{label}</p>
    </div>
  )
}

function TabItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center py-2.5 gap-0.5 ${active ? "text-[#FF6E0D]" : "text-[#CCCCCC]"}`}>
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </div>
  )
}
