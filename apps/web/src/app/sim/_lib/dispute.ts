/**
 * US-14: 분쟁 처리 AI 트리아지 — node:fs 없는 순수 파일.
 *
 * 노쇼·불량노동·보수 미지급 등 분쟁을 규칙 기반으로 1차 분류하고
 * 우선순위·권장 조치·분쟁 준비금 영향까지 산출한다.
 *
 * apps/api/src/agents/disputeTriage.ts(LLM 버전)의 시뮬용 결정론적 대응물.
 */

export type DisputeType = "noshow" | "poorwork" | "nonpayment" | "late" | "other"
export type DisputeSeverity = "high" | "medium" | "low"

export const DISPUTE_TYPE_LABEL: Record<DisputeType, string> = {
  noshow:     "노쇼 (무단결근)",
  poorwork:   "불량 노동",
  nonpayment: "보수 미지급",
  late:       "지각·부분이행",
  other:      "기타",
}

export interface Dispute {
  id: string
  postingTitle: string
  reporter: "employer" | "worker"
  /** 신고 사유 자유 서술 — 트리아지 입력 */
  description: string
  /** 청구·손실 주장 금액(원) */
  claimAmount: number
}

export interface TriageResult {
  type: DisputeType
  severity: DisputeSeverity
  recommendedAction: string
  /** 분쟁 준비금에서 선보상할 금액(원). 0이면 준비금 미사용. */
  reservePayout: number
}

// 분쟁 유형별 키워드 — 우선순위 순서대로 매칭(먼저 맞으면 채택)
const TYPE_RULES: { type: DisputeType; keywords: string[] }[] = [
  { type: "noshow",     keywords: ["노쇼", "안 왔", "안왔", "무단", "연락 두절", "잠수", "나타나지"] },
  { type: "nonpayment", keywords: ["미지급", "안 줬", "정산 안", "보수 못", "돈을 안", "입금 안"] },
  { type: "poorwork",   keywords: ["불량", "엉망", "파손", "망가", "하자", "다시 해", "품질"] },
  { type: "late",       keywords: ["지각", "늦게", "일찍 갔", "조퇴", "절반만", "중간에"] },
]

const SEVERITY_BY_TYPE: Record<DisputeType, DisputeSeverity> = {
  noshow:     "high",
  nonpayment: "high",
  poorwork:   "medium",
  late:       "low",
  other:      "low",
}

const ACTION_BY_TYPE: Record<DisputeType, string> = {
  noshow:     "차순위 워커 재디스패치 + 신고 워커 신뢰도 차감, 준비금에서 사업주 손실 선보상",
  nonpayment: "에스크로 보류금 즉시 워커에게 지급, 사업주 계정 정산 검토",
  poorwork:   "양측 증빙(사진·체크인 기록) 수집 후 운영자 중재, 부분 환불 협의",
  late:       "체크인/체크아웃 기록 대조해 실근로분 정산, 경고 1회",
  other:      "운영자 수동 검토 큐로 이관",
}

/**
 * 분쟁 1건을 트리아지한다 — 순수 함수.
 * 준비금 선보상은 high 등급(노쇼·미지급)에 한해 청구액의 일부를 산정한다.
 */
export function triageDispute(d: Dispute): TriageResult {
  let type: DisputeType = "other"
  for (const rule of TYPE_RULES) {
    if (rule.keywords.some((kw) => d.description.includes(kw))) {
      type = rule.type
      break
    }
  }
  const severity = SEVERITY_BY_TYPE[type]
  // high 등급은 청구액의 60%까지 준비금에서 선보상(상한 5만원)
  const reservePayout =
    severity === "high" ? Math.min(Math.round(d.claimAmount * 0.6), 50_000) : 0
  return {
    type,
    severity,
    recommendedAction: ACTION_BY_TYPE[type],
    reservePayout,
  }
}

/** 분쟁 준비금 총액(원) — GMV take rate 일부를 적립한 풀 */
export const RESERVE_POOL_TOTAL = 2_000_000

// 시뮬용 분쟁 샘플 — 실제 dispatch와 독립적인 자체 완결 데이터
export const SAMPLE_DISPUTES: Dispute[] = [
  { id: "DSP-001", postingTitle: "주말 홀서빙 4시간", reporter: "employer", description: "워커가 노쇼했습니다. 약속 시간에 안 왔고 연락 두절 상태입니다.", claimAmount: 48_000 },
  { id: "DSP-002", postingTitle: "원룸 이사 짐 옮기기", reporter: "worker", description: "일을 다 했는데 사업주가 보수를 미지급했습니다. 입금 안 됐어요.", claimAmount: 35_000 },
  { id: "DSP-003", postingTitle: "카페 마감 청소", reporter: "employer", description: "청소 상태가 불량이었고 화장실이 엉망이라 다시 해야 했습니다.", claimAmount: 20_000 },
  { id: "DSP-004", postingTitle: "전단지 배포 3시간", reporter: "employer", description: "워커가 30분 지각했고 중간에 일찍 갔습니다.", claimAmount: 9_000 },
  { id: "DSP-005", postingTitle: "행사 진행 보조", reporter: "employer", description: "당일 무단으로 나타나지 않아 행사 운영에 차질이 생겼습니다.", claimAmount: 60_000 },
  { id: "DSP-006", postingTitle: "편의점 야간 단기", reporter: "worker", description: "사업주가 정산 안 해주고 연락을 피합니다.", claimAmount: 42_000 },
  { id: "DSP-007", postingTitle: "가구 조립 도움", reporter: "employer", description: "조립한 책장이 파손되어 하자가 있습니다.", claimAmount: 25_000 },
  { id: "DSP-008", postingTitle: "주방 보조 6시간", reporter: "worker", description: "근무 환경에 대한 일반 문의입니다.", claimAmount: 0 },
  { id: "DSP-009", postingTitle: "매장 재고 정리", reporter: "employer", description: "워커가 절반만 하고 조퇴했습니다.", claimAmount: 15_000 },
  { id: "DSP-010", postingTitle: "반려견 산책 대행", reporter: "employer", description: "예약 시간에 안왔고 잠수 탔습니다.", claimAmount: 18_000 },
]
