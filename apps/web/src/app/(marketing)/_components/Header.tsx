import Link from "next/link"
import { pocContent } from "../_content/poc"

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-background" role="banner">
      <div className="mx-auto flex min-h-16 w-full max-w-screen-xl items-center justify-between gap-4 px-4 md:px-6 xl:px-8">
        <Link
          href="/"
          aria-label="알바몬 커넥트 홈"
          className="shrink-0 rounded-brand-xs text-heading-sm font-extrabold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          알바몬 <span className="text-typography-brand">커넥트</span>
        </Link>

        <nav aria-label="메인 네비게이션" className="hidden items-center gap-8 md:flex">
          {pocContent.header.navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-body-sm font-medium text-typography-secondary transition-colors hover:text-typography-brand">
              {item.label}
            </a>
          ))}
        </nav>

        <Link
          href="/sim/demo"
          className="inline-flex min-h-10 items-center justify-center rounded-brand-md bg-fill-element-brand px-4 text-body-sm font-semibold text-typography-static-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          {pocContent.header.cta}
        </Link>
      </div>
    </header>
  )
}
