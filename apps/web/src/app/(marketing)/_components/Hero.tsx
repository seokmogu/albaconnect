"use client"

import { useReducedMotion, motion, AnimatePresence } from "framer-motion"
import { useEffect, useState } from "react"
import { copy } from "../_content/copy"
import { Button } from "@/components/ui/Button"

// ── Static fallback (reduced-motion or SSR) ──────────────────
function MatchingDemoStatic() {
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-[400px] mx-auto rounded-xl border border-white/10 bg-[#020617] p-6 flex flex-col gap-4"
    >
      {/* Job card */}
      <div className="bg-white/10 rounded-lg px-4 py-3">
        <p className="text-white text-xs font-semibold">📋 공고 등록</p>
        <p className="text-slate-400 text-xs mt-1">카페 오픈 보조 · 시급 12,000원 · 오늘 09:00</p>
      </div>
      {/* Worker pins */}
      <div className="flex items-center gap-3 px-1">
        {[
          { color: "#FF6B00", label: "W1", matched: true },
          { color: "#334155", label: "W2", matched: false },
          { color: "#334155", label: "W3", matched: false },
        ].map((w) => (
          <div key={w.label} className="flex flex-col items-center gap-1">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: w.color }}
            >
              {w.label}
            </div>
            {w.matched && (
              <span className="text-[10px] text-primary font-semibold">매칭</span>
            )}
          </div>
        ))}
        <div className="ml-auto">
          <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center">
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
      </div>
      {/* Match badge */}
      <div className="bg-accent/20 border border-accent/30 rounded-lg px-4 py-3 text-center">
        <p className="text-accent text-sm font-semibold">매칭 확정 ✓</p>
        <p className="text-slate-400 text-xs mt-0.5 font-mono">30초</p>
      </div>
    </div>
  )
}

// ── Animated matching demo ───────────────────────────────────
function MatchingDemoAnimated() {
  const [phase, setPhase] = useState(0)
  // phases: 0=idle, 1=job, 2=radius, 3=workers, 4=bars, 5=match-line, 6=badge, 7=counter, 8=check, 9=hold, 10=out
  const [counter, setCounter] = useState(0)
  const isIdle = phase === 0

  useEffect(() => {
    const timeline: [number, () => void][] = [
      [0,    () => setPhase(1)],
      [600,  () => setPhase(2)],
      [1100, () => setPhase(3)],
      [1400, () => setPhase(4)],
      [2000, () => setPhase(5)],
      [2600, () => setPhase(6)],
      [2800, () => {
        setPhase(7)
        let n = 0
        const iv = setInterval(() => {
          n += 1
          setCounter(n)
          if (n >= 30) clearInterval(iv)
        }, 13)
      }],
      [3200, () => setPhase(8)],
      [3600, () => setPhase(9)],
      [4000, () => setPhase(10)],
      [4400, () => { setPhase(0); setCounter(0); setTimeout(() => setPhase(1), 50) }],
    ]

    const timers = timeline.map(([ms, fn]) => setTimeout(fn, ms))
    return () => timers.forEach(clearTimeout)
  }, [isIdle])

  const show = (minPhase: number) => phase >= minPhase && phase < 10

  const spring = { type: "spring" as const, stiffness: 300, damping: 25 }

  return (
    <div
      aria-hidden="true"
      className="w-full max-w-[400px] mx-auto rounded-xl border border-white/10 bg-[#020617] p-5 flex flex-col gap-4 min-h-[320px] relative overflow-hidden"
    >
      {/* Map grid background */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: show(1) ? 0.06 : 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,#64748B 0px,#64748B 1px,transparent 1px,transparent 32px),repeating-linear-gradient(90deg,#64748B 0px,#64748B 1px,transparent 1px,transparent 32px)",
        }}
      />

      <div className="relative z-10 flex flex-col gap-3">
        {/* Job card */}
        <AnimatePresence>
          {show(1) && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={spring}
              className="bg-white/10 rounded-lg px-4 py-3"
            >
              <p className="text-white text-xs font-semibold">📋 공고 등록</p>
              <p className="text-slate-400 text-xs mt-1">카페 오픈 보조 · 시급 12,000원</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Radius + workers */}
        <AnimatePresence>
          {show(2) && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex items-center gap-3 px-1"
            >
              {/* Map pin */}
              <div className="w-3 h-3 rounded-full bg-primary flex-shrink-0" />
              {/* Dashed radius circle */}
              <div className="w-12 h-12 rounded-full border-2 border-dashed border-primary/40 flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>

              {/* Worker pins */}
              <div className="flex gap-2">
                {[
                  { color: "#FF6B00", delay: 0.0 },
                  { color: "#334155", delay: 0.1 },
                  { color: "#334155", delay: 0.2 },
                ].map((w, idx) => (
                  <AnimatePresence key={idx}>
                    {show(3) && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: [0, 1.2, 1], opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: w.delay, duration: 0.4, ease: "easeOut" }}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: w.color }}
                      >
                        W{idx + 1}
                      </motion.div>
                    )}
                  </AnimatePresence>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Score bars */}
        <AnimatePresence>
          {show(4) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-1.5"
            >
              {[32, 23, 18, 13, 8, 6].map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${w}%` }}
                      transition={{ delay: i * 0.08, duration: 0.3, ease: "easeInOut" }}
                      className="h-full rounded-full bg-primary"
                    />
                  </div>
                  <span className="font-mono text-primary text-[10px] w-7 text-right">{w}%</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Match badge */}
        <AnimatePresence>
          {show(6) && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="bg-accent/20 border border-accent/30 rounded-lg px-4 py-3 text-center"
            >
              <p className="text-accent text-sm font-semibold">
                매칭 확정{" "}
                {show(8) && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", duration: 0.3 }}
                  >
                    ✓
                  </motion.span>
                )}
              </p>
              {show(7) && (
                <p className="text-slate-400 text-xs mt-0.5 font-mono">
                  {counter}초
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Hero section ─────────────────────────────────────────────
export function Hero() {
  const prefersReducedMotion = useReducedMotion()
  const {
    eyebrow,
    headline,
    subheadline,
    ctaEmployer,
    ctaWorker,
    ctaSecondary,
    trustBadges,
    employerEmphasisBadge,
    paymentBadge,
  } = copy.hero
  const headlineLines = headline.split("\n")

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <section
      aria-labelledby="hero-headline"
      className="bg-secondary min-h-screen flex items-center pt-16 relative overflow-hidden"
    >
      {/* Decorative map-grid overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg,#64748B 0px,#64748B 1px,transparent 1px,transparent 40px),repeating-linear-gradient(90deg,#64748B 0px,#64748B 1px,transparent 1px,transparent 40px)",
        }}
      />

      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8 py-16 lg:py-24 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left — text */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Eyebrow badge */}
            <span className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-semibold bg-primary/10 text-primary self-start">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              {eyebrow}
            </span>

            {/* Headline */}
            <h1
              id="hero-headline"
              className="text-4xl md:text-5xl font-bold text-white leading-tight"
            >
              {headlineLines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < headlineLines.length - 1 && <br />}
                </span>
              ))}
            </h1>

            {/* Subheadline */}
            <p className="text-slate-400 text-base md:text-lg leading-relaxed max-w-lg">
              {subheadline}
            </p>

            {/* Employer emphasis badge (LTV-weighted CTA priority) */}
            <span className="inline-flex items-center gap-1.5 self-start rounded-pill px-3 py-1 text-xs font-semibold bg-accent/15 text-accent">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {employerEmphasisBadge}
            </span>

            {/* CTA buttons — employer CTA visually weighted 1.5× per business analysis L1 */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-start">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto shadow-lg shadow-primary/30 ring-2 ring-primary/40 ring-offset-2 ring-offset-secondary"
                onClick={() => scrollTo("final-cta")}
              >
                {ctaEmployer}
              </Button>
              <Button
                variant="ghost"
                size="md"
                className="w-full sm:w-auto bg-white/5 border border-white/15 text-white/90 hover:bg-white/10"
                onClick={() => scrollTo("final-cta")}
              >
                {ctaWorker}
              </Button>
            </div>

            {/* Payment badge inline (Toss escrow trust signal under CTA) */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 font-semibold text-white">
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
                </svg>
                {paymentBadge.logoLabel}
              </span>
              <span style={{ wordBreak: "keep-all" }}>{paymentBadge.note}</span>
            </div>

            {/* Secondary CTA */}
            <button
              onClick={() => scrollTo("how-it-works")}
              className="inline-flex items-center gap-1.5 text-secondary-light text-sm font-medium hover:text-white transition-colors self-start"
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" />
              </svg>
              {ctaSecondary}
            </button>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-2" aria-label="신뢰 지표">
              {trustBadges.map((badge, i) => {
                const icons = [
                  // Shield
                  <svg key="s" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
                  // Star
                  <svg key="st" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
                  // Zap
                  <svg key="z" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
                ]
                return (
                  <span key={badge} className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs bg-white/10 text-white/70">
                    {icons[i]}
                    {badge}
                  </span>
                )
              })}
            </div>
          </div>

          {/* Right — matching demo animation */}
          <div className="lg:col-span-5">
            {prefersReducedMotion ? <MatchingDemoStatic /> : <MatchingDemoAnimated />}
          </div>
        </div>
      </div>
    </section>
  )
}
