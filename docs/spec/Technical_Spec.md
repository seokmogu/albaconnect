# [Spec] AlbaConnect 시뮬레이터 기술 명세

**대상 PRD**: PRD_AlbaConnect_Simulator.md
**작성일**: 5월 18일
**범위**: Phase 1 마이페이지 + Phase 2 관제 대시보드 (구현 완료분 포함)

---

## 1. 시스템 구성

| 레이어 | 기술 | 위치 |
|--------|------|------|
| 데이터 생성 | Node ESM 시드 스크립트 + claude CLI(haiku) | `albaconnect/sim/seed/` |
| 매칭 엔진 | Node ESM, 6요소 스코어링 | `albaconnect/sim/runner/run-dispatch.mjs` |
| 데이터 저장 | JSON 스냅샷 | `albaconnect/sim/data/*.json` |
| UI | Next.js 15 App Router (서버 컴포넌트) | `albaconnect/apps/web/src/app/sim/` |

LLM 호출은 `claude -p --model claude-haiku-4-5` 헤드리스 모드를 사용하며 API 키가 아니라 OAuth 프로파일을 사용한다.

---

## 2. 데이터 모델

### 2.1 Employer (사업장)

```
id            string   "emp-001" ~ "emp-312"
name          string
category      enum     cafe|restaurant|retail|event|cleaning|delivery|manufacturing|other
dong          string   행정동
nearestHub    string   인접 지하철역
location      {lat,lng}
persona       string   LLM 시뮬용 매장 페르소나
avgRating     number   3.8~4.9
reviewCount   number
monthlyJobBudget number
```

### 2.2 Posting (공고)

```
id            string   "post-0001" ~
employerId    string
employerLocation {lat,lng}
rawText       string   사장님 자연어 공고 (LLM 생성)
draft         {title, category, hourlyRate, headcount, durationHours,
               startAtIso, address, description, tags, confidence}
```

### 2.3 Worker (구직자)

```
id              string   "w-0001" ~ "w-9950"
name            string
persona         string   LLM 생성 자기소개 1줄
location        {lat,lng}   거주지/기준 위치
categories      string[] 1~2개
avgRating       number   신규는 0
ratingCount     number
completionRate  number   0.85~1.0
verified        boolean
lastSeenAt      number   epoch ms
available       boolean  스케줄·라이브 미설정 워커의 하위호환 가용성
availability    Availability   US-10/US-11 가용성 (선택)
```

### 2.4 Availability (워커 가용성, US-10/US-11)

```
schedule        ScheduleRule[]   예약 스케줄 규칙 목록 (US-10)
live            { enabled, currentLocation: {lat,lng}|null, radiusMeters }
                                 라이브 위치 매칭 (US-11)
```

```
ScheduleRule:
  id            string
  days          number[]    0=일 ~ 6=토
  startMin      number      하루 중 시작 분 (0~1439, 예: 12:00 → 720)
  endMin        number      하루 중 종료 분 (startMin < endMin)
  hubName       string      지명 (강남역, 삼성역, 부산역 등)
  center        {lat,lng}
  radiusMeters  number      활동 반경 (기본 3000)
```

### 2.5 가용성 판정 (매칭 엔진)

공고 `job`(위치, 시작시각)에 대해 워커가 매칭 후보인지 판정:

```
isCandidate(worker, job):
  # US-10: 스케줄 규칙 부합
  scheduleHit = worker.availability?.schedule.some(rule =>
      rule.days.includes(weekday(job.startAt))
      AND minOfDay(job.startAt) >= rule.startMin
      AND minOfDay(job.startAt) <  rule.endMin
      AND distance(job.location, rule.center) <= rule.radiusMeters)

  # US-11: 라이브 위치 부합
  liveHit = worker.availability?.live.enabled
      AND worker.availability.live.currentLocation != null
      AND distance(job.location, live.currentLocation) <= live.radiusMeters

  # 가용성 없는 워커는 하위호환
  hasAvailability = worker.availability != null
                    AND (schedule.length > 0 OR live.enabled)

  return hasAvailability ? (scheduleHit OR liveHit) : worker.available
```

`scoreMatch()`의 `availability` 요소(8점)는 위 `isCandidate` 결과를 사용한다. 후보가 아니면 매칭 풀에서 제외(반경 밖과 동일 처리).

### 2.4 Dispatch (매칭 결과)

```
postingId       string
employerName    string
jobCategory     string
rankedWorkerIds string[]
scores          { workerId: number }
decisions       [{ workerId, decision, reason, secondsToDecide, score }]
acceptedBy      string | null
acceptedReason  string | null
acceptedAt      string | null
acceptedSecondsToDecide number | null
notifiedAt      string
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
| 가용성 | 8 | `available ? 8 : 0` |
| 활동성 | 6 | 마지막 접속 <1h:6 / <24h:4 / <7d:2 / 그외:0 |

- 반경(`radius`) 기본 5,000m. 반경 밖 워커는 후보에서 제외.
- 신규 워커(평점 없음)는 평점 11.5점으로 cold-start 보호.
- dispatch는 top-N 워커에 알림, top-DECIDE_N 워커가 순차 LLM 수락 판단, 첫 수락자로 확정.

---

## 4. 라우트 명세

### 4.1 구현 완료 (Phase 2)

| 라우트 | 화면 | US |
|--------|------|-----|
| `/sim/admin` | 관제 대시보드 | US-5, US-6 |
| `/sim/employer` | 사업장 목록 | - |
| `/sim/employer/[id]` | 사업장 상세 (관리자 시점) | US-6 연동 |
| `/sim/worker` | 구직자 목록 (페이지네이션+필터) | US-7 |
| `/sim/worker/[id]` | 워커 상세 (관리자 시점) | - |

### 4.2 신규 구현 대상 (Phase 1 마이페이지)

| 라우트 | 화면 | US | 상태 |
|--------|------|-----|------|
| `/sim/me` | 역할·ID 진입 화면 | US-4 | 미구현 |
| `/sim/me/employer/[id]` | 구인자 마이페이지 | US-1 | 미구현 |
| `/sim/me/worker/[id]` | 구직자 마이페이지 | US-2, US-3 | 미구현 |

> 📌 기존 `/sim/employer/[id]`, `/sim/worker/[id]`는 관리자 시점(읽기 전용)으로 유지하고,
> 마이페이지는 `/sim/me/*` 네임스페이스로 분리한다. 마이페이지는 상단에 본인 컨텍스트 배지를 고정 표시하고, 수락/거절 인터랙션(US-3)을 포함한다.

---

## 5. 마이페이지 구현 가이드

### 5.1 진입 화면 `/sim/me` (US-4)

- 역할 선택(구인자/구직자) → ID 선택
- 구직자는 `/sim/worker`의 페이지네이션·필터 컴포넌트 재사용
- ID 직접 입력 지원: `emp-NNN`, `w-NNNN` 형식 검증
- 선택 완료 → `/sim/me/employer/{id}` 또는 `/sim/me/worker/{id}`로 이동

### 5.2 구인자 마이페이지 `/sim/me/employer/[id]` (US-1)

- 기존 `/sim/employer/[id]`와 데이터 로직 동일, 차이점:
  - 상단에 "사장님 모드 · {매장명}" 컨텍스트 배지 고정
  - 다른 사업장 이동 링크 제거
  - 관제 링크는 유지하지 않음 (본인 시점 격리)

### 5.3 구직자 마이페이지 `/sim/me/worker/[id]` (US-2, US-3)

- 받은 알림: `dispatches.filter(d => d.rankedWorkerIds.includes(id) && !d.acceptedBy)`
- 진행 일감: `dispatches.filter(d => d.acceptedBy === id)`
- 수락/거절(US-3): 클라이언트 컴포넌트, 수락 시 dispatch에 `acceptedBy` 기록
  - 상태 저장은 **세션 메모리**로 확정 (PRD 재현성 지표와 정합). 새로고침 시 `dispatches.json` 스냅샷 기준으로 리셋
  - 중복 수락 차단: `acceptedBy != null`이면 거부

### 5.4 성능

- 구직자 마이페이지의 dispatch 스캔은 현재 O(n×m). 9,950명 규모에서 무해하나, 실시간 dispatch 연동(Phase 3) 시 `Map<workerId, dispatch[]>` 역색인 권장.

---

## 6. 데이터 의존성

| 데이터 | 출처 | 갱신 방법 |
|--------|------|----------|
| 강남구 실 비율 | Athena `rdb_mongi.mon_guin_db`, `rdb_mongg.mon_resume_db` | `dskit` 또는 `aws athena` (ldp-viewer SSO) |
| employers | `seed-employers.mjs` (시드 RNG) | `node sim/seed/seed-employers.mjs --count 312` |
| postings | `seed-postings.mjs` (haiku) | `node sim/seed/seed-postings.mjs --limit 312 --per 2` |
| workers | `seed-workers.mjs` (haiku batch) | `node sim/seed/seed-workers.mjs --count 10000` |
| dispatches | `run-dispatch.mjs` | `node sim/runner/run-dispatch.mjs --decide 2` |

---

## 7. 제약 및 비범위

- 실제 인증/세션 없음. ID 선택이 로그인을 대체.
- 결제·정산은 표시만, 실제 토스 연동 없음.
- 분쟁/노쇼 시뮬(Phase 3, US-8/9) 미구현.
- LLM 비용 가드: 일 호출 상한은 시드 단계에서만 적용, 시뮬 재실행 시 캐시 없음.
