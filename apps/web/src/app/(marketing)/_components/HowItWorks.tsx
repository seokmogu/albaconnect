import type React from "react"
import { copy } from "../_content/copy"

const stepIcons = [
  // ClipboardList
  <svg key="1" width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-primary">
    <rect x="9" y="2" width="6" height="4" rx="1" />
    <path d="M12 2v4M3 6h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM19 6h-2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="16" y2="17" />
  </svg>,
  // GitMerge
  <svg key="2" width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-secondary-light">
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M6 21V9a9 9 0 0 0 9 9" />
  </svg>,
  // UserCheck
  <svg key="3" width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <polyline points="16 11 18 13 22 9" />
  </svg>,
]

const actorVariant: Record<string, string> = {
  "사장님": "bg-primary/10 text-primary",
  "AlbaConnect": "bg-secondary/10 text-secondary-light",
  "워커": "bg-accent/10 text-accent",
}

export function HowItWorks() {
  const { sectionTitle, sectionSubtitle, steps } = copy.howItWorks

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="bg-white py-16 md:py-20 lg:py-24"
    >
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
        {/* Section header */}
        <div className="text-center mb-12 fade-up">
          <h2
            id="how-it-works-title"
            className="text-2xl md:text-3xl font-bold text-secondary leading-tight mb-3"
          >
            {sectionTitle}
          </h2>
          <p className="text-secondary-light text-base md:text-lg leading-relaxed max-w-xl mx-auto">
            {sectionSubtitle}
          </p>
        </div>

        {/* Steps */}
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {steps.map((step, i) => (
            <li key={step.number} className="relative fade-up" style={{ "--index": i } as React.CSSProperties}>
              {/* Connector line between cards on md+ */}
              {i < steps.length - 1 && (
                <div
                  className="hidden md:block absolute top-10 left-[calc(100%_-_12px)] w-6 border-t-2 border-dashed border-[#E2E8F0] z-10"
                  aria-hidden="true"
                />
              )}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-card h-full flex flex-col gap-4">
                {/* Decorative number */}
                <span className="text-4xl font-bold text-primary/20 leading-none" aria-hidden="true">
                  {step.number}
                </span>
                {/* Icon */}
                {stepIcons[i]}
                {/* Actor badge */}
                <span
                  className={`inline-flex items-center rounded-pill px-3 py-1 text-xs font-semibold self-start ${actorVariant[step.actor] ?? "bg-slate-100 text-slate-500"}`}
                >
                  {step.actor}
                </span>
                {/* Content */}
                <h3 className="text-xl font-semibold text-secondary leading-snug">{step.title}</h3>
                <p className="text-sm text-secondary-light leading-relaxed">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
