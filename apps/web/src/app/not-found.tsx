import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">페이지를 찾을 수 없습니다</h2>
        <p className="text-gray-500 mb-6">요청하신 페이지가 존재하지 않습니다</p>
        <Link href="/" className="btn-primary w-auto px-8 inline-block">홈으로</Link>
      </div>
    </div>
  )
}
