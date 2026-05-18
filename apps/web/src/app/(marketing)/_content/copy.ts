// @MX:NOTE: Typed copy constants derived from copy.json — single source of truth for all marketing text.
// @MX:REASON: Never import copy.json directly; this typed const allows TypeScript to catch missing keys.
export const copy = {
  meta: {
    siteTitle: "AlbaConnect — 30초 안에 워커와 사장님을 잇는다",
    metaDescription:
      "알바몬 정액 광고 대비 70% 절감. 매칭 1건당 평균 3,840원으로 위치·평점·가용성 6개 요소 검증된 워커를 30초 안에 연결합니다. 노쇼 시 무료 재디스패치.",
    ogTitle: "AlbaConnect — 오늘 빠진 자리, 30초 안에 채워요",
    ogDescription:
      "강남·서초 5개동 베타 운영 중. 평균 매칭 시간 23초, 충원율 87%. 토스 에스크로 정산, 노쇼 시 무료 재디스패치.",
  },
  header: {
    logoText: "AlbaConnect",
    navItems: [
      { label: "작동 방식", href: "#how-it-works" },
      { label: "매칭 알고리즘", href: "#matching" },
      { label: "수수료", href: "#pricing" },
      { label: "사장님", href: "#for-employers" },
      { label: "워커", href: "#for-workers" },
      { label: "FAQ", href: "#faq" },
    ],
    ctaPrimary: "사전 신청하기",
    ctaSecondary: "이미 신청한 분들 보기",
  },
  hero: {
    eyebrow: "위치 기반 초단기 알바 매칭",
    headline: "오늘 빠진 자리,\n30초 안에 채워요",
    subheadline:
      "사장님이 공고를 올리면, 반경 안에서 평점 검증된 워커가 30초 안에 수락합니다. 노쇼 시에는 차순위 워커에게 무료로 재디스패치돼요.",
    employerEmphasisBadge: "사장님 우선 — 매칭 알고리즘 무료 사용",
    ctaEmployer: "사장님으로 사전 신청",
    ctaWorker: "워커로 사전 신청",
    ctaSecondary: "매칭 시연 보기",
    paymentBadge: {
      logoLabel: "토스 페이먼츠 에스크로",
      note: "정산 안전 보장",
    },
    trustBadges: ["토스 에스크로", "노쇼 시 무료 재디스패치", "양방향 리뷰"],
  },
  howItWorks: {
    sectionTitle: "어떻게 작동하나요",
    sectionSubtitle: "공고 등록부터 워커 도착까지, 복잡한 단계는 없어요.",
    steps: [
      {
        number: "01",
        title: "공고를 올려요",
        description:
          "시급, 시간, 필요 인원을 입력하면 공고가 즉시 등록됩니다. 사업자 인증 한 번으로 반복 등록은 30초면 끝나요.",
        actor: "사장님",
      },
      {
        number: "02",
        title: "AlbaConnect가 매칭해요",
        description:
          "거리·평점·직종 일치·신뢰도·활동성·가용성, 6개 요소를 실시간으로 계산해서 가장 적합한 워커에게 먼저 알림을 보냅니다. 노쇼 발생 시 차순위 워커에게 자동 재디스패치돼요.",
        actor: "AlbaConnect",
      },
      {
        number: "03",
        title: "워커가 수락해요",
        description:
          "워커는 공고 세부 내용을 확인하고 수락 또는 거절을 선택해요. 수락 즉시 사장님께 알림이 가고 매칭이 확정됩니다.",
        actor: "워커",
      },
    ],
  },
  matchingAlgorithm: {
    sectionTitle: "검증된 워커가 먼저 오는 이유",
    sectionSubtitle:
      "랜덤이 아닙니다. 6개 요소를 가중 계산해서, 지금 이 자리에 가장 맞는 워커를 정렬합니다.",
    highlightFactor: {
      name: "신뢰도",
      value: 13,
      unit: "%",
      caption: "양방향 리뷰가 매칭 점수에 미치는 영향",
    },
    factors: [
      {
        name: "거리",
        weight: 32,
        description:
          "공고 위치에서 가까울수록 먼저 받아요. 평균 매칭 거리는 1.4km입니다.",
      },
      {
        name: "평점",
        weight: 23,
        description:
          "이전 사장님들이 남긴 양방향 리뷰 평점이 높은 워커가 우선 순위를 갖습니다.",
      },
      {
        name: "직종 일치",
        weight: 18,
        description:
          "카페·편의점·이벤트 등 직종 경험이 공고와 맞는 워커를 먼저 연결합니다.",
      },
      {
        name: "신뢰도",
        weight: 13,
        description:
          "노쇼 이력, 취소율, 본인 인증 완료 여부로 산출한 신뢰 점수입니다.",
      },
      {
        name: "가용성",
        weight: 8,
        description:
          "공고 시간에 이미 다른 일감이 잡혀 있거나 휴식 중인 워커는 제외합니다.",
      },
      {
        name: "활동성",
        weight: 6,
        description:
          "최근 7일 내 수락 빈도가 높을수록 알림 수신 순위가 올라갑니다.",
      },
    ],
  },
  pricing: {
    sectionTitle: "수수료",
    headline: "매칭 1건당 평균 3,840원",
    subheadline:
      "알바몬 정액 광고 대비 70% 절감, 워커는 0원. 매칭 성공 시에만 부과돼요.",
    comparisonRows: [
      {
        label: "AlbaConnect",
        cost: "GMV 8% (매칭 성공 시만)",
        note: "사장님 부담, 워커 0원. 노쇼 시 자동 환불.",
        highlight: true,
      },
      {
        label: "알바몬 정액 광고",
        cost: "8만~30만 원 / 월",
        note: "채용 성공 무관, 매월 정액 부담",
        highlight: false,
      },
      {
        label: "당근알바 동네 노출",
        cost: "건당 노출 수수료",
        note: "매칭 보장 없음, 노쇼 책임 사장님",
        highlight: false,
      },
    ],
    note: "* 4시간 × 시급 12,000원 기준 평균 GMV 48,000원 매칭 시 수수료 3,840원. 노쇼나 분쟁 발생 시 자동 환불 처리됩니다.",
  },
  forEmployers: {
    sectionTitle: "사장님께",
    positioning:
      "알바몬은 광고, 당근알바는 동네 인맥. AlbaConnect는 알고리즘 매칭입니다.",
    headline: "오늘 저녁 인력이 빠졌나요?\n반경 안에서 즉시 찾습니다",
    painPoints: [
      "알바몬에 올려도 하루가 지나야 응답이 와요",
      "겨우 연결했더니 노쇼, 다음 날도 같은 일이 반복돼요",
      "정산은 수작업, 분쟁은 사장님 혼자 감당해야 해요",
    ],
    solutions: [
      "공고 등록 후 평균 23초 안에 워커 매칭 확정 (강남·서초 베타 측정치)",
      "노쇼 시 차순위 워커에게 자동 무료 재디스패치, 신뢰도 낮은 워커는 알림 제외",
      "정산은 토스 에스크로로 자동 처리, 분쟁은 24시간 내 AlbaConnect 운영팀이 검토",
    ],
    cta: "사장님으로 사전 신청",
  },
  forWorkers: {
    sectionTitle: "워커에게",
    headline: "지금 위치에서 가까운\n일감을 바로 받아요",
    payoutHighlight: "일 끝나면 그날 입금",
    painPoints: [
      "알바몬에 지원해도 며칠째 답장이 없어요",
      "출퇴근만 1시간, 정작 일은 3시간짜리예요",
      "일 끝나고 페이가 밀리거나 깎이는 경험을 했어요",
    ],
    solutions: [
      "반경 안 공고만 알림으로 받아요. 출퇴근 거리는 내가 정해요",
      "사장님 평점·매장 정보를 수락 전에 확인할 수 있어요",
      "정산은 그날 또는 익일, 토스 에스크로라 사장님 마음대로 미룰 수 없어요",
    ],
    cta: "워커로 사전 신청",
  },
  trustSafety: {
    sectionTitle: "믿고 쓸 수 있는 이유",
    sectionSubtitle:
      "속도만큼 안전이 중요하다는 걸 알아요. 그래서 세 가지를 직접 만들었습니다.",
    pillars: [
      {
        title: "토스 에스크로 + 노쇼 보장",
        description:
          "정산 금액은 토스 에스크로에 먼저 예치됩니다. 노쇼 시 플랫폼이 책임집니다 — 차순위 워커에게 무료 재디스패치되고, 사장님 예치금은 전액 보호돼요.",
      },
      {
        title: "양방향 리뷰",
        description:
          "사장님은 워커를, 워커는 사장님을 평가해요. 한쪽만 불이익을 받는 구조가 아닙니다. 평점 이력은 다음 매칭 알고리즘에 바로 반영됩니다.",
      },
      {
        title: "24시간 분쟁 처리",
        description:
          "노쇼, 초과 근무, 페이 이견이 생기면 AlbaConnect 운영팀이 24시간 안에 검토합니다. 알고리즘이 아니라 사람이 해결해요.",
      },
    ],
  },
  stats: {
    sectionTitle: "강남·서초 베타 측정 결과",
    items: [
      { value: "23초", label: "평균 매칭 확정 시간" },
      { value: "87%", label: "충원율 (공고 → 매칭 확정)" },
      { value: "5개동", label: "베타 운영 지역" },
    ],
    disclaimer: "* 2026년 4월 강남·서초 5개동 베타 테스트 자체 측정치",
  },
  faq: {
    sectionTitle: "자주 묻는 질문",
    items: [
      {
        q: "수수료가 얼마인가요?",
        a: "사장님은 매칭 1건당 평균 3,840원(GMV 8%)만 부담합니다. 워커는 무료예요. 매칭이 완료된 경우에만 부과되며, 노쇼나 분쟁 시 자동 환불됩니다. 알바몬 정액 광고(8만~30만 원/월) 대비 약 70% 저렴해요.",
      },
      {
        q: "노쇼·분쟁이 생기면 어떻게 책임지나요?",
        a: "토스 에스크로로 사장님이 예치한 금액은 매칭 완료 시에만 워커에게 정산됩니다. 노쇼 발생 시 차순위 워커에게 즉시 무료로 재디스패치되고, 분쟁은 AlbaConnect 운영팀이 24시간 내에 검토해서 처리해요. 사장님이 혼자 감당하지 않아도 됩니다.",
      },
      {
        q: "기존 알바 직원은 어떻게 되나요?",
        a: "AlbaConnect는 단기·결원 충원용 도구입니다. 기존 알바와 병행해서 갑작스러운 공백이나 피크타임 추가 인력만 메우는 용도로 권장해요. 기존 직원을 대체하기 위한 서비스는 아닙니다.",
      },
      {
        q: "위치 추적이 항상 켜져 있나요?",
        a: "아닙니다. 위치는 워커가 '공고 수신 모드'를 켤 때만 사용돼요. 근무 중에는 도착 확인 목적으로만 활용하고, 그 외 시간에는 수집하지 않아요. 위치 권한은 언제든 앱 설정에서 끌 수 있습니다.",
      },
      {
        q: "정산은 언제 받을 수 있나요?",
        a: "근무 완료 확인 후 당일 또는 익일 오전에 토스 에스크로를 통해 지급됩니다. 사장님이 확인을 미루는 경우 일정 시간 후 자동 확인 처리돼서 워커가 기다릴 필요가 없어요.",
      },
      {
        q: "워커 검증은 어떻게 하나요?",
        a: "워커는 본인 인증(휴대폰 또는 신분증)을 완료해야 매칭을 받을 수 있어요. 이후 이전 사장님들의 양방향 리뷰 평점과 활동 이력이 매칭 알고리즘에 반영됩니다. 처음 가입한 워커는 신규 뱃지가 붙어서 사장님이 확인할 수 있어요.",
      },
      {
        q: "알바몬·당근알바와 다른 점이 뭔가요?",
        a: "알바몬은 정액 광고, 당근알바는 동네 인맥 기반이에요. AlbaConnect는 알고리즘 매칭입니다. 공고가 등록되는 순간 6개 요소를 계산해서 가장 적합한 워커에게 즉시 알림이 가고, 30초 안에 수락 여부가 돌아와요. 사장님이 기다리는 게 아니라 시스템이 먼저 찾아갑니다.",
      },
      {
        q: "베타 출시는 언제인가요?",
        a: "2026년 4월부터 강남·서초 5개동에서 베타 운영 중이고, 2026년 하반기 서울 전역 확장을 목표로 준비 중입니다. 지금 사전 신청하시면 정식 오픈 전 우선 초대 링크를 먼저 받으실 수 있어요.",
      },
    ],
  },
  finalCta: {
    sectionTitle: "지금 사전 신청하고\n베타 우선 초대 받으세요",
    subtitle:
      "사장님은 첫 공고 수수료 면제 혜택을, 워커는 매칭 알림 우선 수신을 받으실 수 있어요. 오픈 전 신청자에게 가장 먼저 초대 링크를 보내드립니다.",
    formLabels: {
      role: "역할",
      roleEmployer: "사장님 (구인)",
      roleWorker: "워커 (구직)",
      email: "이메일",
      phone: "연락처 (선택)",
      region: "주 활동 지역",
      businessNumber: "사업자등록번호",
      businessNumberPlaceholder: "000-00-00000",
      submit: "사전 신청하기",
      consent: "개인정보 수집 및 이용에 동의합니다 (필수)",
    },
    thankYou: "신청이 완료됐어요. 베타 출시 전 이메일로 먼저 알려드릴게요.",
  },
  footer: {
    tagline: "30초 안에 워커와 사장님을 잇는다",
    columns: [
      {
        heading: "AlbaConnect",
        links: [
          { label: "작동 방식", href: "#how-it-works" },
          { label: "매칭 알고리즘", href: "#matching" },
          { label: "수수료", href: "#pricing" },
          { label: "사전 신청", href: "#final-cta" },
        ],
      },
      {
        heading: "사장님",
        links: [
          { label: "사장님 안내", href: "#for-employers" },
          { label: "수수료 안내", href: "#pricing" },
          { label: "사장님으로 신청", href: "#final-cta" },
        ],
      },
      {
        heading: "워커",
        links: [
          { label: "워커 안내", href: "#for-workers" },
          { label: "정산 안내", href: "#faq" },
          { label: "워커로 신청", href: "#final-cta" },
        ],
      },
      {
        heading: "고객 지원",
        links: [
          { label: "자주 묻는 질문", href: "#faq" },
          { label: "문의하기", href: "mailto:hello@albaconnect.kr" },
        ],
      },
    ],
    legal: ["이용약관", "개인정보처리방침", "사업자정보"],
    company: "AlbaConnect (주)",
    copyright: "© 2026 AlbaConnect",
  },
} as const
