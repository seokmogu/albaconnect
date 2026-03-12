"use client"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="text-center card max-w-sm w-full py-10">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">오류가 발생했습니다</h2>
        <p className="text-gray-500 text-sm mb-6">{error.message || "잠시 후 다시 시도해주세요"}</p>
        <button onClick={reset} className="btn-primary w-auto px-8 mx-auto">다시 시도</button>
      </div>
    </div>
  )
}
