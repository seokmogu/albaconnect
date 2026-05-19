# [Spec] 알바몬 커넥트 마케팅 랜딩 페이지

**라우트**: `/` (`(marketing)` 라우트 그룹)
**구현**: `apps/web/src/app/(marketing)/`
**작성일**: 5월 19일
**산출 경로**: AI Agency 파이프라인(Planner→Copywriter→Designer→Builder→Evaluator)

---

## 1. 개요

알바몬 커넥트의 공개 마케팅 랜딩 페이지. AI Agency 파이프라인(`/agency build`)이
BRIEF로부터 카피·디자인·코드를 생성한 산출물이다. 카피는 `_content/copy.ts`에
구조화 JSON으로 분리돼 있어 디자인/코드와 독립적으로 수정 가능하다.

---

## 2. 디렉터리 구성

| 경로 | 역할 |
|------|------|
| `(marketing)/layout.tsx` | 마케팅 전용 레이아웃 (데스크탑 뷰포트 확장 래퍼) |
| `(marketing)/page.tsx` | 섹션 컴포넌트 조립 |
| `(marketing)/_components/` | 섹션·헤더·푸터 컴포넌트 12개 |
| `(marketing)/_content/copy.ts` | 전체 카피 (구조화 JSON) |
| `(marketing)/_lib/waitlist.ts` | 웨이트리스트 제출 (현재 stub) |

---

## 3. 섹션 구성 (`page.tsx` 순서)

| # | 컴포넌트 | 내용 |
|---|----------|------|
| 1 | `Hero` | 헤드라인, 구인자/구직자 CTA, 결제 배지, 신뢰 배지 |
| 2 | `HowItWorks` | 단계별 이용 흐름 (actor별) |
| 3 | `MatchingAlgorithm` | 6요소 가중 매칭 알고리즘 소개 |
| 4 | `Pricing` | 과금 모델 |
| 5 | `ForEmployers` | 구인자(사장님) 관점 가치 제안 |
| 6 | `ForWorkers` | 구직자(워커) 관점 가치 제안 |
| 7 | `TrustSafety` | 신뢰·안전 (에스크로·합의서·분쟁) |
| 8 | `Stats` | 지표 |
| 9 | `FAQ` | 자주 묻는 질문 |
| 10 | `FinalCTA` | 마무리 전환 유도 |

`Header`·`Footer`는 `layout.tsx`에서 페이지 외곽으로 배치.

---

## 4. 카피 (`_content/copy.ts`)

최상위 키 13개: `meta`, `header`, `hero`, `howItWorks`, `matchingAlgorithm`,
`pricing`, `forEmployers`, `forWorkers`, `trustSafety`, `stats`, `faq`,
`finalCta`, `footer`. 각 섹션 컴포넌트는 해당 키만 참조한다.

`meta`는 `siteTitle`·`metaDescription`·`ogTitle`·`ogDescription`을 담아
Next.js Metadata API로 연결된다.

---

## 5. 웨이트리스트 (`_lib/waitlist.ts`)

`submitWaitlist(payload)` — 현재는 600ms 지연 후 성공을 반환하는 **stub**.

```
WaitlistPayload: { role: "employer"|"worker", email, phone?, region, consent }
WaitlistResult:  { ok: boolean, message? }
```

> ⚠️ 베타 출시 전 실제 `POST /api/waitlist` Fastify 엔드포인트로 교체 필요
> (코드 내 `@MX:TODO` 표시).

---

## 6. 제약 및 비범위

- 웨이트리스트 제출은 stub — 실제 백엔드 연동 미완
- 시뮬레이터(`/sim`)와 별개 — 마케팅은 공개 페이지, 시뮬은 내부 검증 환경
- 데스크탑 뷰포트: 루트 레이아웃의 모바일 `max-w-md` 제약을 `layout.tsx`의
  뷰포트 확장 래퍼(`relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen overflow-x-hidden`)로 우회
