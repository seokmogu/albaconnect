/**
 * /sim/me/employer?id=emp-001 — 진입 폼 제출 핸들러.
 * id 쿼리를 검증하고 /sim/me/employer/[id]로 리다이렉트한다.
 */
import { redirect } from "next/navigation"
import { loadEmployers } from "../../_lib/data"

export const dynamic = "force-dynamic"

export default async function MeEmployerRedirect({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams
  const trimmed = (id ?? "").trim()
  if (!trimmed) redirect("/sim/me")

  const employers = await loadEmployers()
  if (!employers.some((e) => e.id === trimmed)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-slate-700 mb-2">사업장 ID <code className="bg-slate-200 px-1 rounded">{trimmed}</code>를 찾을 수 없습니다.</p>
        <a href="/sim/me" className="text-xs text-primary underline">진입 화면으로</a>
      </div>
    )
  }
  redirect(`/sim/me/employer/${trimmed}`)
}
