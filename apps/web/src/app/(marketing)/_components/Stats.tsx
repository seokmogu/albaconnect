import type React from "react"
import { copy } from "../_content/copy"

export function Stats() {
  const { items, sectionTitle, disclaimer } = copy.stats

  return (
    <section
      aria-label={sectionTitle}
      className="bg-white border-y border-[#E2E8F0] py-12"
    >
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
        <p className="text-center text-sm font-semibold tracking-wide text-primary mb-6">
          {sectionTitle}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-0 text-center">
          {items.map((stat, i) => (
            <div
              key={stat.label}
              className={`flex flex-col items-center gap-2 fade-up ${
                i < items.length - 1 ? "md:border-r md:border-[#E2E8F0] md:px-8" : "md:px-8"
              }`}
              style={{ "--index": i } as React.CSSProperties}
            >
              <dl>
                <dd className="text-5xl font-bold text-primary leading-none">{stat.value}</dd>
                <dt className="text-sm text-secondary-light font-medium mt-2">{stat.label}</dt>
              </dl>
            </div>
          ))}
        </div>
        {disclaimer && (
          <p className="mt-6 text-center text-xs text-secondary-light" style={{ wordBreak: "keep-all" }}>
            {disclaimer}
          </p>
        )}
      </div>
    </section>
  )
}
