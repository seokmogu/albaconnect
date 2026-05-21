import Link from "next/link"
import { ArrowRight, BriefcaseBusiness, LogIn, ShieldCheck, UserRound } from "lucide-react"
import { copy } from "../_content/copy"

const icons = [BriefcaseBusiness, UserRound] as const

export function FinalCTA() {
  const { sectionTitle, subtitle, cards, loginPrompt, loginCta } = copy.finalCta
  const titleLines = sectionTitle.split("\n")

  return (
    <section
      id="final-cta"
      aria-labelledby="finalcta-title"
      className="bg-secondary py-16 md:py-20 lg:py-24"
    >
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
        <div className="mb-10 max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-pill bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            <ShieldCheck size={14} aria-hidden="true" />
            사내 베타 운영 중
          </div>
          <h2
            id="finalcta-title"
            className="mb-3 text-2xl font-bold leading-tight text-white md:text-3xl"
          >
            {titleLines.map((line, i) => (
              <span key={line}>
                {line}
                {i < titleLines.length - 1 && <br />}
              </span>
            ))}
          </h2>
          <p className="max-w-xl text-base leading-relaxed text-slate-400">{subtitle}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card, index) => {
            const Icon = icons[index] ?? UserRound
            return (
              <Link
                key={card.href}
                href={card.href}
                className="group flex min-h-[220px] flex-col justify-between rounded-lg border border-white/10 bg-white p-6 text-secondary shadow-hover transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
              >
                <div>
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon size={22} aria-hidden="true" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold">{card.title}</h3>
                  <p className="text-sm leading-relaxed text-secondary-light">{card.description}</p>
                </div>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  {card.cta}
                  <ArrowRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            )
          })}
        </div>

        <div className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <span>{loginPrompt}</span>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/15 px-4 font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogIn size={16} aria-hidden="true" />
            {loginCta}
          </Link>
        </div>
      </div>
    </section>
  )
}
