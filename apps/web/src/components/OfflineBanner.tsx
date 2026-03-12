"use client"

import { useOnline } from "@/hooks/useOnline"

export default function OfflineBanner() {
  const isOnline = useOnline()

  if (isOnline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gray-800 text-white text-center text-sm py-2 px-4">
      📴 오프라인 상태입니다. 인터넷 연결을 확인해주세요.
    </div>
  )
}
