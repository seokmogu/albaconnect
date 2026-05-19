"use client"

import type React from "react"
import { copy } from "../_content/copy"
import { Button } from "@/components/ui/Button"

export function ForWorkers() {
  const { sectionTitle, headline, painPoints, solutions, cta, payoutHighlight } = copy.forWorkers
  const lines = headline.split("\n")

  return (
    <section
      id="for-workers"
      aria-labelledby="workers-title"
      className="bg-white py-16 md:py-20 lg:py-24"
    >
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
        {/* Eyebrow */}
        <p className="text-xs font-semibold uppercase tracking-widest text-accent mb-4 fade-up">
          {sectionTitle}
        </p>
        <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 mb-8 fade-up">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
            <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span className="text-sm font-semibold text-accent" style={{ wordBreak: "keep-all" }}>
            {payoutHighlight}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Solutions — left (reversed from ForEmployers) */}
          <div className="border-l-4 border-accent pl-6 fade-up">
            <h2
              id="workers-title"
              className="text-2xl md:text-3xl font-bold text-secondary leading-tight mb-6"
            >
              {lines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < lines.length - 1 && <br />}
                </span>
              ))}
            </h2>
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
              variant="secondary"
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

          {/* Pain points — right */}
          <div className="bg-slate-50 dark:bg-[#111827] rounded-xl p-6 fade-up" style={{ "--index": 1 } as React.CSSProperties}>
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
        </div>
      </div>
    </section>
  )
}
