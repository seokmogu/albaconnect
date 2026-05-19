# [Spec] AlbaConnect 백엔드 LLM 에이전트

**범위**: `apps/api/src/agents/` — 백엔드 API가 호출하는 LLM 에이전트 런타임
**작성일**: 5월 19일
**관련 SPEC**: `.agency/research/spec-agent-001-listing-normalizer.md`, `spec-agent-002-dispute-triage.md`

> 📌 시뮬레이터(`sim/`)의 데이터 생성은 `claude` CLI 헤드리스를 쓰지만,
> 백엔드 API 에이전트는 **Anthropic SDK(`@anthropic-ai/sdk`)** 를 직접 호출한다.
> 둘은 별개 경로다.

---

## 1. 개요

백엔드 에이전트는 공통 런타임(`runtime.ts`) 위에 개별 에이전트(`listingNormalizer.ts`,
`disputeTriage.ts`)를 얹는 구조다. 모든 에이전트는 다음 계약을 공유한다.

| 요소 | 방식 |
|------|------|
| 제공자 | Anthropic SDK, `ANTHROPIC_API_KEY` 환경변수 |
| 구조화 출력 | `tool_use` 강제 (`tool_choice: { type: "tool" }`) |
| 출력 검증 | Zod 스키마 `safeParse` |
| 비용 추적 | 토큰 → KRW 환산, Redis 일일 누적 |
| 예산 가드 | 일일 상한(`AGENT_DAILY_BUDGET_KRW`, 기본 50,000원) |
| 캐싱 | 선택 — 입력 SHA256 키로 Redis 저장 |
| 감사 추적 | `agent_decisions` 테이블에 입출력·비용·trace_id 기록 |

---

## 2. 공통 런타임 (`runtime.ts`)

### 2.1 모델 티어

| 티어 | 모델 ID | 입력/출력 (KRW/Mtok) |
|------|---------|----------------------|
| haiku | `claude-haiku-4-5-20251001` | 1,360 / 6,800 |
| sonnet | `claude-sonnet-4-6` | 4,080 / 20,400 |
| opus | `claude-opus-4-7` | 20,400 / 102,000 |

### 2.2 `AgentDefinition<I, O>` 계약

에이전트는 다음을 선언한다: `agentName`, `model`(티어), `outputSchema`(Zod),
`outputName`/`outputDescription`(tool 메타), `systemPrompt`, `buildUserPrompt(input)`,
선택 항목 `cacheKey`/`cacheTtlSec`/`temperature`/`maxTokens`/`timeoutMs`.

### 2.3 `runAgent()` 실행 흐름

1. **캐시 조회** — `cacheKey` 정의 시 SHA256 해시로 Redis 조회, 적중 시 즉시 반환
2. **예산 체크** — 당일 누적 비용이 상한 이상이면 `AgentBudgetExceededError`
3. **호출** — `tool_use` 도구 1개를 강제, `AbortController`로 `timeoutMs` 후 중단
4. **추출·검증** — `tool_use` 블록을 Zod `safeParse`, 실패 시 `AgentValidationError`
5. **비용 정산** — 토큰 수 → KRW 환산 후 Redis 일일 누적(36h TTL)
6. **캐시 기록** — `cacheKey` 정의 시 결과 저장
7. **감사 기록** — `agent_decisions`에 success/error 상태로 INSERT

오류 처리: Redis는 선택(`REDIS_URL` 미설정 시 graceful fallback). 감사 테이블
쓰기 실패는 에이전트 응답을 깨지 않는다(로그 후 계속).

### 2.4 예외

- `AgentBudgetExceededError` — 일일 예산 초과
- `AgentValidationError` — 모델 출력이 Zod 스키마 불일치

---

## 3. 공고 정제기 (`listingNormalizer.ts`)

자영업 사장님의 자유 텍스트 공고를 `POST /jobs`가 요구하는 구조화 필드로 변환.

| 항목 | 값 |
|------|-----|
| 모델 | haiku |
| 캐시 | `SHA256(rawText|now)` 키, 1시간 TTL |
| 타임아웃 | 3초 |
| 비용 | 호출당 약 2~5원 |

**입력** `NormalizerInput`: `rawText`(자유 텍스트), `now`(ISO8601+offset, 상대 날짜 기준), `userId`

**출력** `NormalizerOutput`:
- `draft` (`ListingDraftSchema`): `title`, `category`(8종 enum), `startAt`/`endAt`,
  `hourlyRate`(1,000~100,000), `headcount`(1~50), `lat`/`lng`(nullable), `address`, `description`, `tags`(≤8)
- `warnings` (필드별 경고 — 예: 최저임금 10,030원 미만)
- `confidence` (0~1), `needsHumanReview` (boolean)

**방어 계층**: 모델 출력 후 `description`에서 잔여 PII(전화번호·주민번호·카드번호)를
정규식으로 한 번 더 제거(`stripPii`).

---

## 4. 분쟁 트리아지 (`disputeTriage.ts`)

사장님↔워커 분쟁을 읽고 어드민에게 우선순위·사실·권장 조치를 보고.
**최종 결정은 어드민** — 이 에이전트는 환불·정산을 실행하지 않는다.

| 항목 | 값 |
|------|-----|
| 모델 | sonnet (분쟁 = 법적 리스크, 정확도 우선) |
| 캐시 | 없음 (분쟁마다 고유) |
| 타임아웃 | 10초 |
| 호출 패턴 | `setImmediate` fire-and-forget, 실패해도 사용자 응답에 전파 안 함 |

**입력** `DisputeTriageInput`: `disputeId`, `jobContext`, `disputeType`(NOSHOW/PAYMENT/QUALITY),
`raisedByRole`, `raisedByText`, `counterpartyText`(nullable), `evidenceUrls`, `gpsArrivalAt`, `expectedStartAt`, `userId`

**출력** `DisputeTriageOutputSchema`:
- `priority` (low/medium/urgent)
- `recommendedAction` (full_refund/partial_refund/release_to_worker/dismiss/human_review_required)
- `partialRefundPercent` (0~100, nullable)
- `summary`, `extractedFacts`(도착 지연·완수율·분쟁액·`primaryIssue`), `openQuestions`
- `legalRisk` (none/low/medium/high), `confidence`, `humanReviewRequired`

**저장**: 결과를 `dispute_ai_triage` 테이블에 upsert(`ON CONFLICT (dispute_id)`).
`legalRisk === "high"`이면 경고 로그 — Slack `#ops-urgent` 알림은 별도 SPEC.

**컨텍스트 로더**: `loadDisputeContext`가 `job_disputes ⨝ job_postings`에서 입력 구성.

---

## 5. 시뮬레이터 분쟁 트리아지와의 관계

`apps/web/src/app/sim/_lib/dispute.ts`는 이 백엔드 에이전트의 **시뮬용 결정론적
대응물**이다 — LLM 대신 키워드 규칙 기반 분류. 시뮬레이터는 실DB·API 키 없이
동작해야 하므로 동일 개념을 순수 함수로 재구현했다.

---

## 6. 제약 및 비범위

- 통합 미완료: `routes/jobs.ts`·분쟁 라우트에서의 실제 호출 연결은 별도 작업
- 마이그레이션: `0022_agent_decisions.sql`, `0023_dispute_ai_triage.sql` 존재
- `zodToJsonSchema`는 `zod-to-json-schema` 패키지를 lazy require
