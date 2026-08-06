export const pocContent = {
  meta: {
    title: "알바몬 커넥트 — 제안·수락형 매칭 POC",
    description:
      "지원자를 기다리는 기존 흐름 대신, 조건에 맞는 후보를 찾아 제안하고 수락하는 흐름을 검증하는 사내 POC입니다.",
  },
  header: {
    navItems: [
      { label: "문제", href: "#problem" },
      { label: "매칭 방식", href: "#approach" },
      { label: "검증 범위", href: "#validation" },
    ],
    cta: "클릭형 데모 시작",
  },
  hero: {
    eyebrow: "사내 검증용 POC",
    headline: "지원을 기다리지 않고,\n조건에 맞는 사람에게 먼저 제안합니다",
    description:
      "시간·거리·직무 조건으로 후보를 찾고, 구인자의 요청부터 구직자의 수락까지 직접 눌러 검증합니다.",
    primaryCta: "클릭형 데모 시작",
    secondaryCta: "기획 범위 보기",
  },
  comparison: {
    title: "기존과 다른 접근",
    description: "새 기능 하나가 아니라 채용이 시작되고 끝나는 기본 흐름을 바꿉니다.",
    existing: ["공고 등록", "지원 대기", "지원자 검토"],
    proposed: ["조건 등록", "후보 탐색", "제안", "수락"],
  },
  validation: {
    title: "이번 POC에서 확인하려는 것",
    description: "결제나 정산보다 먼저, 내부 데이터로 매칭의 전제가 성립하는지 확인합니다.",
    items: [
      {
        title: "후보를 찾을 수 있는가",
        description: "시간·거리·직무 조건을 만족하는 후보군을 안정적으로 탐색합니다.",
        label: "탐색 정확도",
      },
      {
        title: "추천 이유를 설명할 수 있는가",
        description: "점수만 보여주지 않고 추천 근거와 데이터 부족을 함께 제시합니다.",
        label: "근거 투명성",
      },
      {
        title: "제안·수락 흐름이 자연스러운가",
        description: "구인자와 구직자가 한 번씩 눌러 매칭이 확정되는 경험을 검증합니다.",
        label: "수락 전환 흐름",
      },
    ],
  },
  snapshot: [
    { label: "사업장", value: "312" },
    { label: "구직자", value: "9,950" },
    { label: "매칭 시나리오", value: "624" },
  ],
  boundaries: ["합성 데이터", "실제 내부 DB 미연결", "결제·정산 제외", "AI 추정 결과"],
} as const
