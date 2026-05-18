/**
 * /sim/login/employer — 구인자(사장님) 로그인.
 *
 * 시뮬 환경: 비밀번호는 검증하지 않고 ID로 컨텍스트를 고정한다.
 * 폼 제출은 /sim/me/employer?id=... 로 가고, 거기서 ID 검증 후 마이페이지로 리다이렉트.
 */
import Link from "next/link"
import { Store, ChevronLeft } from "lucide-react"
import { loadEmployers } from "../../_lib/data"

export const dynamic = "force-dynamic"

export default async function EmployerLoginPage() {
  const employers = await loadEmployers()
  const samples = employers.slice(0, 5)

  return (
    <div className="min-h-screen bg-[#F5F6F8] text-[#1A1A1A] flex flex-col">
      {/* 헤더 */}
      <header className="bg-[#FF6E0D] text-white px-5 py-4">
        <Link href="/sim" className="flex items-center gap-1 text-xs text-white/80 hover:text-white">
          <ChevronLeft size={14} /> 메인으로
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-[#FF6E0D]/10 flex items-center justify-center mx-auto mb-3">
              <Store size={28} className="text-[#FF6E0D]" />
            </div>
            <h1 className="text-xl font-black">사장님 로그인</h1>
            <p className="text-sm text-[#666666] mt-1">내 매장 공고와 매칭을 관리하세요</p>
          </div>

          <form action="/sim/me/employer" className="bg-white border border-[#EEEEEE] rounded-2xl p-5 space-y-3">
            <div>
              <label htmlFor="id" className="text-xs font-semibold text-[#666666]">사업장 ID</label>
              <input
                id="id"
                name="id"
                placeholder="emp-001"
                className="w-full mt-1 border border-[#E5E5E5] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#FF6E0D]"
              />
            </div>
            <div>
              <label htmlFor="pw" className="text-xs font-semibold text-[#666666]">비밀번호</label>
              <input
                id="pw"
                name="pw"
                type="password"
                placeholder="시뮬 환경 — 아무 값"
                className="w-full mt-1 border border-[#E5E5E5] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#FF6E0D]"
              />
            </div>
            <button className="w-full py-3 bg-[#FF6E0D] text-white rounded-lg font-bold text-sm">
              로그인
            </button>
          </form>

          {/* 샘플 계정 */}
          <div className="mt-5">
            <p className="text-xs text-[#999999] mb-2">샘플 계정으로 바로 로그인</p>
            <div className="flex flex-wrap gap-1.5">
              {samples.map((e) => (
                <Link
                  key={e.id}
                  href={`/sim/me/employer/${e.id}`}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-[#EEEEEE] hover:border-[#FF6E0D] transition-colors"
                >
                  {e.id} · {e.name.slice(0, 10)}
                </Link>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-[#999999] mt-6">
            워커이신가요? <Link href="/sim/login/worker" className="text-[#22C55E] font-semibold">워커 로그인</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
