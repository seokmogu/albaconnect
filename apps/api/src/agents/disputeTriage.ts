/**
 * agents/disputeTriage.ts — 1차 분쟁 트리아지.
 *
 * SPEC: .agency/research/spec-agent-002-dispute-triage.md
 *
 * 호출 패턴: setImmediate fire-and-forget. 결과는 dispute_ai_triage 테이블에 저장.
 * 최종 결정은 어드민. 이 에이전트는 우선순위·사실 추출·권장 조치만.
 *
 * Model: Claude Sonnet 4.6 (정확도 우선, 분쟁 = 법적 리스크)
 */

import { z } from "zod"
import { sql } from "drizzle-orm"
import { db } from "../db"
import { runAgent, type AgentDefinition } from "./runtime"

// ── Output schema ────────────────────────────────────────────────────────────

const PrimaryIssueEnum = z.enum([
  "noshow",
  "late_arrival",
  "early_leave",
  "work_quality",
  "payment_delay",
  "harassment",
  "scope_dispute",
  "other",
])

export const DisputeTriageOutputSchema = z.object({
  priority: z.enum(["low", "medium", "urgent"]),
  recommendedAction: z.enum([
    "full_refund",
    "partial_refund",
    "release_to_worker",
    "dismiss",
    "human_review_required",
  ]),
  partialRefundPercent: z.number().int().min(0).max(100).nullable(),
  summary: z.string().max(300),
  extractedFacts: z.object({
    arrivalDelayMinutes: z.number().int().nullable(),
    completedWorkPercent: z.number().min(0).max(100).nullable(),
    disputedAmount: z.number().int().nullable(),
    primaryIssue: PrimaryIssueEnum,
  }),
  openQuestions: z.array(z.string().max(200)).max(5),
  legalRisk: z.enum(["none", "low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  humanReviewRequired: z.boolean(),
})

export type DisputeTriageOutput = z.infer<typeof DisputeTriageOutputSchema>

// ── Input ────────────────────────────────────────────────────────────────────

export interface DisputeTriageInput {
  disputeId: string
  jobContext: {
    title: string
    category: string
    startAt: string
    endAt: string
    totalAmount: number
    headcount: number
  }
  disputeType: "NOSHOW_DISPUTE" | "PAYMENT_DISPUTE" | "QUALITY_DISPUTE"
  raisedByRole: "employer" | "worker"
  raisedByText: string
  counterpartyText: string | null
  evidenceUrls: string[]
  gpsArrivalAt: string | null
  expectedStartAt: string
  /** Dispute을 raise한 사용자 ID (audit trail용) */
  userId: string
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 AlbaConnect의 분쟁 1차 트리아지 에이전트입니다.
한국 초단기 알바 매칭에서 사장님-워커 사이 분쟁을 읽고 어드민 운영자에게 우선순위·사실·권장 조치를 보고합니다.

[원칙]
1. 당신은 *최종 결정자가 아닙니다*. 어드민 운영자가 모든 환불·정산을 직접 실행합니다.
2. 한쪽 진술만 있으면 confidence를 0.65 이하로 낮추고 openQuestions에 "상대방 답변 필요"를 명시하세요.
3. 양측 진술이 정면 충돌하면 humanReviewRequired=true.
4. legalRisk 평가 기준:
   - high: 성희롱, 폭행, 차별, 미성년 노동, 산업재해, 임금 관련 형사 의혹 언급
   - medium: 임금체불 의도 의심, 허위 신원, 반복적 노쇼 패턴
   - low: 일반적 사실 불일치
   - none: 단순 정산 시점 이견
5. 부분 환불 권장 시 partialRefundPercent를 10단위로 명시. full_refund=100, dismiss/release_to_worker=0.
6. extractedFacts는 *진술에 명시된 것만* 채우세요. 추측은 null.
7. arrivalDelayMinutes는 GPS 도착 기록(gpsArrivalAt)과 공고 시작 시각(expectedStartAt) 차이에서 계산.

[금지]
- 환불 실행, 정산 트리거, 결제 시스템 호출
- "확실히 ~입니다" 같은 단언 — 항상 추정/가능성으로
- 한국어 외 언어 응답
- evidenceUrls의 이미지를 본 것처럼 묘사하지 마세요 (URL만 받습니다)

[출력]
반드시 submit_dispute_triage 도구를 호출해 결과를 반환하세요. 일반 텍스트로 답하지 마세요.`

function buildUserPrompt(input: DisputeTriageInput): string {
  const arrivalLine =
    input.gpsArrivalAt
      ? `워커 GPS 도착 시각: ${input.gpsArrivalAt}\n공고 시작 시각: ${input.expectedStartAt}`
      : `워커 GPS 도착 기록 없음 (도착 안 했거나 위치 권한 차단)\n공고 시작 시각: ${input.expectedStartAt}`

  const counterparty =
    input.counterpartyText
      ? `[상대방(${input.raisedByRole === "employer" ? "워커" : "사장님"}) 답변]\n${input.counterpartyText}`
      : `[상대방 답변] 아직 없음`

  return `[공고 정보]
- 제목: ${input.jobContext.title}
- 카테고리: ${input.jobContext.category}
- 기간: ${input.jobContext.startAt} ~ ${input.jobContext.endAt}
- 총 정산액: ${input.jobContext.totalAmount.toLocaleString()}원
- 모집 인원: ${input.jobContext.headcount}명

[분쟁 유형] ${input.disputeType}
[분쟁 제기자] ${input.raisedByRole}

[제기자 진술]
${input.raisedByText}

${counterparty}

[도착 로그]
${arrivalLine}

[증거 URL]
${input.evidenceUrls.length > 0 ? input.evidenceUrls.join("\n") : "없음"}

위 정보를 검토해 submit_dispute_triage 도구를 호출하세요.`
}

// ── Agent definition ─────────────────────────────────────────────────────────

const definition: AgentDefinition<DisputeTriageInput, DisputeTriageOutput> = {
  agentName: "dispute-triage",
  model: "sonnet",
  outputSchema: DisputeTriageOutputSchema,
  outputName: "submit_dispute_triage",
  outputDescription:
    "Submit the structured triage result for an AlbaConnect dispute to be reviewed by the admin operator.",
  systemPrompt: SYSTEM_PROMPT,
  buildUserPrompt,
  temperature: 0.0,
  maxTokens: 2000,
  timeoutMs: 10_000,
  // No caching — each dispute is unique.
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run dispute triage and persist the result to `dispute_ai_triage`.
 *
 * Fire-and-forget pattern: call via setImmediate from the route handler.
 * Failures are logged but do NOT propagate to the user — the dispute is
 * still raised and the admin will see it without AI triage.
 */
export async function triageDispute(disputeId: string): Promise<void> {
  const input = await loadDisputeContext(disputeId)
  if (!input) {
    console.warn("[disputeTriage] dispute not found or missing context", disputeId)
    return
  }

  try {
    const result = await runAgent(definition, input, { userId: input.userId })

    await db.execute(sql`
      INSERT INTO dispute_ai_triage (
        dispute_id, priority, recommended_action, partial_refund_percent,
        summary, extracted_facts, open_questions, legal_risk,
        confidence, human_review_required
      ) VALUES (
        ${disputeId}::uuid,
        ${result.output.priority},
        ${result.output.recommendedAction},
        ${result.output.partialRefundPercent},
        ${result.output.summary},
        ${JSON.stringify(result.output.extractedFacts)}::jsonb,
        ${JSON.stringify(result.output.openQuestions)}::jsonb,
        ${result.output.legalRisk},
        ${result.output.confidence},
        ${result.output.humanReviewRequired}
      )
      ON CONFLICT (dispute_id) DO UPDATE SET
        priority = EXCLUDED.priority,
        recommended_action = EXCLUDED.recommended_action,
        partial_refund_percent = EXCLUDED.partial_refund_percent,
        summary = EXCLUDED.summary,
        extracted_facts = EXCLUDED.extracted_facts,
        open_questions = EXCLUDED.open_questions,
        legal_risk = EXCLUDED.legal_risk,
        confidence = EXCLUDED.confidence,
        human_review_required = EXCLUDED.human_review_required,
        created_at = NOW()
    `)

    // High-risk alert hook (Slack/email) — see SPEC §9.
    if (result.output.legalRisk === "high") {
      console.warn(
        "[disputeTriage] HIGH LEGAL RISK detected",
        { disputeId, summary: result.output.summary, traceId: result.traceId },
      )
      // TODO: Slack #ops-urgent notification (separate SPEC)
    }
  } catch (err) {
    console.error("[disputeTriage] failed", { disputeId, err })
    // Audit row was already written by runtime.ts on schema/timeout failures.
  }
}

// ── Context loader ───────────────────────────────────────────────────────────

interface RawDisputeRow {
  id: string
  raised_by_id: string
  raised_by_role: "employer" | "worker"
  type: "NOSHOW_DISPUTE" | "PAYMENT_DISPUTE" | "QUALITY_DISPUTE"
  description: string
  counterparty_response: string | null
  evidence_urls: string[] | null
  gps_arrival_at: string | null
  job_title: string
  job_category: string
  job_start_at: string
  job_end_at: string
  job_total_amount: number
  job_headcount: number
}

async function loadDisputeContext(disputeId: string): Promise<DisputeTriageInput | null> {
  const result = await db.execute(sql`
    SELECT
      d.id,
      d.raised_by_id,
      d.raised_by_role,
      d.type,
      d.description,
      d.counterparty_response,
      d.evidence_urls,
      d.gps_arrival_at,
      j.title         AS job_title,
      j.category      AS job_category,
      j.start_at      AS job_start_at,
      j.end_at        AS job_end_at,
      j.total_amount  AS job_total_amount,
      j.headcount     AS job_headcount
    FROM job_disputes d
    JOIN job_postings j ON j.id = d.job_id
    WHERE d.id = ${disputeId}::uuid
    LIMIT 1
  `)

  const row = result.rows[0] as RawDisputeRow | undefined
  if (!row) return null

  return {
    disputeId: row.id,
    userId: row.raised_by_id,
    jobContext: {
      title: row.job_title,
      category: row.job_category,
      startAt: row.job_start_at,
      endAt: row.job_end_at,
      totalAmount: row.job_total_amount,
      headcount: row.job_headcount,
    },
    disputeType: row.type,
    raisedByRole: row.raised_by_role,
    raisedByText: row.description,
    counterpartyText: row.counterparty_response,
    evidenceUrls: row.evidence_urls ?? [],
    gpsArrivalAt: row.gps_arrival_at,
    expectedStartAt: row.job_start_at,
  }
}
