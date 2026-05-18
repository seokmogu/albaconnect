import type { Metadata } from "next"
import Script from "next/script"
import { Header } from "./_components/Header"
import { Footer } from "./_components/Footer"
import { copy } from "./_content/copy"

export const metadata: Metadata = {
  title: copy.meta.siteTitle,
  description: copy.meta.metaDescription,
  openGraph: {
    title: copy.meta.ogTitle,
    description: copy.meta.ogDescription,
    url: "https://albaconnect.kr",
    siteName: "AlbaConnect",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: copy.meta.ogTitle,
    description: copy.meta.ogDescription,
    images: ["/og.png"],
  },
  alternates: {
    canonical: "https://albaconnect.kr",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://albaconnect.kr/#org",
      name: "AlbaConnect (주)",
      url: "https://albaconnect.kr",
      logo: "https://albaconnect.kr/og.png",
      contactPoint: {
        "@type": "ContactPoint",
        email: "hello@albaconnect.kr",
        contactType: "customer service",
        availableLanguage: "Korean",
      },
    },
    {
      "@type": "Service",
      "@id": "https://albaconnect.kr/#service",
      name: "AlbaConnect 위치 기반 초단기 알바 매칭",
      description: copy.meta.metaDescription,
      provider: { "@id": "https://albaconnect.kr/#org" },
      areaServed: { "@type": "Country", name: "South Korea" },
      serviceType: "Job Matching Platform",
    },
    {
      "@type": "FAQPage",
      "@id": "https://albaconnect.kr/#faq",
      mainEntity: copy.faq.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
    },
  ],
}

interface MarketingLayoutProps {
  children: React.ReactNode
}

export default function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <>
      <Script
        id="json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-md focus:font-semibold"
      >
        본문 바로가기
      </a>
      {/* Root layout body is capped at max-w-md for the PWA app routes.
          Marketing pages need full viewport width — escape with a viewport
          wrapper that breaks out of the parent's max-width constraint. */}
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen overflow-x-hidden">
        <Header />
        <main id="main-content">{children}</main>
        <Footer />
      </div>
    </>
  )
}
