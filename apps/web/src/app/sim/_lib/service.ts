/**
 * 용역 트랙(개인 C2C) 타입·상수 — node:fs 없는 순수 파일.
 * 클라이언트 컴포넌트에서도 안전하게 import 가능.
 *
 * data.ts(server-only)와 분리한 이유: 용역 합의서 모달 등 클라이언트
 * 컴포넌트가 ServiceRequest/카테고리 라벨을 값으로 import 해야 하기 때문.
 */

// @MX:ANCHOR: 용역 트랙 데이터 계약 — service 페이지·합의서 모달·로더가 공유
// @MX:REASON: data.ts·service/page·ServiceCardList 3곳 이상 fan_in

export type ContractType = "employment" | "service"

export type ServiceCategory =
  | "errand"
  | "homecleaning"
  | "assembly"
  | "moving"
  | "pet"
  | "queue"
  | "walkdelivery"

export const SERVICE_CATEGORY_LABEL: Record<ServiceCategory, string> = {
  errand:       "심부름",
  homecleaning: "집청소",
  assembly:     "가구조립",
  moving:       "짐옮기기",
  pet:          "반려동물",
  queue:        "줄서기",
  walkdelivery: "도보배달",
}

export interface ServiceRequest {
  id: string
  requesterName: string
  requesterType: "individual"
  contractType: "service"
  serviceCategory: ServiceCategory
  title: string
  description: string
  location: { lat: number; lng: number }
  hubName: string
  fee: number
  estimatedHours: number
  /** Job_Category_Legal_Matrix §4.1 기준 — 비전문 도보 용역 전부 A */
  legalGrade: "A" | "B"
  createdAt: string
}

// ── US-15B: 위장도급(반복·정기) 감지 ─────────────────────────────────────────

/**
 * 동일 의뢰자가 같은 카테고리를 임계치 이상 의뢰하면 "반복 의뢰자"로 판정한다.
 * 단순 총 건수가 아니라 (의뢰자 × 동일 카테고리) 기준이어야 위장도급 신호가 된다 —
 * 같은 일을 반복 위탁하는 정기 도급이 실질 근로(위장도급) 위험이 크기 때문.
 *
 * 순수 함수 — 반환값은 의뢰자명 → 해당 의뢰자의 최다 반복 카테고리 건수.
 */
export function detectRepeatRequesters(
  requests: ServiceRequest[],
  threshold = 3,
): Map<string, number> {
  const byPair = new Map<string, number>()
  for (const r of requests) {
    const key = `${r.requesterName}|${r.serviceCategory}`
    byPair.set(key, (byPair.get(key) ?? 0) + 1)
  }
  const repeats = new Map<string, number>()
  for (const [key, count] of byPair) {
    if (count < threshold) continue
    const name = key.split("|")[0]
    repeats.set(name, Math.max(repeats.get(name) ?? 0, count))
  }
  return repeats
}
