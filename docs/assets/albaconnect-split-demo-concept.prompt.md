# AlbaConnect Split Demo Concept Prompt

- Mode: built-in image generation
- Use case: `ui-mockup`
- Output: `albaconnect-split-demo-concept.png`

## Final prompt

```text
Use case: ui-mockup
Asset type: high-fidelity interactive desktop web demo screen, 1440x1000 landscape, implementation reference for React/HTML
Primary request: Design the best AlbaConnect internal demonstration as a 50:50 split screen. The employer and worker each perform one meaningful click; the matching result updates both sides. Use internal Albamon XDS.
Scene/backdrop: flat desktop browser viewport, very light gray background, white product surfaces, no device mockups, no perspective.
Style/medium: polished Korean enterprise product UI, implementation-ready internal POC.
Color palette: Albamon orange #ff6d12 as the only primary brand color, warm orange tint #fff6ee, white, neutral gray, near-black text, semantic green only for confirmed success. No dark theme and no blue primary.
Typography: Pretendard-like Korean sans serif, strong readable hierarchy, no awkward Korean line breaks.
Composition:
- Top white header with wordmark "알바몬 커넥트", badge "클릭형 데모", scenario count "시나리오 1/30", outline button "처음부터", and compact instruction "양쪽 화면에서 한 번씩 눌러보세요".
- Immediately below, a three-step user-controlled progress strip: "1 구인자가 매칭 요청", "2 구직자가 제안 수락", "3 양쪽 매칭 확정". Step 2 is active.
- Main content is exactly two equal-width large panels separated by a slim vertical matching connector.
- Left panel title "구인자 화면". Show employer "양재역 골목 포차", job "오늘 18:00 홀서빙/주방보조 1명", facts "시급 12,000원", "6시간", "1명". After request, show status "제안 응답 대기", anonymous candidate "후보 8303", distance 1.2km, expected arrival 17:56, and an outlined disabled-looking completed button "매칭 요청 완료".
- Center slim connector shows orange arrow flow from left to right, label "조건 기반 매칭", small badge "AI 추정", and three reason chips "거리 1.2km", "가능 시간 일치", "직종 경험 일치". It should explain the bridge without becoming a third dashboard.
- Right panel title "구직자 화면". Show a prominent incoming-offer card for the same job, employer and pay details, badge "AI 추정", and recommendation reasons. Primary orange button "제안 수락", secondary outline button "거절". A hand cursor points to "제안 수락".
- Bottom shared result area previews what happens next: two synchronized green confirmation blocks connected by a check icon, text "양쪽에 매칭 확정이 동시에 표시됩니다".
- Include small persistent boundary text: "합성 데이터 · 실제 내부 DB 미연결 · 결제·정산 제외".
Interaction meaning: no autoplay controls, no pause button, no timer counting by itself. The only intended actions are employer clicks "매칭 요청하기" and worker clicks "제안 수락", then "다음 시나리오".
Text (verbatim where visible): "알바몬 커넥트", "클릭형 데모", "양쪽 화면에서 한 번씩 눌러보세요", "구인자 화면", "구직자 화면", "매칭 요청하기", "매칭 요청 완료", "제안 응답 대기", "AI 추정", "제안 수락", "거절", "조건 기반 매칭", "양쪽에 매칭 확정이 동시에 표시됩니다", "다음 시나리오".
Design system details: Albamon XDS semantic surfaces, subtle 1px borders, brand radii 16-20px, minimum 40px touch targets, accessible contrast, restrained shadows, orange focus/active states, simple line icons.
Constraints: one coherent desktop web UI screenshot; exactly two primary actor panels; no third admin panel; no auto-playing visual; no photos, gradients, glassmorphism, fake browser chrome, payment or escrow copy, public launch claims, watermark.
Avoid: three-column dashboard, dark theme, animated-loop controls, countdown timer, excessive cards, tiny text, signup/login, pricing, 30-second performance guarantee.
```
