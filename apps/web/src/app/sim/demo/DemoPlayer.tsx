"use client"

/**
 * DemoPlayer — 구인자와 구직자가 한 번씩 클릭하는 수동 매칭 시연.
 *
 * 자동재생 없이 구인자의 매칭 요청 → 구직자의 제안 수락 → 양쪽 확정을
 * 동일한 합성 dispatch 데이터로 확인한다.
 */

import { useState } from "react"
import {
  ArrowDown,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Lightbulb,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  User,
  Users,
} from "lucide-react"
import { Badge } from "@/xds/components/Badge/Badge"
import { Button } from "@/xds/components/Button/Button"
import { IconClockLine } from "@/xds/icons/IconClockLine"
import { IconPinFill } from "@/xds/icons/IconPinFill"
import { IconWonLine } from "@/xds/icons/IconWonLine"

export interface DemoStep {
  postingId: string
  employer: { id: string; name: string; hub: string; location: { lat: number; lng: number } }
  worker: { id: string; name: string; avgRating: number; ratingCount: number; completionRate: number; location: { lat: number; lng: number } }
  posting: { title: string; hourlyRate: number; durationHours: number; headcount: number; category: string; employmentType: string | null }
  acceptedReason: string | null
  acceptedSecondsToDecide: number | null
}

interface Props {
  steps: DemoStep[]
  totalEmployers: number
  totalWorkers: number
  totalDispatches: number
}

type Phase = "request" | "offer" | "confirmed"

const PHASE_LABELS = ["구인자가 매칭 요청", "구직자가 제안 수락", "양쪽 매칭 확정"] as const

function anonymizeWorker(id: string) {
  const suffix = id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase().padStart(4, "0")
  return `후보 ${suffix}`
}

function phaseIndex(phase: Phase) {
  if (phase === "request") return 0
  if (phase === "offer") return 1
  return 2
}

export function DemoPlayer({ steps, totalEmployers, totalWorkers, totalDispatches }: Props) {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>("request")

  const step = steps[idx]
  const activeIndex = phaseIndex(phase)

  if (!step) {
    return (
      <main className="fixed inset-0 flex min-h-screen items-center justify-center bg-background-subtle p-6">
        <section className="w-full max-w-md rounded-brand-lg border border-border bg-background p-8 text-center shadow-sm">
          <Search className="mx-auto mb-4 size-8 icon-subtle" aria-hidden="true" />
          <h1 className="text-heading-sm font-bold">시연할 매칭 데이터가 없어요</h1>
          <p className="mt-2 text-body-sm text-typography-secondary">합성 스냅샷을 생성한 뒤 다시 시도해 주세요.</p>
        </section>
      </main>
    )
  }

  const workerLabel = anonymizeWorker(step.worker.id)
  const instruction =
    phase === "request"
      ? "왼쪽 구인자 화면에서 ‘매칭 요청하기’를 눌러보세요"
      : phase === "offer"
        ? "오른쪽 구직자 화면에서 추천 이유를 보고 ‘제안 수락’을 눌러보세요"
        : "양쪽 화면에 같은 매칭 확정 결과가 표시됐어요"

  const reset = () => {
    setIdx(0)
    setPhase("request")
  }

  const nextScenario = () => {
    setIdx((current) => (current + 1) % steps.length)
    setPhase("request")
  }

  return (
    <main className="fixed inset-0 min-h-screen overflow-y-auto bg-background-subtle text-typography-default">
      <header className="border-b border-border-subtle bg-background">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-heading-base font-extrabold tracking-tight">알바몬 <span className="text-typography-brand">커넥트</span></h1>
            <Badge color="brand" size="sm">클릭형 데모</Badge>
            <Badge color="gray" size="sm">합성 데이터</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-body-sm text-typography-secondary">
            <span className="font-semibold text-typography">시나리오 {idx + 1}/{steps.length}</span>
            <span>사업장 {totalEmployers.toLocaleString()}</span>
            <span>구직자 {totalWorkers.toLocaleString()}</span>
            <span>전체 {totalDispatches.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-2">
            {phase === "confirmed" && (
              <Button iconTrailing={<ChevronRight />} onClick={nextScenario} size="sm" variant="primary">다음 시나리오</Button>
            )}
            <Button aria-label="시연 처음부터 보기" iconLeading={<RotateCcw />} onClick={reset} size="sm" variant="outlineTertiary">처음부터</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-screen-2xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <section aria-label="시연 진행 단계" className="rounded-brand-lg border border-border bg-background p-4 shadow-xs sm:p-5">
          <ol className="grid gap-2 sm:grid-cols-3">
            {PHASE_LABELS.map((label, index) => {
              const active = index === activeIndex
              const complete = index < activeIndex
              return (
                <li key={label} className={`flex min-h-12 items-center justify-center gap-2 rounded-brand-md border px-3 text-center text-body-sm font-semibold ${active ? "border-border-brand bg-background-brand-subtle text-typography-brand" : complete ? "border-border-success bg-fill-element-success-subtle text-typography-success" : "border-border bg-background text-typography-secondary"}`} aria-current={active ? "step" : undefined}>
                  <span className={`flex size-6 items-center justify-center rounded-full text-caption-lg ${active ? "bg-fill-element-brand text-typography-static-white" : complete ? "bg-fill-element-success text-typography-static-white" : "bg-fill-element-surface text-typography-secondary"}`}>
                    {complete ? <CheckCircle2 className="size-4" aria-hidden="true" /> : index + 1}
                  </span>
                  {label}
                </li>
              )
            })}
          </ol>
          <div aria-live="polite" className="mt-4 flex items-start justify-center gap-2 text-center text-body-base font-semibold">
            {phase === "confirmed" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 icon-success" aria-hidden="true" /> : <Lightbulb className="mt-0.5 size-5 shrink-0 icon-brand" aria-hidden="true" />}
            <span>{instruction}</span>
          </div>
        </section>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1fr)] lg:items-stretch">
          <ActorPanel actor="구인자 화면" description="필요한 일의 조건을 등록하고 매칭을 요청합니다" icon={<BriefcaseBusiness />}>
            <EmployerScreen phase={phase} step={step} workerLabel={workerLabel} onRequest={() => setPhase("offer")} />
          </ActorPanel>

          <MatchBridge phase={phase} />

          <ActorPanel actor="구직자 화면" description="들어온 제안의 조건과 추천 이유를 확인합니다" icon={<CircleUserRound />} emphasis={phase === "offer"}>
            <WorkerScreen
              phase={phase}
              step={step}
              onAccept={() => setPhase("confirmed")}
              onReject={nextScenario}
            />
          </ActorPanel>
        </div>

        {phase === "confirmed" ? (
          <section className="mt-4 rounded-brand-lg border border-border-success bg-fill-element-success-subtle p-4 shadow-xs sm:p-5" aria-label="양쪽 매칭 확정">
            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <ConfirmationResult label="구인자" title={`${workerLabel} 매칭 확정`} detail="예상 도착 17:56 · 거리 1.2km" />
              <div className="flex items-center justify-center gap-2 text-typography-success md:flex-col">
                <span className="h-px w-12 bg-fill-element-success md:h-10 md:w-px" />
                <CheckCircle2 className="size-8 icon-success" aria-hidden="true" />
                <span className="h-px w-12 bg-fill-element-success md:h-10 md:w-px" />
              </div>
              <ConfirmationResult label="구직자" title="일감 매칭 확정" detail={`${step.employer.hub} · ${step.employer.name}`} />
            </div>
            <div className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-border-success pt-4 sm:flex-row">
              <p className="text-body-sm font-semibold text-typography-success">양쪽에 매칭 확정이 동시에 표시됩니다.</p>
              <Button iconTrailing={<ChevronRight />} onClick={nextScenario} size="sm" variant="primary">다음 시나리오</Button>
            </div>
          </section>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-caption-lg text-typography-subtle">
            <Badge color="gray" size="sm">합성 데이터</Badge>
            <span>·</span><span>실제 내부 DB 미연결</span><span>·</span><span>결제·정산 제외</span><span>·</span><span>추천 결과는 AI 추정</span>
          </div>
        )}
      </div>
    </main>
  )
}

function ActorPanel({ actor, description, icon, emphasis = false, children }: { actor: string; description: string; icon: React.ReactNode; emphasis?: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-brand-lg border bg-background p-4 shadow-xs sm:p-5 ${emphasis ? "border-border-brand" : "border-border"}`}>
      <div className="flex items-start gap-3 border-b border-border-subtle pb-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-brand-md bg-fill-element-brand-subtle text-typography-brand [&_svg]:size-5" aria-hidden="true">{icon}</span>
        <div>
          <h2 className="text-heading-xs font-bold">{actor}</h2>
          <p className="mt-0.5 text-caption-lg text-typography-secondary">{description}</p>
        </div>
      </div>
      <div className="pt-4">{children}</div>
    </section>
  )
}

function EmployerScreen({ phase, step, workerLabel, onRequest }: { phase: Phase; step: DemoStep; workerLabel: string; onRequest: () => void }) {
  return (
    <div className="flex min-h-[430px] flex-col">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-caption-lg text-typography-secondary">{step.employer.hub} · {step.employer.name}</p>
            <h3 className="mt-1 text-heading-sm font-bold">{step.posting.title}</h3>
          </div>
          <Badge color={phase === "confirmed" ? "green" : phase === "offer" ? "yellow" : "brand"} size="sm">
            {phase === "request" ? "요청 전" : phase === "offer" ? "제안 응답 대기" : "매칭 확정"}
          </Badge>
        </div>
        <div className="mt-5 grid grid-cols-3 divide-x divide-border-subtle rounded-brand-md bg-fill-element-surface p-4">
          <JobFact icon={<IconWonLine />} label="시급" value={`${step.posting.hourlyRate.toLocaleString()}원`} />
          <JobFact icon={<IconClockLine />} label="근무" value={`${step.posting.durationHours}시간`} />
          <JobFact icon={<Users />} label="인원" value={`${step.posting.headcount}명`} />
        </div>
      </div>

      <div className="mt-5 flex flex-1 flex-col justify-center rounded-brand-md border border-border-subtle p-4">
        {phase === "request" ? (
          <div className="text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-fill-element-brand-subtle"><Search className="size-6 icon-brand" aria-hidden="true" /></span>
            <h4 className="mt-3 text-body-base font-semibold">조건에 맞는 워커를 찾아볼까요?</h4>
            <p className="mt-1 text-caption-lg text-typography-secondary">시간·거리·직무 조건을 기준으로 익명 후보를 탐색합니다.</p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${phase === "confirmed" ? "bg-fill-element-success-subtle" : "bg-fill-element-brand-subtle"}`}>
              {phase === "confirmed" ? <CheckCircle2 className="size-6 icon-success" aria-hidden="true" /> : <User className="size-6 icon-brand" aria-hidden="true" />}
            </span>
            <div>
              <p className={`text-caption-lg ${phase === "confirmed" ? "text-typography-success" : "text-typography-brand"}`}>{phase === "confirmed" ? "수락 확정" : "1순위 후보에게 제안 전송"}</p>
              <p className="mt-1 text-body-base font-semibold">{workerLabel}</p>
              <p className="mt-1 text-caption-lg text-typography-secondary">거리 1.2km · 예상 도착 17:56 · 평점 {step.worker.avgRating || "신규"}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        {phase === "request" ? (
          <Button className="w-full" iconLeading={<Search />} onClick={onRequest} size="lg" variant="primary">매칭 요청하기</Button>
        ) : (
          <Button className="w-full" disabled iconLeading={phase === "confirmed" ? <CheckCircle2 /> : <Send />} size="lg" variant="outlineTertiary">
            {phase === "confirmed" ? "매칭 확정 완료" : "매칭 요청 완료"}
          </Button>
        )}
      </div>
    </div>
  )
}

function WorkerScreen({ phase, step, onAccept, onReject }: { phase: Phase; step: DemoStep; onAccept: () => void; onReject: () => void }) {
  if (phase === "request") {
    return (
      <div className="flex min-h-[430px] flex-col items-center justify-center text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-fill-element-surface"><CircleUserRound className="size-7 icon-subtle" aria-hidden="true" /></span>
        <h3 className="mt-4 text-heading-xs font-bold">아직 받은 제안이 없어요</h3>
        <p className="mt-2 max-w-sm text-body-sm text-typography-secondary">구인자가 매칭을 요청하면 내 조건과 맞는 일감이 이 화면에 나타납니다.</p>
        <Badge className="mt-4" color="gray" size="sm">제안 대기</Badge>
      </div>
    )
  }

  if (phase === "confirmed") {
    return (
      <div className="flex min-h-[430px] flex-col items-center justify-center text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-fill-element-success-subtle"><CheckCircle2 className="size-8 icon-success" aria-hidden="true" /></span>
        <Badge className="mt-4" color="green" size="sm">매칭 확정</Badge>
        <h3 className="mt-3 text-heading-sm font-bold">제안을 수락했어요</h3>
        <p className="mt-2 text-body-sm text-typography-secondary">{step.employer.hub} · {step.employer.name}</p>
        <p className="mt-1 text-body-base font-semibold">{step.posting.title}</p>
        {step.acceptedReason && <p className="mt-4 max-w-sm text-caption-lg text-typography-success">“{step.acceptedReason}”</p>}
      </div>
    )
  }

  return (
    <div className="flex min-h-[430px] flex-col">
      <div className="flex items-center justify-between gap-2">
        <Badge color="brand" size="sm">새로운 제안</Badge>
        <Badge color="brand" iconLeading={<Sparkles />} size="sm">AI 추정</Badge>
      </div>
      <div className="mt-5">
        <p className="text-caption-lg text-typography-secondary">{step.employer.hub} · {step.employer.name}</p>
        <h3 className="mt-1 text-heading-sm font-bold">{step.posting.title}</h3>
        <div className="mt-5 grid grid-cols-3 divide-x divide-border-subtle border-y border-border-subtle py-4">
          <OfferFact icon={<IconWonLine />} label="시급" value={`${step.posting.hourlyRate.toLocaleString()}원`} />
          <OfferFact icon={<IconPinFill />} label="거리" value="1.2km" />
          <OfferFact icon={<IconClockLine />} label="근무" value={`${step.posting.durationHours}시간`} />
        </div>
      </div>
      <div className="mt-5">
        <h4 className="flex items-center gap-1.5 text-body-sm font-semibold"><Sparkles className="size-4 icon-brand" aria-hidden="true" />추천 이유</h4>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge color="white" size="sm">거리 1.2km</Badge>
          <Badge color="white" size="sm">가능 시간 일치</Badge>
          <Badge color="white" size="sm">직종 경험 일치</Badge>
        </div>
        <p className="mt-3 text-caption-lg text-typography-subtle">추천 결과는 예측값이며 실제 적합도와 다를 수 있습니다.</p>
      </div>
      <div className="mt-auto grid grid-cols-[2fr_1fr] gap-2 pt-5">
        <Button className="w-full" iconLeading={<CheckCircle2 />} onClick={onAccept} size="lg" variant="primary">제안 수락</Button>
        <Button className="w-full" onClick={onReject} size="lg" variant="outlineTertiary">거절</Button>
      </div>
    </div>
  )
}

function MatchBridge({ phase }: { phase: Phase }) {
  const active = phase !== "request"
  return (
    <aside className={`flex min-h-28 items-center justify-center rounded-brand-lg border p-3 text-center lg:min-h-0 lg:flex-col ${active ? "border-border-brand-subtle bg-background-brand-subtle" : "border-border-subtle bg-background"}`} aria-label="조건 기반 매칭 설명">
      <ArrowDown className={`size-6 lg:hidden ${active ? "icon-brand" : "icon-subtle"}`} aria-hidden="true" />
      <ArrowRight className={`hidden size-7 lg:block ${active ? "icon-brand" : "icon-subtle"}`} aria-hidden="true" />
      <div className="mx-3 lg:mx-0 lg:mt-3">
        <p className="text-body-sm font-semibold">조건 기반 매칭</p>
        <Badge className="mt-2" color={active ? "brand" : "gray"} size="sm">{active ? "AI 추정" : "요청 전"}</Badge>
      </div>
      {active ? (
        <div className="hidden flex-col gap-2 lg:mt-5 lg:flex">
          <Badge color="white" size="sm">거리 1.2km</Badge>
          <Badge color="white" size="sm">시간 일치</Badge>
          <Badge color="white" size="sm">경험 일치</Badge>
        </div>
      ) : (
        <p className="hidden max-w-28 text-caption-base text-typography-subtle lg:mt-4 lg:block">요청 후 추천 근거가 표시됩니다.</p>
      )}
    </aside>
  )
}

function JobFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center px-1 text-center">
      <span className="mb-1 text-typography-brand [&_svg]:size-4" aria-hidden="true">{icon}</span>
      <span className="text-caption-base text-typography-subtle">{label}</span>
      <strong className="mt-0.5 truncate text-caption-lg font-semibold">{value}</strong>
    </div>
  )
}

function OfferFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-2 px-2">
      <span className="shrink-0 text-typography-brand [&_svg]:size-5" aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <p className="text-caption-base text-typography-subtle">{label}</p>
        <p className="truncate text-body-sm font-semibold">{value}</p>
      </div>
    </div>
  )
}

function ConfirmationResult({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-brand-md bg-background p-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fill-element-success-subtle"><CheckCircle2 className="size-6 icon-success" aria-hidden="true" /></span>
      <div>
        <p className="text-caption-lg text-typography-success">{label} · 매칭 확정</p>
        <p className="mt-1 text-body-base font-semibold">{title}</p>
        <p className="mt-1 text-caption-lg text-typography-secondary">{detail}</p>
      </div>
    </div>
  )
}
