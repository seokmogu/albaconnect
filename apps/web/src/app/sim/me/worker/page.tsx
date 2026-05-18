/**
 * /sim/me/worker?id=w-0001 — 진입 폼 제출 핸들러.
 * id 쿼리를 검증하고 /sim/me/worker/[id]로 리다이렉트한다.
 */
import { redirect } from "next/navigation"
import { loadWorkers } from "../../_lib/data"

export const dynamic = "force-dynamic"

export default async function MeWorkerRedirect({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams
  const trimmed = (id ?? "").trim()
  if (!trimmed) redirect("/sim/me")

  const workers = await loadWorkers()
  if (!workers.some((w) => w.id === trimmed)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-slate-700 mb-2">워커 ID <code className="bg-slate-200 px-1 rounded">{trimmed}</code>를 찾을 수 없습니다.</p>
        <a href="/sim/me" className="text-xs text-emerald-600 underline">진입 화면으로</a>
      </div>
    )
  }
  redirect(`/sim/me/worker/${trimmed}`)
}
