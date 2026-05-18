/**
 * /sim — 알바몬 커넥트 시뮬레이터 메인페이지.
 *
 * 구인자/구직자/관리자 진입을 분리해 안내한다. Albamon 톤앤매너.
 */
import Link from "next/link"
import { Store, User, LayoutDashboard, MapPin, Zap, ShieldCheck, Handshake } from "lucide-react"
import { loadEmployers, loadWorkers, loadDispatches } from "./_lib/data"

export const dynamic = "force-dynamic"

export default async function SimHomePage() {
  const [employers, workers, dispatches] = await Promise.all([
    loadEmployers(), loadWorkers(), loadDispatches(),
  ])
  const matched = dispatches.filter((d) => d.acceptedBy).length
  const matchRate = dispatches.length > 0 ? Math.round((matched / dispatches.length) * 100) : 0

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#1A1A1A]">
      {/* 히어로 */}
      <header className="bg-[#FF6E0D] text-white">
        <div className="max-w-3xl mx-auto px-6 py-12 text-center">
          <p className="text-sm font-black tracking-tight mb-2">알바몬 커넥트</p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold mb-4">
            <Zap size={12} /> 강남구 위치 기반 알바 매칭 시뮬레이터
          </div>
          <h1 className="text-3xl font-black leading-tight" style={{ wordBreak: "keep-all" }}>
            오늘 빠진 자리,<br />30초 안에 채워요
          </h1>
          <p className="text-sm text-white/80 mt-3" style={{ wordBreak: "keep-all" }}>
            긱·일일·단기·장기까지, 모든 고용형태를 구분해 매칭합니다.
          </p>
          {/* 라이브 지표 */}
          <div className="flex items-center justify-center gap-6 mt-6 text-sm">
            <Stat value={employers.length.toLocaleString()} label="사업장" />
            <Stat value={workers.length.toLocaleString()} label="구직자" />
            <Stat value={`${matchRate}%`} label="매칭률" />
          </div>
        </div>
      </header>

      {/* 진입 카드 */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h2 className="text-lg font-bold mb-4">어떤 분이신가요?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 구인자 */}
          <Link
            href="/sim/login/employer"
            className="group bg-white border border-[#EEEEEE] rounded-2xl p-6 hover:border-[#FF6E0D] hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-[#FF6E0D]/10 flex items-center justify-center mb-3">
              <Store size={24} className="text-[#FF6E0D]" />
            </div>
            <h3 className="font-bold text-[#1A1A1A]">사장님으로 시작</h3>
            <p className="text-sm text-[#666666] mt-1" style={{ wordBreak: "keep-all" }}>
              공고를 올리고 매칭 현황을 관리합니다
            </p>
            <span className="inline-block mt-3 text-sm font-semibold text-[#FF6E0D] group-hover:underline">
              사장님 로그인 →
            </span>
          </Link>

          {/* 구직자 */}
          <Link
            href="/sim/login/worker"
            className="group bg-white border border-[#EEEEEE] rounded-2xl p-6 hover:border-[#22C55E] hover:shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-[#22C55E]/10 flex items-center justify-center mb-3">
              <User size={24} className="text-[#22C55E]" />
            </div>
            <h3 className="font-bold text-[#1A1A1A]">워커로 시작</h3>
            <p className="text-sm text-[#666666] mt-1" style={{ wordBreak: "keep-all" }}>
              매칭 알림을 받고 스케줄을 관리합니다
            </p>
            <span className="inline-block mt-3 text-sm font-semibold text-[#22C55E] group-hover:underline">
              워커 로그인 →
            </span>
          </Link>
        </div>

        {/* 특징 */}
        <div className="grid grid-cols-3 gap-3 mt-8">
          <Feature icon={<MapPin size={18} />} title="위치 기반" desc="반경 내 즉시 매칭" />
          <Feature icon={<Zap size={18} />} title="30초 매칭" desc="6요소 알고리즘" />
          <Feature icon={<ShieldCheck size={18} />} title="토스 에스크로" desc="안전한 정산" />
        </div>

        {/* 용역 트랙 진입 */}
        <div className="mt-6">
          <Link
            href="/sim/service"
            className="group flex items-center justify-between bg-white border border-[#EEEEEE] rounded-2xl p-5 hover:border-[#FF6E0D] hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF6E0D]/10 flex items-center justify-center">
                <Handshake size={20} className="text-[#FF6E0D]" />
              </div>
              <div>
                <p className="font-bold text-[#1A1A1A] text-sm">용역 의뢰 둘러보기</p>
                <p className="text-xs text-[#888] mt-0.5" style={{ wordBreak: "keep-all" }}>
                  개인 간 도급 — 심부름·청소·조립·짐옮기기 등
                </p>
              </div>
            </div>
            <span className="text-sm font-semibold text-[#FF6E0D] group-hover:underline shrink-0">
              보러가기 →
            </span>
          </Link>
        </div>

        {/* 관리자 */}
        <div className="mt-8 text-center">
          <Link
            href="/sim/admin"
            className="inline-flex items-center gap-1.5 text-sm text-[#666666] hover:text-[#1A1A1A]"
          >
            <LayoutDashboard size={14} /> 관리자 관제 대시보드
          </Link>
        </div>
      </main>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-xl font-black">{value}</p>
      <p className="text-xs text-white/70">{label}</p>
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-xl p-4 text-center">
      <div className="w-9 h-9 rounded-lg bg-[#F5F6F8] flex items-center justify-center mx-auto mb-2 text-[#FF6E0D]">
        {icon}
      </div>
      <p className="text-sm font-bold text-[#1A1A1A]">{title}</p>
      <p className="text-xs text-[#999999] mt-0.5">{desc}</p>
    </div>
  )
}
