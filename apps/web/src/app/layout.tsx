import type { Metadata, Viewport } from "next"
import "./globals.css"
import OfflineBanner from "@/components/OfflineBanner"

export const metadata: Metadata = {
  title: "AlbaConnect - 위치 기반 알바 매칭",
  description: "지금 내 주변의 알바 구직자/구인자를 실시간으로 연결합니다",
  manifest: "/manifest.json",
  icons: { apple: "/icon-192.png" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#3b82f6",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 max-w-md mx-auto min-h-screen">
        <OfflineBanner />
        {children}
      </body>
    </html>
  )
}
