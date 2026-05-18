/**
 * /sim/demo — 3분할 실시간 데모 페이지.
 *
 * 좌(구인자) · 중(구직자) · 우(관리자) 세 시점을 한 화면에 두고,
 * dispatch 이벤트를 타임라인으로 재생한다. 영상 녹화용.
 */
import { loadSnapshot } from "../_lib/data"
import { DemoPlayer, type DemoStep } from "./DemoPlayer"

export const dynamic = "force-dynamic"

export default async function SimDemoPage() {
  const snap = await loadSnapshot()

  const empById = new Map(snap.employers.map((e) => [e.id, e]))
  const wkById = new Map(snap.workers.map((w) => [w.id, w]))
  const postById = new Map(snap.postings.map((p) => [p.id, p]))

  // 매칭 성공 dispatch 중 30건을 타임라인 스텝으로 구성
  const steps: DemoStep[] = snap.dispatches
    .filter((d) => d.acceptedBy)
    .slice(0, 30)
    .map((d) => {
      const posting = postById.get(d.postingId)
      const employer = posting ? empById.get(posting.employerId) : undefined
      const worker = d.acceptedBy ? wkById.get(d.acceptedBy) : undefined
      if (!posting || !employer || !worker) return null
      return {
        postingId: d.postingId,
        employer: {
          id: employer.id,
          name: employer.name,
          hub: employer.nearestHub,
          location: employer.location,
        },
        worker: {
          id: worker.id,
          name: worker.name,
          avgRating: worker.avgRating,
          ratingCount: worker.ratingCount,
          completionRate: worker.completionRate,
          location: worker.location,
        },
        posting: {
          title: posting.draft.title,
          hourlyRate: posting.draft.hourlyRate,
          durationHours: posting.draft.durationHours,
          headcount: posting.draft.headcount,
          category: posting.draft.category,
          employmentType: posting.employmentType ?? null,
        },
        acceptedReason: d.acceptedReason ?? null,
        acceptedSecondsToDecide: d.acceptedSecondsToDecide ?? null,
      }
    })
    .filter((s): s is DemoStep => s !== null)

  return (
    <DemoPlayer
      steps={steps}
      totalEmployers={snap.employers.length}
      totalWorkers={snap.workers.length}
      totalDispatches={snap.dispatches.length}
    />
  )
}
