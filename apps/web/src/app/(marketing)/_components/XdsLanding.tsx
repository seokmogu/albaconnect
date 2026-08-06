import Link from "next/link"
import {
  ArrowRight,
  BriefcaseBusiness,
  ChevronRight,
  CircleUserRound,
  Database,
  ListChecks,
  Search,
  Send,
  Sparkles,
  UserRoundCheck,
} from "lucide-react"
import { Badge } from "@/xds/components/Badge/Badge"
import { IconClockLine } from "@/xds/icons/IconClockLine"
import { IconPinFill } from "@/xds/icons/IconPinFill"
import { IconWonLine } from "@/xds/icons/IconWonLine"
import { pocContent } from "../_content/poc"

const validationIcons = [Search, ListChecks, UserRoundCheck] as const

export function XdsLanding() {
  return (
    <>
      <section className="border-b border-border-subtle bg-background py-12 lg:py-20" aria-labelledby="hero-title">
        <div className="mx-auto grid w-full max-w-screen-xl gap-10 px-4 md:px-6 lg:grid-cols-12 lg:items-center xl:px-8">
          <div className="lg:col-span-5">
            <div className="flex flex-wrap gap-2">
              <Badge color="brand" size="sm">{pocContent.hero.eyebrow}</Badge>
              <Badge color="gray" size="sm">합성 데이터</Badge>
            </div>
            <h1 id="hero-title" className="mt-5 text-heading-lg font-extrabold tracking-tight md:text-heading-xl">
              {pocContent.hero.headline.split("\n").map((line) => <span key={line} className="block">{line}</span>)}
            </h1>
            <p className="mt-5 max-w-xl text-body-base leading-7 text-typography-secondary">
              {pocContent.hero.description}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/sim/demo" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-brand-md bg-fill-element-brand px-5 text-body-base font-semibold text-typography-static-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
                {pocContent.hero.primaryCta}<ArrowRight className="size-5" aria-hidden="true" />
              </Link>
              <a href="#validation" className="inline-flex min-h-[52px] items-center justify-center rounded-brand-md border border-border px-5 text-body-base font-semibold text-typography transition-colors hover:bg-fill-element-hover-weak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                {pocContent.hero.secondaryCta}
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-2" aria-label="현재 검증 경계">
              {pocContent.boundaries.map((boundary) => <Badge key={boundary} color="gray" size="sm">{boundary}</Badge>)}
            </div>
          </div>

          <div className="lg:col-span-7">
            <DemoPreview />
          </div>
        </div>
      </section>

      <section id="problem" className="bg-background-subtle py-14 lg:py-20" aria-labelledby="problem-title">
        <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
          <div className="max-w-2xl">
            <Badge color="brand" size="sm">문제 정의</Badge>
            <h2 id="problem-title" className="mt-4 text-heading-base font-bold md:text-heading-lg">{pocContent.comparison.title}</h2>
            <p className="mt-2 text-body-base text-typography-secondary">{pocContent.comparison.description}</p>
          </div>
          <div id="approach" className="mt-8 grid gap-4 lg:grid-cols-2">
            <FlowComparison label="검색·지원 중심" steps={pocContent.comparison.existing} />
            <FlowComparison label="제안·수락 중심" steps={pocContent.comparison.proposed} proposed />
          </div>
        </div>
      </section>

      <section id="validation" className="border-y border-border-subtle bg-background py-14 lg:py-20" aria-labelledby="validation-title">
        <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
          <div className="max-w-2xl">
            <Badge color="brand" size="sm">검증 범위</Badge>
            <h2 id="validation-title" className="mt-4 text-heading-base font-bold md:text-heading-lg">{pocContent.validation.title}</h2>
            <p className="mt-2 text-body-base text-typography-secondary">{pocContent.validation.description}</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {pocContent.validation.items.map((item, index) => {
              const Icon = validationIcons[index]
              return (
                <article key={item.title} className="rounded-brand-lg border border-border bg-background p-5 shadow-xs">
                  <span className="flex size-11 items-center justify-center rounded-brand-md bg-fill-element-brand-subtle text-typography-brand"><Icon className="size-5" aria-hidden="true" /></span>
                  <h3 className="mt-5 text-heading-xs font-bold">{item.title}</h3>
                  <p className="mt-2 text-body-sm leading-6 text-typography-secondary">{item.description}</p>
                  <Badge className="mt-5" color="gray" size="sm">{item.label}</Badge>
                </article>
              )
            })}
          </div>

          <div className="mt-6 grid gap-4 rounded-brand-lg border border-border bg-background p-5 shadow-xs md:grid-cols-[1fr_1.4fr] md:items-center">
            <div>
              <div className="flex items-center gap-2 text-body-sm font-semibold"><Database className="size-4 icon-brand" aria-hidden="true" />합성 데이터 스냅샷</div>
              <p className="mt-2 text-caption-lg text-typography-secondary">현재 수치는 UI와 흐름을 검증하기 위한 합성 데이터 기준입니다.</p>
            </div>
            <dl className="grid grid-cols-3 divide-x divide-border-subtle">
              {pocContent.snapshot.map((item) => (
                <div key={item.label} className="px-2 text-center">
                  <dd className="text-heading-sm font-extrabold tabular-nums">{item.value}</dd>
                  <dt className="mt-1 text-caption-lg text-typography-secondary">{item.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="bg-background-brand-subtle py-14" aria-labelledby="landing-cta-title">
        <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-5 px-4 md:flex-row md:items-center md:justify-between md:px-6 xl:px-8">
          <div>
            <h2 id="landing-cta-title" className="text-heading-base font-bold">두 화면을 한 번씩 눌러 매칭을 확인해 보세요</h2>
            <p className="mt-2 text-body-sm text-typography-secondary">구인자의 요청과 구직자의 수락이 어떻게 하나의 확정으로 이어지는지 직접 볼 수 있습니다.</p>
          </div>
          <Link href="/sim/demo" className="inline-flex min-h-[52px] shrink-0 items-center justify-center gap-2 rounded-brand-md bg-fill-element-brand px-5 text-body-base font-semibold text-typography-static-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
            클릭형 데모 시작<ArrowRight className="size-5" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  )
}

function DemoPreview() {
  return (
    <div className="rounded-brand-lg border border-border bg-background p-4 shadow-lg sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-4">
        <div>
          <p className="text-body-sm font-semibold">구인자와 구직자가 한 번씩 클릭</p>
          <p className="mt-1 text-caption-lg text-typography-secondary">자동재생 없이 직접 진행합니다</p>
        </div>
        <Badge color="brand" size="sm">클릭형 데모</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <div className="rounded-brand-md border border-border-subtle p-4">
          <div className="flex items-center gap-2 text-body-sm font-semibold"><BriefcaseBusiness className="size-4 icon-brand" aria-hidden="true" />구인자 화면</div>
          <p className="mt-4 text-caption-lg text-typography-secondary">양재역 골목 포차</p>
          <p className="mt-1 text-body-sm font-semibold">오늘 18:00 홀서빙 1명</p>
          <div className="mt-4 flex gap-3 text-caption-base text-typography-secondary">
            <span className="flex items-center gap-1"><IconWonLine className="size-4" />12,000원</span>
            <span className="flex items-center gap-1"><IconClockLine className="size-4" />6시간</span>
          </div>
          <div className="mt-5 flex min-h-10 items-center justify-center rounded-brand-md bg-fill-element-brand text-body-sm font-semibold text-typography-static-white">매칭 요청하기</div>
        </div>

        <div className="flex items-center justify-center text-typography-brand md:flex-col">
          <Send className="size-5 rotate-90 md:rotate-0" aria-hidden="true" />
          <span className="mx-2 text-caption-base font-semibold md:mx-0 md:mt-2">조건 매칭</span>
        </div>

        <div className="rounded-brand-md border border-border-brand-subtle bg-background-brand-subtle p-4">
          <div className="flex items-center justify-between gap-2 text-body-sm font-semibold"><span className="flex items-center gap-2"><CircleUserRound className="size-4 icon-brand" aria-hidden="true" />구직자 화면</span><Badge color="brand" size="sm">AI 추정</Badge></div>
          <p className="mt-4 text-caption-lg text-typography-secondary">새로운 제안</p>
          <p className="mt-1 text-body-sm font-semibold">오늘 18:00 홀서빙 1명</p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge color="white" size="sm"><IconPinFill />거리 1.2km</Badge>
            <Badge color="white" size="sm"><Sparkles />시간 일치</Badge>
          </div>
          <div className="mt-5 flex min-h-10 items-center justify-center rounded-brand-md bg-fill-element-brand text-body-sm font-semibold text-typography-static-white">제안 수락</div>
        </div>
      </div>
      <Link href="/sim/demo" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-brand-md border border-border text-body-sm font-semibold text-typography hover:bg-fill-element-hover-weak">
        직접 눌러보기<ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  )
}

function FlowComparison({ label, steps, proposed = false }: { label: string; steps: readonly string[]; proposed?: boolean }) {
  return (
    <article className={`rounded-brand-lg border p-5 ${proposed ? "border-border-brand bg-background-brand-subtle" : "border-border bg-background"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-body-base font-semibold">{label}</h3>
        <Badge color={proposed ? "brand" : "gray"} size="sm">{proposed ? "알바커넥트" : "기존 흐름"}</Badge>
      </div>
      <ol className="mt-5 flex flex-wrap items-center gap-2">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            <span className={`inline-flex min-h-10 items-center rounded-brand-md border px-3 text-body-sm font-medium ${proposed ? "border-border-brand-subtle bg-background text-typography-brand" : "border-border-subtle bg-fill-element-surface text-typography-secondary"}`}>{step}</span>
            {index < steps.length - 1 && <ChevronRight className={`size-4 ${proposed ? "icon-brand" : "icon-subtle"}`} aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </article>
  )
}
