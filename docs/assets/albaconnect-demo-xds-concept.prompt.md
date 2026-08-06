# AlbaConnect XDS Demo Concept Prompt

- Mode: built-in image generation
- Use case: `ui-mockup`
- Output: `albaconnect-demo-xds-concept.png`

## Final prompt

```text
Use case: ui-mockup
Asset type: high-fidelity desktop web product demo screen, 1440x900 landscape, implementation reference for a React/HTML page
Primary request: Redesign the AlbaConnect live matching demo using the internal Albamon XDS design language. Show one synchronized event across employer, worker, and matching operations views.
Scene/backdrop: flat desktop browser viewport, very light gray background, white application surfaces, no device mockup and no perspective.
Style/medium: polished Korean enterprise product UI, production-ready high fidelity, clean and spacious, credible internal demo rather than a marketing landing page.
Color palette: Albamon orange #ff6d12 as the only primary brand color, warm orange tint #fff6ee, white, neutral gray, near-black Korean typography, semantic green only for confirmed success. Avoid dark dashboard styling and avoid blue as a primary color.
Typography: Pretendard-like Korean sans serif, strong hierarchy, large readable numbers, no awkward Korean line breaks.
Composition/framing:
- Top white header with a simple text wordmark "알바몬 커넥트", a small orange "LIVE DEMO" badge, dataset summary "강남구 · 사업장 312 · 구직자 9,950 · 매칭 624", and compact pause/reset controls.
- Under the header, a prominent horizontal four-stage progress stepper: "공고 등록", "AI 매칭", "제안 전송", "수락 확정". The current final stage is highlighted in orange/green and a status sentence reads "김민지 워커가 18초 만에 수락했어요".
- Main area has three equal columns with clear role labels and connected visual rhythm, not cards nested inside cards.
- Left column label "구인자": job slot "오늘 18:00 홀서빙 1명", employer "강남역 오렌지카페", chips for "시급 14,000원", "4시간", "1명", status "매칭 완료", matched worker summary.
- Center column label "워커": an offer panel with countdown "00:12", small "AI 추정" badge, job/pay/distance/time information, reason chips "거리 1.2km", "가능 시간 일치", "서빙 경력", prominent orange button "제안 수락", secondary outline button "거절".
- Right column label "매칭 운영": simplified Gangnam map with orange route between employer and worker, a ranked candidate list with 3 anonymized rows, score bars, and explanation labels. Clearly label "개인정보 비노출".
- Bottom compact KPI strip: "후보 탐색 9,950명", "조건 충족 126명", "제안 5명", "18초 만에 확정".
Design system details: Albamon XDS semantic surfaces, subtle 1px borders, brand radius 16-20px, minimum 40px touch targets, accessible contrast, restrained shadows, orange focus/active states, status badges, simple line icons.
Text (verbatim where visible): "알바몬 커넥트", "LIVE DEMO", "공고 등록", "AI 매칭", "제안 전송", "수락 확정", "김민지 워커가 18초 만에 수락했어요", "구인자", "워커", "매칭 운영", "AI 추정", "개인정보 비노출", "제안 수락", "거절".
Constraints: one coherent desktop UI screenshot only; align to a 12-column grid; content must look implementable in HTML/CSS; no photos, no illustrations, no glassmorphism, no gradients, no fake browser chrome, no watermark.
Avoid: dark theme, neon colors, excessive pills, deeply nested cards, tiny unreadable text, generic crypto analytics appearance, English-dominant labels.
```
