"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import api from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-error"
import { Badge } from "@/xds/components/Badge/Badge"
import { Button } from "@/xds/components/Button/Button"
import { InfoBanner } from "@/xds/components/InfoBanner/InfoBanner"
import { IconArrowLeft } from "@/xds/icons/IconArrowLeft"
import { IconCalendar } from "@/xds/icons/IconCalendar"
import { IconClockLine } from "@/xds/icons/IconClockLine"
import { IconPinFill } from "@/xds/icons/IconPinFill"
import { IconWonLine } from "@/xds/icons/IconWonLine"

interface JobDetail {
  id: string
  title: string
  category: string
  status: string
  address: string
  start_at: string
  end_at: string
  hourly_rate: number
  matched_count?: number
  headcount: number
  description: string
}

interface JobApplication {
  id: string
  status: string
  worker_id: string
  worker_name: string
  worker_rating?: number
  worker_categories?: string[]
}

interface MatchCandidate {
  candidateRef: string
  score: number
  scoreBreakdown: {
    distance: number
    rating: number
    skill: number
    reliability: number
    activity: number
    availability: number
  }
  distanceKm: number
  ratingAvg: number
  ratingCount: number
  categoryMatch: boolean
  categories: string[]
  completedJobsInCategory: number
  activitySignal: "within_24h" | "within_7d" | "stale" | "unknown"
  hasScheduleDeclared: boolean
}

interface MatchPreview {
  mode: "read_only"
  generatedAt: string
  job: { radiusKm: number }
  quality: {
    confidence: "low" | "medium" | "high"
    totalCandidates: number
    evaluatedCandidates: number
    poolTruncated: boolean
    categoryMatchRate: number
    ratedRate: number
    recent7dRate: number
    availabilityDeclaredRate: number
    historyRate: number
  }
  warnings: Array<{ code: string; message: string }>
  candidates: MatchCandidate[]
}

const APP_STATUS_LABELS: Record<string, { label: string; color: "yellow" | "brand" | "green" | "gray" | "red" }> = {
  offered: { label: "수락 대기", color: "yellow" },
  accepted: { label: "확정", color: "brand" },
  completed: { label: "완료", color: "green" },
  rejected: { label: "거절", color: "gray" },
  timeout: { label: "시간 초과", color: "gray" },
  noshow: { label: "노쇼", color: "red" },
}

const JOB_STATUS_LABELS: Record<string, { label: string; color: "green" | "brand" | "gray" }> = {
  open: { label: "모집 중", color: "green" },
  matched: { label: "매칭 완료", color: "brand" },
  in_progress: { label: "근무 중", color: "brand" },
  completed: { label: "근무 완료", color: "gray" },
  cancelled: { label: "취소", color: "gray" },
}

const ACTIVITY_LABELS: Record<MatchCandidate["activitySignal"], string> = {
  within_24h: "24시간 내 활동",
  within_7d: "7일 내 활동",
  stale: "7일 이상 미활동",
  unknown: "활동 정보 없음",
}

const formatDate = (value: string) => new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
}).format(new Date(value))

const formatTime = (value: string) => new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date(value))

export default function JobDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [job, setJob] = useState<JobDetail | null>(null)
  const [applications, setApplications] = useState<JobApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState<MatchPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    api.get(`/jobs/${params.id}`)
      .then(({ data }) => {
        setJob(data.job)
        setApplications(data.applications ?? [])
      })
      .finally(() => setLoading(false))
  }, [params.id])

  const loadPreview = async () => {
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const { data } = await api.get<MatchPreview>(`/jobs/${params.id}/match-preview?limit=5`)
      setPreview(data)
    } catch (error: unknown) {
      setPreviewError(getApiErrorMessage(error, "후보 분석을 불러오지 못했습니다."))
    } finally {
      setPreviewLoading(false)
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-body-xs text-typography-subtle">공고를 불러오는 중입니다.</div>
  }
  if (!job) {
    return <div className="py-12 text-center text-body-xs text-typography-secondary">공고를 찾을 수 없습니다.</div>
  }

  const jobStatus = JOB_STATUS_LABELS[job.status] ?? { label: job.status, color: "gray" as const }
  const acceptedCount = applications.filter((application) => application.status === "accepted").length

  return (
    <main className="min-h-screen bg-background-subtle pb-10 text-typography-default">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-5 py-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex size-10 shrink-0 items-center justify-center rounded-brand-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="이전 화면으로 이동"
        >
          <IconArrowLeft className="size-5 icon-default" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-heading-xs font-semibold">공고 매칭 점검</h1>
      </header>

      <div className="space-y-3 px-4 py-4">
        <section className="rounded-brand-lg bg-background px-5 py-5" aria-labelledby="job-summary-title">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge color="brand" size="sm">{job.category}</Badge>
            <Badge color={jobStatus.color} size="sm">{jobStatus.label}</Badge>
          </div>
          <h2 id="job-summary-title" className="break-keep text-heading-sm font-bold">{job.title}</h2>
          <div className="mt-4 space-y-2 text-body-xs text-typography-secondary">
            <p className="flex items-start gap-2"><IconPinFill className="mt-0.5 size-4 shrink-0 icon-subtle" />{job.address}</p>
            <p className="flex items-center gap-2"><IconCalendar className="size-4 shrink-0 icon-subtle" />{formatDate(job.start_at)}</p>
            <p className="flex items-center gap-2"><IconClockLine className="size-4 shrink-0 icon-subtle" />{formatTime(job.start_at)}–{formatTime(job.end_at)}</p>
            <p className="flex items-center gap-2"><IconWonLine className="size-4 shrink-0 icon-subtle" />시급 {Number(job.hourly_rate).toLocaleString()}원</p>
          </div>
          <div className="mt-4 border-t border-border pt-4 text-body-xs text-typography-secondary">
            <p className="break-keep">{job.description}</p>
            <p className="mt-3 font-semibold text-typography-default">확정 {job.matched_count ?? 0}명 / 모집 {job.headcount}명</p>
          </div>
        </section>

        <section className="rounded-brand-lg bg-background px-5 py-5" aria-labelledby="matching-preview-title">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <h2 id="matching-preview-title" className="text-heading-xs font-bold">내부 DB 매칭 프리뷰</h2>
              <Badge color="purple" size="sm">AI 추정</Badge>
            </div>
            <p className="mt-1 break-keep text-caption-lg text-typography-secondary">후보를 만들거나 알림을 보내지 않고 현재 데이터의 매칭 품질만 확인합니다.</p>
          </div>

          <InfoBanner
            variant="highlight"
            title="읽기 전용 점검"
            description="지원·배정·결제·정산 상태는 변경하지 않습니다. 후보 이름과 연락처도 표시하지 않습니다."
          />

          {previewError ? (
            <InfoBanner className="mt-3" variant="negative" title="분석 실패" description={previewError} />
          ) : null}

          {!preview ? (
            <div className="mt-4">
              <Button className="w-full" size="lg" onClick={loadPreview} disabled={previewLoading}>
                {previewLoading ? "내부 데이터를 분석하는 중…" : "내부 DB로 후보 분석"}
              </Button>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-body-xs font-semibold">반경 {preview.job.radiusKm}km 후보</p>
                  <Badge color={preview.quality.confidence === "high" ? "green" : preview.quality.confidence === "medium" ? "yellow" : "red"} size="sm">
                    데이터 신뢰도 {preview.quality.confidence === "high" ? "높음" : preview.quality.confidence === "medium" ? "보통" : "낮음"}
                  </Badge>
                </div>
                <p className="mt-1 text-heading-lg font-bold">{preview.quality.totalCandidates.toLocaleString()}명</p>
                <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-brand-md bg-border">
                  <QualityMetric label="업종 일치" value={preview.quality.categoryMatchRate} />
                  <QualityMetric label="평점 보유" value={preview.quality.ratedRate} />
                  <QualityMetric label="최근 7일 활동" value={preview.quality.recent7dRate} />
                  <QualityMetric label="가능 시간 등록" value={preview.quality.availabilityDeclaredRate} />
                </div>
              </div>

              {preview.warnings.length > 0 ? (
                <div className="space-y-2">
                  {preview.warnings.map((warning) => (
                    <InfoBanner key={warning.code} variant="negative" title="데이터 보완 필요" description={warning.message} />
                  ))}
                </div>
              ) : null}

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-body-base font-bold">추천 후보 상위 {preview.candidates.length}명</h3>
                  <button type="button" onClick={loadPreview} disabled={previewLoading} className="text-caption-lg font-medium text-typography-brand underline disabled:text-typography-disabled">
                    다시 분석
                  </button>
                </div>
                {preview.candidates.length === 0 ? (
                  <p className="rounded-brand-md bg-fill-element-surface px-4 py-8 text-center text-body-xs text-typography-secondary">조건에 맞는 후보가 없습니다.</p>
                ) : (
                  <ol className="space-y-2">
                    {preview.candidates.map((candidate) => (
                      <CandidateItem key={candidate.candidateRef} candidate={candidate} />
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-brand-lg bg-background px-5 py-5" aria-labelledby="applications-title">
          <div className="flex items-center justify-between">
            <h2 id="applications-title" className="text-heading-xs font-bold">실제 지원·배정 현황</h2>
            <Badge color="gray" size="sm">{acceptedCount}명 확정</Badge>
          </div>
          {applications.length === 0 ? (
            <p className="py-8 text-center text-body-xs text-typography-secondary">아직 생성된 지원 또는 배정이 없습니다.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {applications.map((application) => {
                const status = APP_STATUS_LABELS[application.status] ?? { label: application.status, color: "gray" as const }
                return (
                  <li key={application.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-body-xs font-semibold">{application.worker_name}</p>
                      <p className="mt-0.5 truncate text-caption-lg text-typography-secondary">
                        평점 {Number(application.worker_rating ?? 0).toFixed(1)} · {(application.worker_categories ?? []).slice(0, 2).join(", ") || "업종 미등록"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge color={status.color} size="sm">{status.label}</Badge>
                      {application.status === "accepted" ? (
                        <Link href={`/employer/review/${job.id}?workerId=${application.worker_id}&workerName=${application.worker_name}`} className="text-caption-lg font-medium text-typography-brand underline">
                          리뷰
                        </Link>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

function QualityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background px-3 py-3">
      <p className="text-caption-lg text-typography-secondary">{label}</p>
      <p className="mt-0.5 text-body-base font-bold">{value.toFixed(1)}%</p>
    </div>
  )
}

function CandidateItem({ candidate }: { candidate: MatchCandidate }) {
  return (
    <li className="rounded-brand-md border border-border px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-body-xs font-bold">{candidate.candidateRef}</p>
            {candidate.categoryMatch ? <Badge color="brand" size="sm">업종 일치</Badge> : null}
          </div>
          <p className="mt-1 text-caption-lg text-typography-secondary">
            {candidate.distanceKm.toFixed(1)}km · 평점 {candidate.ratingCount > 0 ? `${candidate.ratingAvg.toFixed(1)} (${candidate.ratingCount})` : "없음"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-heading-base font-bold text-typography-brand">{candidate.score.toFixed(1)}</p>
          <p className="text-caption-base text-typography-subtle">100점 만점</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge color={candidate.hasScheduleDeclared ? "green" : "gray"} size="sm">
          {candidate.hasScheduleDeclared ? "가능 시간 등록" : "가능 시간 미등록"}
        </Badge>
        <Badge color={candidate.activitySignal === "within_24h" || candidate.activitySignal === "within_7d" ? "blue" : "gray"} size="sm">
          {ACTIVITY_LABELS[candidate.activitySignal]}
        </Badge>
        {candidate.completedJobsInCategory > 0 ? <Badge color="green" size="sm">동일 업종 {candidate.completedJobsInCategory}회</Badge> : null}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
        <ScorePart label="거리" value={candidate.scoreBreakdown.distance} max={32} />
        <ScorePart label="평점" value={candidate.scoreBreakdown.rating} max={23} />
        <ScorePart label="업종·경험" value={candidate.scoreBreakdown.skill} max={18} />
      </dl>
    </li>
  )
}

function ScorePart({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div>
      <dt className="text-caption-base text-typography-subtle">{label}</dt>
      <dd className="mt-0.5 text-caption-lg font-semibold">{value.toFixed(1)} / {max}</dd>
    </div>
  )
}
