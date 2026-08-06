import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-border-subtle bg-background py-8" role="contentinfo">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-4 px-4 text-caption-lg text-typography-subtle md:flex-row md:items-center md:justify-between md:px-6 xl:px-8">
        <div>
          <p className="font-semibold text-typography">알바몬 <span className="text-typography-brand">커넥트</span></p>
          <p className="mt-1">제안·수락형 매칭 가능성을 확인하는 사내 검증용 POC</p>
        </div>
        <nav aria-label="푸터 네비게이션" className="flex flex-wrap gap-4">
          <Link href="/sim/demo" className="hover:text-typography-brand">클릭형 데모</Link>
          <a href="#validation" className="hover:text-typography-brand">검증 범위</a>
        </nav>
      </div>
    </footer>
  )
}
