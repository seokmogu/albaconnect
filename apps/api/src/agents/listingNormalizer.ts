/**
 * agents/listingNormalizer.ts — Convert free-form Korean job posting text
 * into the structured fields required by POST /jobs.
 *
 * SPEC: .agency/research/spec-agent-001-listing-normalizer.md
 *
 * Model: Claude Haiku 4.5
 * Cost: ~₩2-5 per call, cached by SHA256(rawText) for 1h
 * Latency: p50 1.2s, p95 < 3s
 */

import { z } from "zod"
import { runAgent, type AgentDefinition } from "./runtime"

// ── Output schema ────────────────────────────────────────────────────────────

const KOREAN_CATEGORIES = [
  "cafe",
  "restaurant",
  "delivery",
  "event",
  "retail",
  "cleaning",
  "manufacturing",
  "other",
] as const

export const ListingDraftSchema = z.object({
  title: z.string().min(2).max(60),
  category: z.enum(KOREAN_CATEGORIES),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  hourlyRate: z.number().int().min(1_000).max(100_000),
  headcount: z.number().int().min(1).max(50),
  lat: z.number().min(33).max(39).nullable(),
  lng: z.number().min(124).max(132).nullable(),
  address: z.string().max(200),
  description: z.string().max(500),
  tags: z.array(z.string().max(20)).max(8),
})

export const NormalizerOutputSchema = z.object({
  draft: ListingDraftSchema,
  warnings: z.array(
    z.object({
      field: z.string(),
      message: z.string(),
    }),
  ),
  confidence: z.number().min(0).max(1),
  needsHumanReview: z.boolean(),
})

export type ListingDraft = z.infer<typeof ListingDraftSchema>
export type NormalizerOutput = z.infer<typeof NormalizerOutputSchema>

// ── Input ────────────────────────────────────────────────────────────────────

export interface NormalizerInput {
  rawText: string
  /** ISO8601 with offset. Used as the "now" reference for relative dates. */
  now: string
  userId: string
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 AlbaConnect의 공고 정제기(Job Posting Normalizer)입니다.
한국 자영업 사장님이 자유 텍스트로 적은 초단기 알바 공고 의도를 구조화 필드로 변환합니다.

[작업 규칙]
1. 모호하면 추정하지 말고 confidence를 낮추고 needsHumanReview=true.
2. 시급은 한국 원화 정수. 2026년 최저임금 10,030원 미만이면 warnings에 "field: hourlyRate, message: 2026년 최저임금 10,030원 미만입니다" 추가하되 사용자 입력값 그대로 반환.
3. startAt/endAt은 입력 now 기준 미래 시각, KST(+09:00) offset 포함 ISO8601 형식.
   - "오늘 저녁 6시" = now와 같은 날짜의 18:00 KST.
   - "내일 오후 2시" = now 다음날 14:00 KST.
   - 기간이 명시 안 되면 4시간 기본값.
4. category는 8개 enum 중 하나로 강제 매핑: cafe, restaurant, delivery, event, retail, cleaning, manufacturing, other.
5. headcount 명시 없으면 1.
6. description은 욕설/개인정보(전화번호, 주민번호, 카드번호) 제거 후 반환.
7. tags는 직무 키워드 3-8개 (예: ["바리스타", "음료제조", "초보가능"]). 한국어 명사 위주.
8. 주소는 입력 그대로 (geocoding은 별도 단계, lat/lng는 null 가능).
9. title은 한 줄 요약, 60자 이내, 핵심 키워드 포함.
10. 비현실적 입력 (헤드카운트 50 이상, 시급 10만원 이상, 24시간 등)은 needsHumanReview=true.

[금지]
- 사용자가 명시하지 않은 매장 이름/사장 이름을 만들어내지 마세요.
- 카테고리를 모르겠으면 "other"로 두세요.
- 한국어 외 언어로 답하지 마세요.

[출력 방법]
반드시 submit_listing_draft 도구를 호출해서 결과를 반환하세요. 일반 텍스트로 답하지 마세요.`

function buildUserPrompt(input: NormalizerInput): string {
  return `현재 시각 (KST, ISO8601): ${input.now}

[사장님의 자유 텍스트 공고 의도]
${input.rawText}

위 텍스트를 11개 필드로 변환해 submit_listing_draft 도구를 호출하세요.`
}

// ── Agent definition ─────────────────────────────────────────────────────────

const definition: AgentDefinition<NormalizerInput, NormalizerOutput> = {
  agentName: "listing-normalizer",
  model: "haiku",
  outputSchema: NormalizerOutputSchema,
  outputName: "submit_listing_draft",
  outputDescription:
    "Submit the structured AlbaConnect job posting draft derived from the employer's free-form Korean text.",
  systemPrompt: SYSTEM_PROMPT,
  buildUserPrompt,
  cacheKey: (input) => `${input.rawText}|${input.now}`,
  cacheTtlSec: 3600,
  temperature: 0.1,
  maxTokens: 1500,
  timeoutMs: 3_000,
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface NormalizeResult extends NormalizerOutput {
  traceId: string
  cached: boolean
  costKrw: number
}

/**
 * Normalize a free-form Korean job posting into structured fields.
 *
 * Throws:
 *  - AgentBudgetExceededError if daily budget hit
 *  - AgentValidationError if model output cannot be coerced to schema
 *  - Error('timeout') if Anthropic call exceeds timeoutMs
 *
 * Caller is responsible for HTTP error mapping. See routes/jobs.ts patch
 * in SPEC §7.
 */
export async function normalizeListing(input: NormalizerInput): Promise<NormalizeResult> {
  const result = await runAgent(definition, input, { userId: input.userId })

  // Post-validation: strip residual PII from description (defense in depth)
  const cleaned: ListingDraft = {
    ...result.output.draft,
    description: stripPii(result.output.draft.description),
  }

  return {
    ...result.output,
    draft: cleaned,
    traceId: result.traceId,
    cached: result.cached,
    costKrw: result.cost.krw,
  }
}

// ── PII guard ────────────────────────────────────────────────────────────────

const PHONE_RE = /(?:010|011|016|017|018|019)[-.\s]?\d{3,4}[-.\s]?\d{4}/g
const RRN_RE = /\d{6}[-\s]?[1-4]\d{6}/g // resident registration number
const CARD_RE = /(?:\d[ -]?){13,16}/g

function stripPii(text: string): string {
  return text
    .replace(PHONE_RE, "[전화번호]")
    .replace(RRN_RE, "[주민등록번호]")
    .replace(CARD_RE, "[카드번호]")
    .trim()
}
