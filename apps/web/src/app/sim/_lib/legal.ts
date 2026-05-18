/**
 * 카테고리 법적 등급 상수 — node:fs 없는 순수 파일.
 * 클라이언트 컴포넌트에서도 안전하게 import 가능.
 *
 * 출처: Job_Category_Legal_Matrix.md
 * 등급: A(자유 주선) / B(조건부) / C(주선 제한·금지)
 */

// @MX:ANCHOR: 카테고리 법적 등급 매핑 — 모든 공고 뱃지/필터가 참조하는 단일 소스
// @MX:REASON: admin/employer/worker 3개 이상의 페이지에서 fan_in >= 3

export type LegalGrade = "A" | "B" | "C"

export interface LegalMeta {
  grade: LegalGrade
  /** B/C 등급일 때 표시할 경고 캡션. A이면 undefined. */
  warning?: string
}

// @MX:NOTE: delivery=B(생활물류법), manufacturing=B(직접고용 중개만), cleaning=B(산업안전), other=B(케이스별)
export const CATEGORY_LEGAL: Record<string, LegalMeta> = {
  cafe:          { grade: "A" },
  restaurant:    { grade: "A" },
  retail:        { grade: "A" },
  event:         { grade: "A" },
  cleaning:      { grade: "B", warning: "산업안전보건법 유해·위험 작업 검토 필요" },
  delivery:      { grade: "B", warning: "생활물류서비스산업발전법 검토 필요" },
  manufacturing: { grade: "B", warning: "직접고용 중개만 가능 — 파견 형태 불가" },
  other:         { grade: "B", warning: "직무 확인 후 법적 분류 필요" },
}

/** 카테고리 키로 법적 등급 메타 반환. 미등록 카테고리는 B로 처리. */
export function getLegal(category: string): LegalMeta {
  return CATEGORY_LEGAL[category] ?? { grade: "B", warning: "직무 확인 후 법적 분류 필요" }
}

// ── 용역 트랙 법적 상수 (클라이언트 안전) ────────────────────────────────────
// @MX:NOTE: 용역 카테고리 법적 등급 — Job_Category_Legal_Matrix §4.1 기준
// walkdelivery 포함 비전문 도보 용역 전부 A등급. 차량배달만 B(이 파일에는 미포함).
import type { ServiceCategory } from "./service"

export const SERVICE_CATEGORY_LEGAL: Record<ServiceCategory, "A" | "B"> = {
  errand:       "A",
  homecleaning: "A",
  assembly:     "A",
  moving:       "A",
  pet:          "A",
  queue:        "A",
  walkdelivery: "A",
}

/** Tailwind 클래스 반환용 등급별 스타일 */
export const LEGAL_GRADE_STYLE: Record<LegalGrade, { badge: string; dot: string; label: string }> = {
  A: {
    badge: "bg-green-100 text-green-700 border border-green-200",
    dot:   "bg-green-500",
    label: "A등급",
  },
  B: {
    badge: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    dot:   "bg-yellow-500",
    label: "B등급",
  },
  C: {
    badge: "bg-red-100 text-red-700 border border-red-200",
    dot:   "bg-red-500",
    label: "C등급",
  },
}
