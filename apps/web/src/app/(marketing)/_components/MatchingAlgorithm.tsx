import type React from "react"
import { copy } from "../_content/copy"

const factorIcons = [
  // MapPin
  <svg key="dist" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary flex-shrink-0">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
  </svg>,
  // Star
  <svg key="star" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary flex-shrink-0">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>,
  // Briefcase
  <svg key="brief" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary flex-shrink-0">
    <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>,
  // ShieldCheck
  <svg key="shield" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary flex-shrink-0">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
  </svg>,
  // Clock
  <svg key="clock" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary flex-shrink-0">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>,
  // Activity
  <svg key="act" width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary flex-shrink-0">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>,
]

export function MatchingAlgorithm() {
  const { sectionTitle, sectionSubtitle, factors, highlightFactor } = copy.matchingAlgorithm

  const left = factors.slice(0, 3)
  const right = factors.slice(3)

  return (
    <section
      id="matching"
      aria-labelledby="matching-title"
      className="bg-secondary py-16 md:py-20 lg:py-24 relative overflow-hidden"
    >
      {/* Decorative radius circle */}
      <div
        className="absolute -right-32 top-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full border border-white/10 opacity-10 pointer-events-none"
        aria-hidden="true"
      />

      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-12 fade-up">
          <h2
            id="matching-title"
            className="text-2xl md:text-3xl font-bold text-white leading-tight mb-3"
          >
            {sectionTitle}
          </h2>
          <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-xl mx-auto">
            {sectionSubtitle}
          </p>
        </div>

        {/* Highlight factor — large infographic */}
        <div className="mb-12 mx-auto max-w-2xl rounded-xl border border-white/10 bg-white/5 px-6 py-8 text-center fade-up">
          <div className="flex items-baseline justify-center gap-1">
            <span className="font-mono text-6xl md:text-7xl font-bold text-primary leading-none">
              {highlightFactor.value}
            </span>
            <span className="font-mono text-3xl md:text-4xl font-bold text-primary leading-none">
              {highlightFactor.unit}
            </span>
          </div>
          <p className="mt-3 text-white text-sm md:text-base font-medium">
            {highlightFactor.name}
          </p>
          <p
            className="mt-1 text-slate-400 text-xs md:text-sm"
            style={{ wordBreak: "keep-all" }}
          >
            {highlightFactor.caption}
          </p>
        </div>

        {/* Factors grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[left, right].map((col, ci) => (
            <div key={ci} className="flex flex-col gap-6">
              {col.map((factor, fi) => {
                const globalIndex = ci * 3 + fi
                return (
                  <div
                    key={factor.name}
                    className="fade-up"
                    style={{ "--index": globalIndex } as React.CSSProperties}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      {factorIcons[globalIndex]}
                      <span className="text-white text-sm font-medium">{factor.name}</span>
                      <span className="font-mono text-primary text-2xl font-semibold ml-auto">
                        {factor.weight}%
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-2">
                      <div
                        role="progressbar"
                        aria-valuenow={factor.weight}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${factor.name} 가중치 ${factor.weight}%`}
                        className="h-full rounded-full bg-primary transition-all duration-700"
                        style={{ width: `${factor.weight}%` }}
                      />
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed">{factor.description}</p>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
