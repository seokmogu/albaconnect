"use client"

// 용역형(개인 C2C 도급) 트랙 소개 섹션.
// 고용형(근로계약)과 구분하기 위해 법적 고지(legalNote)를 섹션 하단에 고정 노출.
import type React from "react"
import { useRouter } from "next/navigation"
import { copy } from "../_content/copy"
import { Button } from "@/components/ui/Button"

export function ForGigService() {
  const router = useRouter()
  const {
    sectionTitle,
    eyebrow,
    headline,
    legalNote,
    useCases,
    painPoints,
    solutions,
    cta,
    contractBadge,
  } = copy.forGigService
  const lines = headline.split("\n")

  return (
    <section
      id="for-gig-service"
      aria-labelledby="gig-service-title"
      className="bg-surface py-16 md:py-20 lg:py-24"
    >
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
        {/* Eyebrow + 도급 뱃지 */}
        <div className="flex flex-wrap items-center gap-3 mb-4 fade-up">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#FF4D4D]">
            {sectionTitle}
          </p>
          {/* 도급계약 법적 구분 뱃지 */}
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FF4D4D]/10 px-3 py-1 text-xs font-semibold text-[#FF4D4D]">
            <svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {contractBadge}
          </span>
        </div>

        <p
          className="text-sm font-medium text-secondary-light mb-2 fade-up"
          style={{ wordBreak: "keep-all" }}
        >
          {eyebrow}
        </p>

        {/* 용도 태그 목록 */}
        <div className="flex flex-wrap gap-2 mb-8 fade-up">
          {useCases.map((uc) => (
            <span
              key={uc}
              className="inline-block rounded-full bg-[#F5F6F8] dark:bg-white/10 px-3 py-1 text-xs text-secondary font-medium"
            >
              {uc}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Pain points — left */}
          <div className="bg-slate-50 dark:bg-[#111827] rounded-xl p-6 fade-up">
            <h2
              id="gig-service-title"
              className="text-2xl md:text-3xl font-bold text-secondary leading-tight mb-6"
            >
              {lines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < lines.length - 1 && <br />}
                </span>
              ))}
            </h2>
            <ul aria-label="기존 문제" className="flex flex-col gap-4">
              {painPoints.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-error mt-0.5 flex-shrink-0"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <span className="text-sm text-secondary-light leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions — right */}
          <div
            className="border-l-4 border-[#FF4D4D] pl-6 fade-up"
            style={{ "--index": 1 } as React.CSSProperties}
          >
            <ul aria-label="알바몬 커넥트 해결책" className="flex flex-col gap-4 mb-8">
              {solutions.map((sol) => (
                <li key={sol} className="flex items-start gap-3">
                  <svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="text-accent mt-0.5 flex-shrink-0"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span className="text-sm text-secondary leading-relaxed">{sol}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="primary"
              size="md"
              className="w-full md:w-auto bg-[#FF4D4D] hover:bg-[#e53e3e] ring-[#FF4D4D]/40"
              onClick={() => router.push("/signup?role=employer")}
            >
              {cta}
            </Button>
          </div>
        </div>

        {/* 법적 고지 — 근로계약과의 혼동 방지 필수 노출 */}
        <p
          className="mt-8 text-xs text-secondary-light/70 leading-relaxed border-t border-slate-200 dark:border-white/10 pt-4 fade-up"
          style={{ wordBreak: "keep-all" }}
        >
          {legalNote}
        </p>
      </div>
    </section>
  )
}
