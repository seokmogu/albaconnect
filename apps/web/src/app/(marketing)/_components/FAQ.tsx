import type React from "react"
import { copy } from "../_content/copy"

export function FAQ() {
  const { sectionTitle, items } = copy.faq

  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="bg-surface py-16 md:py-20 lg:py-24"
    >
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
        <div className="text-center mb-12 fade-up">
          <h2
            id="faq-title"
            className="text-2xl md:text-3xl font-bold text-secondary leading-tight"
          >
            {sectionTitle}
          </h2>
        </div>

        <div className="max-w-2xl mx-auto">
          {items.map((item, i) => (
            <details
              key={item.q}
              className="group border-b border-[#E2E8F0] fade-up"
              style={{ "--index": i } as React.CSSProperties}
            >
              <summary className="flex items-center justify-between gap-4 py-5 cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm">
                <h3 className="text-base font-semibold text-secondary leading-snug text-left">
                  {item.q}
                </h3>
                {/* ChevronDown / ChevronUp via CSS rotate */}
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="text-secondary-light flex-shrink-0 transition-transform duration-200 group-open:rotate-180"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <p className="pb-5 text-sm text-secondary-light leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
