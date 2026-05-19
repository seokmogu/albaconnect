"use client"

import type React from "react"
import { copy } from "../_content/copy"
import { Button } from "@/components/ui/Button"

export function ForEmployers() {
  const { sectionTitle, headline, painPoints, solutions, cta, positioning } = copy.forEmployers
  const lines = headline.split("\n")

  return (
    <section
      id="for-employers"
      aria-labelledby="employers-title"
      className="bg-surface py-16 md:py-20 lg:py-24"
    >
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
        {/* Eyebrow */}
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-4 fade-up">
          {sectionTitle}
        </p>
        <h3
          className="text-xl md:text-2xl font-semibold text-secondary leading-snug mb-10 max-w-3xl fade-up"
          style={{ wordBreak: "keep-all" }}
        >
          {positioning}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Pain points — left */}
          <div className="bg-slate-50 dark:bg-[#111827] rounded-xl p-6 fade-up">
            <h2
              id="employers-title"
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
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-error mt-0.5 flex-shrink-0">
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
          <div className="border-l-4 border-primary pl-6 fade-up" style={{ "--index": 1 } as React.CSSProperties}>
            <ul aria-label="알바몬 커넥트 해결책" className="flex flex-col gap-4 mb-8">
              {solutions.map((sol) => (
                <li key={sol} className="flex items-start gap-3">
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent mt-0.5 flex-shrink-0">
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
              className="w-full md:w-auto"
              onClick={() => {
                const el = document.getElementById("final-cta")
                el?.scrollIntoView({ behavior: "smooth" })
              }}
            >
              {cta}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
