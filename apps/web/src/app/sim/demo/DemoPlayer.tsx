"use client"

/**
 * DemoPlayer — 알바몬 XDS 기반 3자 관점 매칭 시연 화면.
 *
 * 동일한 dispatch를 구인자 · 워커 · 매칭 운영 화면에 동시에 반영한다.
 * 이 화면의 데이터는 합성 스냅샷이며 실제 내부 DB 연결 결과가 아니다.
 */

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  Timer,
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

type Phase = "posting" | "matching" | "offered" | "accepted"
type BadgeColor = "brand" | "purple" | "green" | "gray"

const PHASES: Phase[] = ["posting", "matching", "offered", "accepted"]
const PHASE_LABEL: Record<Phase, string> = {
  posting: "공고 등록",
  matching: "AI 매칭",
  offered: "제안 전송",
  accepted: "수락 확정",
}
const EMPLOYMENT_LABEL: Record<string, string> = { gig: "긱", daily: "일일", short: "단기", long: "장기" }
const EMPLOYMENT_COLOR: Record<string, BadgeColor> = { gig: "brand", daily: "brand", short: "purple", long: "green" }

// 강남구 미니맵 좌표 투영
const BOUNDS = { minLat: 37.46, maxLat: 37.54, minLng: 126.99, maxLng: 127.12 }
const MAP_W = 480
const MAP_H = 210

function project(loc: { lat: number; lng: number }) {
  return {
    x: ((loc.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * MAP_W,
    y: MAP_H - ((loc.lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * MAP_H,
  }
}

function anonymizeWorker(id: string) {
  const suffix = id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase().padStart(4, "0")
  return `후보 ${suffix}`
}

function getPhaseSubtitle(phase: Phase, step: DemoStep, workerLabel: string) {
  if (phase === "posting") return `“${step.posting.title}” 일감이 등록됐어요`
  if (phase === "matching") return "시간·거리·직무 조건으로 후보를 정렬하고 있어요"
  if (phase === "offered") return `${workerLabel}에게 제안을 보냈어요`
  return `${workerLabel}가 ${step.acceptedSecondsToDecide ?? "—"}초 만에 수락했어요`
}

export function DemoPlayer({ steps, totalEmployers, totalWorkers, totalDispatches }: Props) {
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>("posting")
  const [playing, setPlaying] = useState(true)

  const step = steps[idx]
  const activePhaseIndex = PHASES.indexOf(phase)
  const qualifiedCount = Math.max(1, Math.round(totalWorkers * 0.0127))

  useEffect(() => {
    if (!playing || !step) return

    const duration: Record<Phase, number> = {
      posting: 1300,
      matching: 1500,
      offered: 1900,
      accepted: 2400,
    }
    const timer = window.setTimeout(() => {
      if (activePhaseIndex < PHASES.length - 1) {
        setPhase(PHASES[activePhaseIndex + 1])
        return
      }
      setIdx((current) => (current + 1) % steps.length)
      setPhase("posting")
    }, duration[phase])

    return () => window.clearTimeout(timer)
  }, [activePhaseIndex, phase, playing, step, steps.length])

  const matchedSoFar = useMemo(
    () => steps.slice(0, idx + (phase === "accepted" ? 1 : 0)),
    [idx, phase, steps],
  )

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
  const subtitle = getPhaseSubtitle(phase, step, workerLabel)

  const reset = () => {
    setIdx(0)
    setPhase("posting")
    setPlaying(true)
  }

  const rejectOffer = () => {
    setIdx((current) => (current + 1) % steps.length)
    setPhase("posting")
  }

  return (
    <main className="fixed inset-0 min-h-screen overflow-y-auto bg-background-subtle text-typography-default">
      <header className="border-b border-border-subtle bg-background">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-heading-base font-extrabold tracking-tight">
              알바몬 <span className="text-typography-brand">커넥트</span>
            </div>
            <Badge color="brand" size="sm">LIVE DEMO</Badge>
            <Badge color="gray" size="sm">합성 데이터</Badge>
          </div>

          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-body-sm text-typography-secondary">
            <div className="flex items-center gap-1.5"><dt>지역</dt><dd className="font-semibold text-typography">강남구</dd></div>
            <div className="flex items-center gap-1.5"><dt>사업장</dt><dd className="font-semibold text-typography">{totalEmployers.toLocaleString()}</dd></div>
            <div className="flex items-center gap-1.5"><dt>구직자</dt><dd className="font-semibold text-typography">{totalWorkers.toLocaleString()}</dd></div>
            <div className="flex items-center gap-1.5"><dt>시나리오</dt><dd className="font-semibold text-typography">{totalDispatches.toLocaleString()}</dd></div>
          </dl>

          <div className="flex items-center gap-2">
            <Button
              aria-label={playing ? "시연 일시정지" : "시연 재생"}
              iconLeading={playing ? <Pause /> : <Play />}
              onClick={() => setPlaying((current) => !current)}
              size="sm"
              variant="outlineTertiary"
            >
              {playing ? "일시정지" : "재생"}
            </Button>
            <Button aria-label="시연 처음부터 보기" iconLeading={<RotateCcw />} onClick={reset} size="sm" variant="outlineTertiary">
              처음부터
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-screen-2xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <section aria-label="매칭 진행 단계" className="rounded-brand-lg border border-border bg-background p-4 shadow-xs sm:p-5">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {PHASES.map((item, phaseIndex) => {
              const isActive = phaseIndex === activePhaseIndex
              const isComplete = phaseIndex < activePhaseIndex
              return (
                <li key={item} className="flex items-center gap-2">
                  <div
                    aria-current={isActive ? "step" : undefined}
                    className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-brand-md border px-3 text-body-sm font-semibold transition-colors ${
                      isActive
                        ? "border-border-brand bg-background-brand-subtle text-typography-brand"
                        : isComplete
                          ? "border-border-success bg-fill-element-success-subtle text-typography-success"
                          : "border-border bg-background text-typography-secondary"
                    }`}
                  >
                    <span className={`flex size-6 items-center justify-center rounded-full text-caption-lg ${isActive ? "bg-fill-element-brand text-typography-static-white" : isComplete ? "bg-fill-element-success text-typography-static-white" : "bg-fill-element-surface text-typography-secondary"}`}>
                      {isComplete ? <CheckCircle2 className="size-4" aria-hidden="true" /> : phaseIndex + 1}
                    </span>
                    {PHASE_LABEL[item]}
                  </div>
                  {phaseIndex < PHASES.length - 1 && <ChevronRight className="hidden size-4 icon-subtle sm:block" aria-hidden="true" />}
                </li>
              )
            })}
          </ol>

          <div aria-live="polite" className="mt-4 flex items-center justify-center gap-2 text-center text-body-base font-semibold">
            {phase === "accepted" ? <CheckCircle2 className="size-5 icon-success" aria-hidden="true" /> : <Activity className="size-5 icon-brand" aria-hidden="true" />}
            <span>{subtitle}</span>
          </div>
        </section>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <RolePanel icon={<Store />} label="구인자" description="필요한 시간의 일감을 등록하고 확정 상태를 봅니다">
            <div className="border-b border-border-subtle pb-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-caption-lg text-typography-secondary">{step.employer.hub} · {step.employer.name}</p>
                  <h2 className="mt-1 text-heading-sm font-bold">{step.posting.title}</h2>
                </div>
                <Badge color={phase === "accepted" ? "green" : "brand"} size="sm">
                  {phase === "posting" ? "등록 완료" : phase === "matching" ? "후보 탐색 중" : phase === "offered" ? "제안 중" : "매칭 완료"}
                </Badge>
              </div>

              {step.posting.employmentType && (
                <Badge className="mt-3" color={EMPLOYMENT_COLOR[step.posting.employmentType] ?? "gray"} size="sm">
                  {EMPLOYMENT_LABEL[step.posting.employmentType] ?? step.posting.employmentType}
                </Badge>
              )}

              <div className="mt-4 grid grid-cols-3 divide-x divide-border-subtle rounded-brand-md bg-fill-element-surface p-3">
                <JobFact icon={<IconWonLine />} label="시급" value={`${step.posting.hourlyRate.toLocaleString()}원`} />
                <JobFact icon={<IconClockLine />} label="근무" value={`${step.posting.durationHours}시간`} />
                <JobFact icon={<Users />} label="인원" value={`${step.posting.headcount}명`} />
              </div>
            </div>

            <div className="pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-body-base font-semibold">매칭 상태</h3>
                <span className="text-caption-lg text-typography-subtle">{idx + 1}/{steps.length}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-fill-element-surface" role="progressbar" aria-label="현재 매칭 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={(activePhaseIndex + 1) * 25}>
                <div className={`h-full rounded-full transition-all ${phase === "accepted" ? "bg-fill-element-success" : "bg-fill-element-brand"}`} style={{ width: `${(activePhaseIndex + 1) * 25}%` }} />
              </div>

              <div className="mt-5 flex min-h-32 items-center gap-3 rounded-brand-md border border-border-subtle bg-background p-4">
                {phase === "accepted" ? (
                  <>
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-fill-element-success-subtle">
                      <CheckCircle2 className="size-6 icon-success" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-caption-lg text-typography-success">수락 확정</p>
                      <p className="mt-1 text-body-base font-semibold">{workerLabel}</p>
                      <p className="mt-1 text-caption-lg text-typography-secondary">예상 도착 17:56 · 거리 1.2km</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-fill-element-brand-subtle">
                      <Search className="size-6 icon-brand" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-body-base font-semibold">적합한 워커를 찾고 있어요</p>
                      <p className="mt-1 text-caption-lg text-typography-secondary">조건에 맞는 후보부터 순서대로 제안합니다.</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </RolePanel>

          <RolePanel icon={<User />} label="워커" description="현재 가능한 조건에 맞는 제안을 확인합니다" emphasis={phase === "offered"}>
            {phase === "posting" || phase === "matching" ? (
              <div className="flex min-h-[392px] flex-col items-center justify-center text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-fill-element-brand-subtle">
                  <Sparkles className="size-7 icon-brand" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-heading-sm font-bold">내 조건에 맞는 제안을 찾는 중</h2>
                <p className="mt-2 max-w-xs text-body-sm text-typography-secondary">가능 시간과 이동 거리, 업무 경험을 함께 확인하고 있어요.</p>
                <Badge className="mt-4" color="brand" size="sm">AI 추정</Badge>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge color="brand" size="sm">AI 추정</Badge>
                      <span className="text-caption-lg text-typography-secondary">새 제안</span>
                    </div>
                    <h2 className="mt-3 text-heading-sm font-bold">{step.posting.title}</h2>
                    <p className="mt-1 text-body-sm text-typography-secondary">{step.employer.hub} · {step.employer.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-caption-lg text-typography-secondary">남은 시간</p>
                    <p className="mt-1 text-heading-lg font-extrabold tabular-nums text-typography-brand">00:12</p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 divide-x divide-border-subtle border-y border-border-subtle py-4">
                  <OfferFact icon={<IconWonLine />} label="시급" value={`${step.posting.hourlyRate.toLocaleString()}원`} />
                  <OfferFact icon={<IconPinFill />} label="거리" value="1.2km" />
                  <OfferFact icon={<IconClockLine />} label="근무" value={`${step.posting.durationHours}시간`} />
                </div>

                <div className="mt-5">
                  <h3 className="flex items-center gap-1.5 text-body-sm font-semibold"><Sparkles className="size-4 icon-brand" aria-hidden="true" />AI 추천 이유</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge color="brand" size="sm">거리 1.2km</Badge>
                    <Badge color="brand" size="sm">가능 시간 일치</Badge>
                    <Badge color="brand" size="sm">직종 경험 일치</Badge>
                  </div>
                  <p className="mt-3 text-caption-lg text-typography-subtle">추천 결과는 예측값이며 실제 적합도와 다를 수 있습니다.</p>
                </div>

                {phase === "accepted" ? (
                  <div className="mt-6 flex min-h-24 items-center gap-3 rounded-brand-md bg-fill-element-success-subtle p-4 text-typography-success">
                    <CheckCircle2 className="size-7 shrink-0 icon-success" aria-hidden="true" />
                    <div>
                      <p className="text-body-base font-semibold">제안을 수락했어요</p>
                      <p className="mt-1 text-caption-lg">구인자에게 확정 결과를 전달했습니다.</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 grid grid-cols-[2fr_1fr] gap-2">
                    <Button iconLeading={<CheckCircle2 />} onClick={() => setPhase("accepted")} size="lg" variant="primary">제안 수락</Button>
                    <Button onClick={rejectOffer} size="lg" variant="outlineTertiary">거절</Button>
                  </div>
                )}
              </div>
            )}
          </RolePanel>

          <RolePanel icon={<Activity />} label="매칭 운영" description="후보 탐색부터 확정까지 근거와 상태를 봅니다">
            <div className="flex items-center justify-between">
              <h2 className="text-body-base font-semibold">매칭 지도</h2>
              <Badge color="gray" iconLeading={<ShieldCheck />} size="sm">개인정보 비노출</Badge>
            </div>
            <MatchingMap matchedSoFar={matchedSoFar} phase={phase} step={step} />

            <div className="mt-4">
              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                <h3 className="text-body-base font-semibold">후보 순위</h3>
                <Badge color="brand" size="sm">AI 추정</Badge>
              </div>
              {phase === "posting" ? (
                <div className="flex min-h-40 flex-col items-center justify-center text-center text-typography-secondary">
                  <Target className="size-7 icon-subtle" aria-hidden="true" />
                  <p className="mt-2 text-body-sm">공고 조건이 등록되면 후보를 계산합니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-border-subtle">
                  <CandidateRank rank={1} score={96} reasons="거리 · 가능시간 · 경험" active />
                  <CandidateRank rank={2} score={88} reasons="거리 · 가능시간" />
                  <CandidateRank rank={3} score={78} reasons="가능시간 · 경험" />
                </div>
              )}
            </div>
          </RolePanel>
        </div>

        <section aria-label="매칭 퍼널" className="mt-4 grid rounded-brand-lg border border-border bg-background p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-4 lg:p-5">
          <FunnelKpi icon={<Search />} label="후보 탐색" value={`${totalWorkers.toLocaleString()}명`} />
          <FunnelKpi icon={<Target />} label="조건 충족" value={`${qualifiedCount.toLocaleString()}명`} />
          <FunnelKpi icon={<Send />} label="제안" value="5명" />
          <FunnelKpi icon={<Timer />} label="확정 시간" value={`${step.acceptedSecondsToDecide ?? "—"}초`} success={phase === "accepted"} />
        </section>

        <p className="mt-3 text-center text-caption-lg text-typography-subtle">
          시연용 합성 데이터 · 실제 내부 DB 미연결 · 결제·정산 제외
        </p>
      </div>
    </main>
  )
}

function RolePanel({
  icon,
  label,
  description,
  emphasis = false,
  children,
}: {
  icon: React.ReactNode
  label: string
  description: string
  emphasis?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-brand-lg border bg-background p-4 shadow-xs transition-colors sm:p-5 ${emphasis ? "border-border-brand" : "border-border"}`}>
      <div className="mb-4 flex items-start gap-3 border-b border-border-subtle pb-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-brand-md bg-fill-element-brand-subtle text-typography-brand [&_svg]:size-5" aria-hidden="true">{icon}</span>
        <div>
          <h2 className="text-heading-xs font-bold">{label}</h2>
          <p className="mt-0.5 text-caption-lg text-typography-secondary">{description}</p>
        </div>
      </div>
      {children}
    </section>
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

function MatchingMap({ matchedSoFar, phase, step }: { matchedSoFar: DemoStep[]; phase: Phase; step: DemoStep }) {
  const employerPoint = project(step.employer.location)
  const workerPoint = project(step.worker.location)
  const workerVisible = phase !== "posting"
  const routeVisible = phase === "offered" || phase === "accepted"

  return (
    <div className="mt-3 overflow-hidden rounded-brand-md border border-border-subtle bg-fill-layer-surface" aria-label="강남구 매칭 위치 지도">
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="h-auto w-full" role="img" aria-labelledby="matching-map-title">
        <title id="matching-map-title">구인자와 익명 워커 후보 사이의 매칭 경로</title>
        <defs>
          <pattern id="xds-map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" className="fill-none stroke-border-subtle" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#xds-map-grid)" />
        <path d="M 0 58 C 82 36, 126 80, 220 54 S 360 24, 480 58" className="fill-none stroke-border" strokeWidth="9" opacity="0.55" />
        <path d="M 72 210 C 118 130, 190 140, 254 102 S 380 82, 430 0" className="fill-none stroke-border" strokeWidth="7" opacity="0.45" />
        {matchedSoFar.map((matched) => {
          const employer = project(matched.employer.location)
          const worker = project(matched.worker.location)
          return <line key={matched.postingId} x1={employer.x} y1={employer.y} x2={worker.x} y2={worker.y} className="stroke-border-brand-subtle" strokeWidth="1.5" />
        })}
        {routeVisible && <line x1={employerPoint.x} y1={employerPoint.y} x2={workerPoint.x} y2={workerPoint.y} className="stroke-brand-500" strokeWidth="3" strokeDasharray="7 5" />}
        <circle cx={employerPoint.x} cy={employerPoint.y} r="9" className="fill-fill-element-brand stroke-background" strokeWidth="4" />
        {workerVisible && <circle cx={workerPoint.x} cy={workerPoint.y} r="9" className="fill-fill-element-success stroke-background" strokeWidth="4" />}
      </svg>
      <div className="flex items-center justify-between border-t border-border-subtle bg-background px-3 py-2 text-caption-base text-typography-secondary">
        <span className="flex items-center gap-1"><Store className="size-3.5 icon-brand" aria-hidden="true" />구인 위치</span>
        <span className="flex items-center gap-1"><User className="size-3.5 icon-success" aria-hidden="true" />익명 후보 위치</span>
      </div>
    </div>
  )
}

function CandidateRank({ rank, score, reasons, active = false }: { rank: number; score: number; reasons: string; active?: boolean }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3">
      <span className={`flex size-6 items-center justify-center rounded-brand-xs text-caption-base font-semibold ${active ? "bg-fill-element-brand text-typography-static-white" : "bg-fill-element-surface text-typography-secondary"}`}>{rank}</span>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-body-sm font-semibold">후보 {String.fromCharCode(64 + rank)}-{String(rank).padStart(2, "0")}</p>
          <span className="text-caption-lg font-semibold tabular-nums">{score}점</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fill-element-surface">
          <div className="h-full rounded-full bg-fill-element-brand" style={{ width: `${score}%` }} />
        </div>
      </div>
      <p className="hidden max-w-28 text-right text-caption-base text-typography-subtle sm:block">{reasons}</p>
    </div>
  )
}

function FunnelKpi({ icon, label, value, success = false }: { icon: React.ReactNode; label: string; value: string; success?: boolean }) {
  return (
    <div className="flex min-h-20 items-center gap-3 border-b border-border-subtle p-3 last:border-b-0 sm:[&:nth-child(3)]:border-b-0 sm:[&:nth-child(4)]:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${success ? "bg-fill-element-success-subtle text-typography-success" : "bg-fill-element-brand-subtle text-typography-brand"} [&_svg]:size-5`} aria-hidden="true">{icon}</span>
      <div>
        <p className="text-caption-lg text-typography-secondary">{label}</p>
        <p className={`mt-0.5 text-heading-sm font-extrabold tabular-nums ${success ? "text-typography-success" : "text-typography"}`}>{value}</p>
      </div>
    </div>
  )
}
