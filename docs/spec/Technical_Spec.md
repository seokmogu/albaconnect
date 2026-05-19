# [Spec] 알바몬 커넥트 시뮬레이터 기술 명세

**대상 PRD**: PRD_AlbaConnect_Simulator.md
**작성일**: 5월 18일 (5월 19일 현행화 — 용역 트랙·분쟁·지오펜스·고용형태 반영)
**범위**: 시뮬레이터(`/sim/*`) 전체 + 데이터 모델 + 매칭 엔진

---

## 1. 시스템 구성

| 레이어 | 기술 | 위치 |
|--------|------|------|
| 데이터 생성 | Node ESM 시드 스크립트 + claude CLI(haiku) | `albaconnect/sim/seed/` |
| 매칭 엔진 | Node ESM, 6요소 스코어링 | `albaconnect/sim/runner/run-dispatch.mjs` |
| 데이터 저장 | JSON 스냅샷 | `albaconnect/sim/data/*.json` |
| UI | Next.js 15 App Router | `albaconnect/apps/web/src/app/sim/` |

시뮬레이터 데이터 생성의 LLM 호출은 `claude -p --model claude-haiku-4-5` 헤드리스
모드(OAuth 프로파일, API 키 아님)를 사용한다. 백엔드 API 에이전트는 별도 경로
(Anthropic SDK) — `Backend_LLM_Agents.md` 참조.

### 1.1 `_lib` 모듈 — 서버/클라이언트 경계

`apps/web/src/app/sim/_lib/`는 서버 전용 파일과 클라이언트 안전 순수 파일을 구분한다.

| 파일 | 분류 | 역할 |
|------|------|------|
| `data.ts` | **서버 전용** (`node:fs`) | JSON 스냅샷 로더, Employer/Posting/Worker/Dispatch 타입 |
| `service.ts` | 순수 (클라이언트 안전) | 용역 트랙 타입·라벨, 위장도급 감지 |
| `geo.ts` | 순수 | Haversine 거리, 지오펜스 판정 |
| `dispute.ts` | 순수 | 분쟁 유형 분류(규칙 기반), 샘플 분쟁 |
| `legal.ts` | 순수 | 카테고리 법적 등급 상수 |

> [HARD] 클라이언트 컴포넌트(`"use client"`)는 `data.ts`에서 **값(value)을
> import 하면 빌드가 깨진다**(`node:fs` 번들링 불가). type-only import만 허용하며,
> 값이 필요하면 순수 파일(`service.ts`/`geo.ts`/`dispute.ts`/`legal.ts`)에서 가져온다.
> `data.ts`는 서버 페이지 호환을 위해 `service.ts`의 용역 타입을 re-export 한다.

---

## 2. 데이터 모델

### 2.1 Employer (사업장)

```
id            string   "emp-001" ~
name          string
category      enum     cafe|restaurant|retail|event|cleaning|delivery|manufacturing|other
dong          string   행정동
nearestHub    string   인접 지하철역
location      {lat,lng}
persona       string   LLM 시뮬용 매장 페르소나
avgRating     number
reviewCount   number
monthlyJobBudget number
createdAt     string
```

### 2.2 Posting (공고) + EmploymentType

```
Posting:
  id              string
  employerId      string
  employerName    string
  employerLocation {lat,lng}
  rawText         string   사장님 자연어 공고 (LLM 생성)
  draft           PostingDraft
  employmentType  EmploymentType?   고용형태 (선택)
  createdAt       string

PostingDraft:
  title, category, hourlyRate, headcount, durationHours,
  startAtIso?, address, description, tags, confidence

EmploymentType:  "gig" | "daily" | "short" | "long"
  gig=긱(건단위 초단기), daily=일일, short=단기, long=장기(정기)
```

### 2.3 Worker (구직자)

```
id              string   "w-0001" ~
name, persona   string
location        {lat,lng}
categories      string[]
avgRating       number   신규는 0
ratingCount     number
completionRate  number   0.85~1.0
verified        boolean
lastSeenAt      number   epoch ms
available       boolean  스케줄·라이브 미설정 워커의 하위호환 가용성
availability    Availability?              US-10/US-11 가용성
preferredEmploymentTypes  EmploymentType[]?  선호 고용형태
```

### 2.4 Availability (워커 가용성, US-10/US-11)

```
schedule  ScheduleRule[]   예약 스케줄 규칙 (US-10)
live      { enabled, currentLocation: {lat,lng}|null, radiusMeters }   라이브 매칭 (US-11)

ScheduleRule:
  id, days(number[] 0=일~6=토), startMin(0~1439), endMin,
  hubName, center{lat,lng}, radiusMeters(기본 3000)
```

### 2.5 Dispatch (매칭 결과)

```
postingId, employerName?, jobCategory?,
rankedWorkerIds string[], scores { workerId: number },
decisions [{ workerId, decision, reason, secondsToDecide, score }]?,
acceptedBy string|null, acceptedReason?, acceptedAt?, acceptedSecondsToDecide?,
notifiedAt string, reason?
```

### 2.6 ServiceRequest (개인 C2C 용역, US-15)

`_lib/service.ts`. 고용 트랙과 별개 — 개인 간 도급계약.

```
id              string
requesterName   string
requesterType   "individual"
contractType    "service"
serviceCategory ServiceCategory
title, description  string
location        {lat,lng}
hubName         string
fee             number   건당 보수 (시급 아님)
estimatedHours  number
legalGrade      "A" | "B"
createdAt       string

ServiceCategory:  errand|homecleaning|assembly|moving|pet|queue|walkdelivery (7종 비전문)
ContractType:     "employment" | "service"
```

### 2.7 Dispute (분쟁, US-14 시뮬용)

`_lib/dispute.ts`. 백엔드 LLM 트리아지의 시뮬용 규칙 기반 대응물.

```
Dispute:  id, postingTitle, reporter("employer"|"worker"), description, claimAmount
DisputeType:  noshow|poorwork|nonpayment|late|other
triageDispute(d) → { type, severity(high|medium|low), recommendedAction, reservePayout }
```

---

## 3. 매칭 알고리즘 (6요소 가중)

`run-dispatch.mjs`의 `scoreMatch()`.

| 요소 | 최대 점수 | 산식 |
|------|----------|------|
| 거리 | 32 | `max(0, 1 - dist/radius) × 32` |
| 평점 | 23 | `ratingCount>0 ? ((avgRating-1)/4)×18+5 : 11.5` |
| 직종 일치 | 18 | 카테고리 포함 시 18, 아니면 0 |
| 신뢰도 | 13 | `(completionRate×0.7 + verified×0.3) × 13` |
| 가용성 | 8 | 가용성 판정(§3.1) 통과 시 8 |
| 활동성 | 6 | 마지막 접속 <1h:6 / <24h:4 / <7d:2 / 그외:0 |

- 반경 기본 5,000m. 반경 밖 워커는 후보 제외.
- 신규 워커(평점 없음)는 평점 11.5점으로 cold-start 보호.
- 고용형태 필터: 공고의 `employmentType`이 워커의 `preferredEmploymentTypes`에
  없으면 후보 제외.
- dispatch는 top-N에 알림, top-DECIDE_N이 순차 LLM 수락 판단, 첫 수락자로 확정.

### 3.1 가용성 판정 (`isCandidate`)

```
scheduleHit = availability?.schedule.some(rule =>
    rule.days.includes(weekday(job.startAt))
    AND minOfDay(job.startAt) ∈ [rule.startMin, rule.endMin)
    AND distance(job.location, rule.center) <= rule.radiusMeters)
liveHit = availability?.live.enabled
    AND live.currentLocation != null
    AND distance(job.location, live.currentLocation) <= live.radiusMeters
hasAvailability = availability != null AND (schedule.length>0 OR live.enabled)
return hasAvailability ? (scheduleHit OR liveHit) : worker.available
```

---

## 4. 라우트 명세

| 라우트 | 화면 | US |
|--------|------|-----|
| `/sim` | 시뮬레이터 메인 — 사장님/워커/용역 진입 | - |
| `/sim/login/employer` | 구인자 로그인 (임의) | - |
| `/sim/login/worker` | 구직자 로그인 (임의) | - |
| `/sim/me` | 역할·ID 진입 화면 | US-4 |
| `/sim/me/employer/[id]` | 구인자 마이페이지 | US-1 |
| `/sim/me/worker/[id]` | 구직자 마이페이지 (모바일 우선) | US-2, US-3, US-10, US-11, US-12, US-13 |
| `/sim/admin` | 관제 대시보드 (+ 분쟁 트리아지 패널) | US-5, US-6, US-14 |
| `/sim/employer`, `/sim/employer/[id]` | 사업장 목록·상세 (관리자 시점) | - |
| `/sim/worker`, `/sim/worker/[id]` | 구직자 목록·상세 (관리자 시점) | US-7 |
| `/sim/service` | 개인 C2C 용역 의뢰 목록 | US-15 |
| `/sim/demo` | 3분할 실시간 데모 (영상 녹화용) | - |

> 관리자 시점 화면(`/sim/employer/[id]` 등)과 본인 시점 마이페이지(`/sim/me/*`)는
> 별개 네임스페이스로 공존한다.

---

## 5. 구직자 마이페이지 (`/sim/me/worker/[id]`)

`WorkerMyPageClient.tsx` — 모바일 우선, 4개 탭(알림·일감·스케줄·내정보).

- **알림(US-2/3)**: 받은 dispatch, 수락→전자 근로 합의서 모달(US-13)→일감 이동
- **일감(US-12)**: 진행 일감별 지오펜스 체크인 — Haversine 반경 200m,
  반경 밖이면 거부, 체크인/체크아웃 시각으로 근로시간 기록
- **스케줄(US-10)**: 요일·시간·지역 가용성 규칙 CRUD
- **라이브(US-11)**: 헤더 토글 — 현재 위치 기반 매칭

상태는 **세션 메모리** (새로고침 시 스냅샷 기준 리셋). 클라이언트 컴포넌트이므로
`data.ts`는 type-only import, 값은 `legal.ts`/`geo.ts`에서.

---

## 6. 용역 트랙 (`/sim/service`, US-15)

- 서버 페이지가 `loadServiceRequests()`로 의뢰 로드, 카테고리 필터(`?cat=`)
- `ServiceCardList`(클라이언트): 카드 + 전자 용역 합의서 모달(도급계약·근로계약 아님)
- 위장도급 감지: `detectRepeatRequesters` — (의뢰자 × 동일 카테고리) 3건 이상이면
  반복 의뢰자로 판정, 해당 카드에 고용형 트랙 전환 안내

---

## 7. 분쟁 트리아지 (`/sim/admin`, US-14)

`DisputeTriagePanel` — `dispute.ts`의 샘플 분쟁을 규칙 기반 트리아지.
유형 분포·분쟁 준비금 현황(총 200만원, high 등급 청구액 60% 선보상)·권장 조치 표시.

---

## 8. 데이터 의존성

| 데이터 | 출처 | 갱신 |
|--------|------|------|
| 강남구 실 비율 | Athena `rdb_mongi.mon_guin_db` 등 | `dskit` / `aws athena` (ldp-viewer SSO) |
| employers/postings/workers | `sim/seed/*.mjs` (시드 RNG + haiku) | `node sim/seed/...` |
| availability/employmentType | `add-availability.mjs`, `add-employment-type.mjs` | RNG 패치 |
| service-requests (120건) | `seed-service-requests.mjs` (RNG) | `node sim/seed/seed-service-requests.mjs` |
| dispatches | `run-dispatch.mjs` | `node sim/runner/run-dispatch.mjs --decide 2` |

---

## 9. 제약 및 비범위

- 실제 인증/세션 없음. 로그인·ID 선택이 인증을 대체.
- 결제·정산은 표시만, 실제 토스 연동 없음.
- 마이페이지 상태는 세션 메모리 — 영속 저장 없음.
- US-14 분쟁 트리아지는 규칙 기반(시뮬). 실제 LLM 트리아지는 백엔드 에이전트.
- 노쇼 재디스패치 시뮬(Phase 3)은 미구현.
