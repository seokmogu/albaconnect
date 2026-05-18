import type React from "react"
import { copy } from "../_content/copy"

const pillarIcons = [
  // Shield
  <svg key="shield" width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>,
  // ArrowLeftRight
  <svg key="review" width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary">
    <polyline points="17 8 21 12 17 16" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <polyline points="7 8 3 12 7 16" />
  </svg>,
  // Handshake (approximated with two hands meeting)
  <svg key="dispute" width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary">
    <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 0C1.46 6.7 1.33 10.28 4 13l8 8 8-8c2.67-2.72 2.54-6.3.42-8.42z" />
  </svg>,
]

export function TrustSafety() {
  const { sectionTitle, sectionSubtitle, pillars } = copy.trustSafety

  return (
    <section
      aria-labelledby="trust-title"
      className="bg-secondary py-16 md:py-20 lg:py-24"
    >
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
        <div className="text-center mb-12 fade-up">
          <h2
            id="trust-title"
            className="text-2xl md:text-3xl font-bold text-white leading-tight mb-3"
          >
            {sectionTitle}
          </h2>
          <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-xl mx-auto">
            {sectionSubtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {pillars.map((pillar, i) => (
            <article
              key={pillar.title}
              className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col gap-4 h-full fade-up"
              style={{ "--index": i } as React.CSSProperties}
            >
              {pillarIcons[i]}
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-white font-semibold text-lg leading-snug">{pillar.title}</h3>
                {i === 0 && (
                  <span className="inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-semibold bg-accent/20 text-accent">
                    토스 에스크로
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">{pillar.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
