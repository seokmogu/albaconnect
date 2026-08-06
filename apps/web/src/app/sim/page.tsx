/**
 * /sim — 알바몬 커넥트 시뮬레이터 메인페이지.
 *
 * 두 수요 트랙을 동등하게 안내한다:
 *  - 고용형: 사업장 ↔ 워커 (근로계약, 알바몬 가시권)
 *  - 용역형: 개인 ↔ 개인 (도급계약, 비전문 일상 용역)
 * 공급(워커)은 두 트랙을 모두 수행하는 단일 풀이다.
 */
import Link from "next/link"
import { Store, User, LayoutDashboard, MapPin, Zap, ShieldCheck, Handshake } from "lucide-react"
import { loadEmployers, loadWorkers, loadDispatches, loadServiceRequests } from "./_lib/data"

export const dynamic = "force-dynamic"

export default async function SimHomePage() {
  const [employers, workers, dispatches, services] = await Promise.all([
    loadEmployers(), loadWorkers(), loadDispatches(), loadServiceRequests(),
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
            <Zap size={12} /> 강남구 위치 기반 일손 매칭 시뮬레이터
          </div>
          <h1 className="text-3xl font-black leading-tight" style={{ wordBreak: "keep-all" }}>
            필요한 일손,<br />30초 안에 연결해요
          </h1>
          <p className="text-sm text-white/80 mt-3" style={{ wordBreak: "keep-all" }}>
            사업장 알바부터 개인 심부름까지 — 한 곳에서 위치 기반으로 매칭합니다.
          </p>
          {/* 라이브 지표 */}
          <div className="flex items-center justify-center gap-6 mt-6 text-sm">
            <Stat value={employers.length.toLocaleString()} label="사업장" />
            <Stat value={workers.length.toLocaleString()} label="구직자" />
            <Stat value={services.length.toLocaleString()} label="용역 의뢰" />
            <Stat value={`${matchRate}%`} label="매칭률" />
          </div>
        </div>
      </header>

      {/* 두 트랙 안내 */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h2 className="text-lg font-bold mb-1">두 가지 일손 트랙</h2>
        <p className="text-sm text-[#666666] mb-4" style={{ wordBreak: "keep-all" }}>
          고용형은 사업장의 근로계약, 용역형은 개인 간 도급계약입니다. 워커는 양쪽 일감을 모두 받습니다.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 고용형 — 사장님 */}
          <EntryCard
            href="/sim/login/employer"
            icon={<Store size={24} />}
            accent="#FF6E0D"
            track="고용형"
            title="사장님으로 시작"
            desc="사업장 공고를 올리고 근로 매칭을 관리합니다"
            cta="사장님 로그인"
          />
          {/* 공급 — 워커 */}
          <EntryCard
            href="/sim/login/worker"
            icon={<User size={24} />}
            accent="#22C55E"
            track="일손 공급"
            title="워커로 시작"
            desc="사업장 알바·개인 용역 일감을 함께 받습니다"
            cta="워커 로그인"
          />
          {/* 용역형 — 개인 의뢰 */}
          <EntryCard
            href="/sim/service"
            icon={<Handshake size={24} />}
            accent="#FF6E0D"
            track="용역형"
            title="용역 의뢰 둘러보기"
            desc="개인 간 도급 — 심부름·청소·조립·짐옮기기"
            cta="용역 보러가기"
          />
        </div>

        {/* 특징 — 두 트랙 공통 */}
        <div className="grid grid-cols-3 gap-3 mt-8">
          <Feature icon={<MapPin size={18} />} title="위치 기반" desc="반경 내 즉시 매칭" />
          <Feature icon={<Zap size={18} />} title="30초 매칭" desc="6요소 알고리즘" />
          <Feature icon={<ShieldCheck size={18} />} title="토스 에스크로" desc="안전한 정산" />
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

function EntryCard({
  href, icon, accent, track, title, desc, cta,
}: {
  href: string
  icon: React.ReactNode
  accent: string
  track: string
  title: string
  desc: string
  cta: string
}) {
  return (
    <Link
      href={href}
      className="group bg-white border border-[#EEEEEE] rounded-2xl p-6 hover:border-[#CCCCCC] hover:shadow-md transition-all flex flex-col"
    >
      <div className="flex items-center justify-between mb-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          {icon}
        </div>
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${accent}1A`, color: accent }}
        >
          {track}
        </span>
      </div>
      <h3 className="font-bold text-[#1A1A1A]">{title}</h3>
      <p className="text-sm text-[#666666] mt-1 flex-1" style={{ wordBreak: "keep-all" }}>
        {desc}
      </p>
      <span
        className="inline-block mt-3 text-sm font-semibold group-hover:underline"
        style={{ color: accent }}
      >
        {cta} →
      </span>
    </Link>
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
