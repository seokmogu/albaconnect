import Link from "next/link"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 text-white flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="text-6xl mb-4">⚡</div>
        <h1 className="text-4xl font-bold mb-3">AlbaConnect</h1>
        <p className="text-xl text-blue-100 mb-2">내 주변 알바, 지금 바로 매칭</p>
        <p className="text-blue-200 text-sm mb-12">
          카카오T처럼 빠르게. 구직자와 구인자를<br />실시간으로 연결합니다.
        </p>

        {/* Features */}
        <div className="grid grid-cols-1 gap-4 w-full max-w-sm mb-12">
          {[
            { icon: "📍", title: "위치 기반 매칭", desc: "반경 5km 내 실시간 연결" },
            { icon: "⏱️", title: "15초 수락 시스템", desc: "택시 배차처럼 빠른 매칭" },
            { icon: "🔒", title: "예치금 보호", desc: "플랫폼이 임금을 안전하게 보관" },
            { icon: "⭐", title: "양방향 평점", desc: "신뢰할 수 있는 매칭 품질" },
          ].map((f) => (
            <div key={f.title} className="bg-white/10 rounded-2xl p-4 text-left flex items-center gap-4">
              <span className="text-2xl">{f.icon}</span>
              <div>
                <div className="font-semibold">{f.title}</div>
                <div className="text-sm text-blue-200">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="w-full max-w-sm space-y-3">
          <Link href="/signup" className="block w-full bg-white text-blue-600 font-bold py-4 rounded-2xl text-center text-lg hover:bg-blue-50 transition-colors">
            시작하기
          </Link>
          <Link href="/login" className="block w-full bg-white/10 text-white font-semibold py-4 rounded-2xl text-center hover:bg-white/20 transition-colors">
            로그인
          </Link>
        </div>
      </div>

      <div className="text-center text-blue-300 text-xs py-4">
        © 2026 AlbaConnect. 건별·초단기·단기 노동 매칭 플랫폼
      </div>
    </div>
  )
}
