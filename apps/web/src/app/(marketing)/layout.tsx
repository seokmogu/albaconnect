import type { Metadata } from "next"
import { Footer } from "./_components/Footer"
import { Header } from "./_components/Header"
import { pocContent } from "./_content/poc"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://albaconnect.dev.jobko.io"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: pocContent.meta.title,
  description: pocContent.meta.description,
  openGraph: {
    title: pocContent.meta.title,
    description: pocContent.meta.description,
    url: siteUrl,
    siteName: "알바몬 커넥트",
    locale: "ko_KR",
    type: "website",
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-brand-sm focus:bg-fill-element-brand focus:px-4 focus:py-2 focus:font-semibold focus:text-typography-static-white"
      >
        본문 바로가기
      </a>
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen overflow-x-hidden bg-background-subtle">
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
      </div>
    </>
  )
}
