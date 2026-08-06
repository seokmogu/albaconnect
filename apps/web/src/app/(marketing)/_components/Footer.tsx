import { copy } from "../_content/copy"

export function Footer() {
  const { tagline, columns, legal, company, copyright } = copy.footer

  return (
    <footer role="contentinfo" className="bg-[#020617] py-16">
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
        {/* Logo + tagline */}
        <div className="mb-10">
          <div className="flex items-center gap-1.5 mb-2">
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="#FF6E0D"
              stroke="#FF6E0D"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span className="text-white font-bold text-lg">알바몬 커넥트</span>
          </div>
          <p className="text-slate-500 text-sm">{tagline}</p>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 mb-10" />

        {/* Columns */}
        <nav aria-label="푸터 네비게이션">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {columns.map((col) => (
              <div key={col.heading}>
                <p className="text-white text-sm font-semibold mb-4">{col.heading}</p>
                <ul className="flex flex-col gap-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-slate-500 text-sm hover:text-white transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Divider */}
        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <nav aria-label="법적 고지">
            <ul className="flex flex-wrap gap-4">
              {legal.map((item) => (
                <li key={item}>
                  <a href="#" className="text-slate-600 text-xs hover:text-slate-400 transition-colors">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex flex-col gap-1 text-right">
            <p className="text-slate-600 text-xs">{company}</p>
            <p className="text-slate-600 text-xs">{copyright}</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
