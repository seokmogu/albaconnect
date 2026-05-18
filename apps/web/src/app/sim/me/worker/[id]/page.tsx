/**
 * /sim/me/worker/[id] — 구직자 마이페이지 (US-2, US-3, US-10, US-11).
 *
 * 모바일 우선. 서버에서 데이터를 로드하고 클라이언트 컴포넌트에 전달한다.
 * 수락/거절·스케줄·라이브 토글 인터랙션은 클라이언트(세션 메모리).
 */
import { notFound } from "next/navigation"
import { loadWorkers, loadDispatches, loadPostings } from "../../../_lib/data"
import { WorkerMyPageClient } from "./WorkerMyPageClient"

export const dynamic = "force-dynamic"

export default async function WorkerMyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [workers, dispatches, postings] = await Promise.all([
    loadWorkers(), loadDispatches(), loadPostings(),
  ])
  const worker = workers.find((w) => w.id === id)
  if (!worker) notFound()

  const postingById = Object.fromEntries(postings.map((p) => [p.id, p]))

  // 본인이 받은 알림 / 수락한 일감
  const myDispatches = dispatches.filter((d) => d.rankedWorkerIds.includes(id))
  const notifications = myDispatches
    .filter((d) => !d.acceptedBy || d.acceptedBy !== id)
    .filter((d) => !d.acceptedBy) // 미확정 알림만
    .map((d) => ({ dispatch: d, posting: postingById[d.postingId] }))
    .filter((x) => x.posting)
  const activeJobs = myDispatches
    .filter((d) => d.acceptedBy === id)
    .map((d) => ({ dispatch: d, posting: postingById[d.postingId] }))
    .filter((x) => x.posting)

  return (
    <WorkerMyPageClient
      worker={worker}
      notifications={notifications}
      activeJobs={activeJobs}
    />
  )
}
