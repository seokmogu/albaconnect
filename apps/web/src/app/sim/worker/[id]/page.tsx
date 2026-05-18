/**
 * /sim/worker/[id] — 워커 상세 화면 (Albamon 톤앤매너)
 */
import Link from "next/link"
import { notFound } from "next/navigation"
import { loadWorkers, loadDispatches, loadPostings } from "../../_lib/data"
import { ChevronLeft, Star, CheckCircle, Bell, Briefcase, MapPin, User, Banknote, Clock, Users, Shield } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function WorkerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [workers, dispatches, postings] = await Promise.all([loadWorkers(), loadDispatches(), loadPostings()])
  const worker = workers.find((w) => w.id === id)
  if (!worker) notFound()

  const myDispatches = dispatches.filter((d) => d.rankedWorkerIds.includes(id))
  const accepted = myDispatches.filter((d) => d.acceptedBy === id)
  const pending = myDispatches.filter((d) => !d.acceptedBy)
  const postingById = new Map(postings.map((p) => [p.id, p]))

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#1A1A1A]">
      {/* Header */}
      <header className="bg-white border-b border-[#EEEEEE] px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/sim/worker"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#EEEEEE] text-[#666666] hover:bg-[#F5F6F8] transition-colors"
              aria-label="목록으로"
            >
              <ChevronLeft size={16} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-[#1A1A1A]">{worker.name}</h1>
              <p className="text-xs text-[#999999] flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1">
                  <Star size={10} className="text-[#F59E0B]" />
                  {worker.avgRating > 0 ? `${worker.avgRating} (${worker.ratingCount})` : "신규"}
                </span>
                <span>신뢰도 {Math.round(worker.completionRate * 100)}%</span>
                <span>{worker.categories.join(", ")}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-medium ${
              worker.available
                ? "bg-[#22C55E]/10 border-[#22C55E]/20 text-[#22C55E]"
                : "bg-[#F0F0F0] border-[#EEEEEE] text-[#999999]"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${worker.available ? "bg-[#22C55E]" : "bg-[#CCCCCC]"}`} />
              공고 수신 {worker.available ? "ON" : "OFF"}
            </div>
            <Link href="/sim/admin" className="px-3 py-1.5 rounded-lg border border-[#EEEEEE] text-[#666666] hover:bg-[#F5F6F8] transition-colors">
              관제
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: 알림 + 일감 */}
        <section className="lg:col-span-2 space-y-6">
          {/* 새 매칭 알림 */}
          <div>
            <h2 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-1.5">
              <Bell size={14} className="text-[#FF6E0D]" />
              새 매칭 알림 ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-[#EEEEEE] text-sm text-[#999999]">
                아직 받은 알림이 없습니다.
              </div>
            ) : (
              <ul className="space-y-3">
                {pending.slice(0, 5).map((d) => {
                  const p = postingById.get(d.postingId)
                  if (!p) return null
                  return (
                    <li key={d.postingId} className="bg-white border-2 border-[#FF6E0D]/30 rounded-xl p-5">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-[#1A1A1A]">{p.draft.title}</h3>
                        <span className="shrink-0 ml-2 text-xs px-2.5 py-1 rounded-full bg-[#FF6E0D] text-white font-semibold">30초 결정</span>
                      </div>
                      <p className="text-xs text-[#999999] mb-3">{p.employerName} · {p.draft.address}</p>
                      <div className="flex gap-4 text-xs text-[#666666] mb-4">
                        <span className="flex items-center gap-1">
                          <Banknote size={12} className="text-[#FF4D4D]" />
                          <span className="text-[#FF4D4D] font-bold">{p.draft.hourlyRate.toLocaleString()}원</span>/h
                        </span>
                        <span className="flex items-center gap-1"><Clock size={12} />{p.draft.durationHours}시간</span>
                        <span className="flex items-center gap-1"><Users size={12} />{p.draft.headcount}명 모집</span>
                      </div>
                      <div className="flex gap-2">
                        <button className="flex-1 py-2.5 bg-[#FF6E0D] text-white rounded-lg font-bold text-sm hover:bg-[#E55E00] transition-colors">
                          수락
                        </button>
                        <button className="flex-1 py-2.5 bg-[#F0F0F0] text-[#666666] rounded-lg font-bold text-sm hover:bg-[#E5E5E5] transition-colors">
                          거절
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* 진행 중 일감 */}
          <div>
            <h2 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-1.5">
              <Briefcase size={14} className="text-[#22C55E]" />
              진행 중 일감 ({accepted.length})
            </h2>
            {accepted.length === 0 ? (
              <div className="p-6 text-center bg-white rounded-xl border border-[#EEEEEE] text-sm text-[#999999]">
                진행 중인 일감 없음
              </div>
            ) : (
              <ul className="space-y-3">
                {accepted.map((d) => {
                  const p = postingById.get(d.postingId)
                  if (!p) return null
                  return (
                    <li key={d.postingId} className="bg-white border border-[#22C55E]/30 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-bold text-[#1A1A1A]">{p.draft.title}</h3>
                        <span className="flex items-center gap-1 text-xs text-[#22C55E] font-semibold">
                          <CheckCircle size={12} />확정
                        </span>
                      </div>
                      <p className="text-xs text-[#999999] mb-2">{p.employerName}</p>
                      <p className="text-sm font-bold text-[#FF4D4D]">
                        예상 정산 {(p.draft.hourlyRate * p.draft.durationHours).toLocaleString()}원
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Right: 페르소나 + 정산 */}
        <aside className="space-y-4">
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-1.5">
              <MapPin size={14} className="text-[#FF6E0D]" />위치
            </h3>
            <p className="text-xs text-[#CCCCCC] font-mono">{worker.location.lat.toFixed(4)}, {worker.location.lng.toFixed(4)}</p>
          </div>
          <div className="bg-white border border-[#EEEEEE] rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-3 flex items-center gap-1.5">
              <User size={14} className="text-[#FF6E0D]" />페르소나
            </h3>
            <p className="text-xs text-[#666666] leading-relaxed">{worker.persona}</p>
          </div>
          <div className="bg-[#22C55E]/8 border border-[#22C55E]/20 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#22C55E] mb-2 flex items-center gap-1.5">
              <Shield size={14} />정산 안심
            </h3>
            <p className="text-xs text-[#22C55E] leading-relaxed">
              토스 에스크로 예치 후 근무 완료 확인 시 즉시 지급. 당일 또는 익일 입금.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
