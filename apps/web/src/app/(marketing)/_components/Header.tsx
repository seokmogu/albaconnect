"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { copy } from "../_content/copy"
import { Button } from "@/components/ui/Button"

export function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  // Trap focus in mobile menu
  useEffect(() => {
    if (!open) return
    const el = menuRef.current
    if (!el) return
    const focusable = el.querySelectorAll<HTMLElement>(
      'a, button, [tabindex]:not([tabindex="-1"])',
    )
    focusable[0]?.focus()
  }, [open])

  return (
    <header
      role="banner"
      className={`fixed inset-x-0 top-0 z-50 h-16 transition-all duration-300 ${
        scrolled
          ? "backdrop-blur-sm bg-white/90 dark:bg-[#0B1220]/90 border-b border-[#E2E8F0] dark:border-[#1E293B]"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8 h-full flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-1.5 text-white lg:text-secondary font-bold text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          aria-label="알바몬 커넥트 홈으로"
        >
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="#FF6B00"
            stroke="#FF6B00"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span className={scrolled ? "text-secondary" : "text-white"}>
            {copy.header.logoText}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="메인 네비게이션" className="hidden lg:flex items-center gap-6">
          {copy.header.navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-secondary-light hover:text-primary transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden lg:block">
          <Button
            variant="primary"
            size="sm"
            className="rounded-pill"
            onClick={() => {
              document.getElementById("final-cta")?.scrollIntoView({ behavior: "smooth" })
            }}
          >
            {copy.header.ctaPrimary}
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden p-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" className={scrolled ? "text-secondary" : "text-white"}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" className={scrolled ? "text-secondary" : "text-white"}>
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {open && (
        <div
          id="mobile-menu"
          ref={menuRef}
          className="lg:hidden fixed inset-0 top-16 z-40 bg-white dark:bg-[#0B1220] flex flex-col px-6 pt-8 pb-12 gap-6"
        >
          <nav aria-label="모바일 네비게이션" className="flex flex-col gap-4">
            {copy.header.navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-lg font-medium text-secondary hover:text-primary transition-colors py-2 border-b border-[#E2E8F0]"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <Button
            variant="primary"
            size="lg"
            className="w-full rounded-pill mt-4"
            onClick={() => {
              setOpen(false)
              document.getElementById("final-cta")?.scrollIntoView({ behavior: "smooth" })
            }}
          >
            {copy.header.ctaPrimary}
          </Button>
        </div>
      )}
    </header>
  )
}
