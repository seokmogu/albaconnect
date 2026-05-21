# ⚡ AlbaConnect

> 위치 기반 초단기/단기 알바 실시간 매칭 플랫폼  
> PostGIS + WebSocket으로 구직자와 구인자를 즉시 연결 — 카카오T 배차 방식

---

## 🚀 핵심 기능

| 기능 | 설명 |
|------|------|
| 📍 **위치 기반 매칭** | PostGIS `ST_DWithin`으로 반경 내 워커 실시간 탐색 |
| 🧮 **복합 매칭 스코어** | 거리(32%) + 평점(23%) + 직종(18%) + 신뢰도(13%) + 활동성(6%) + 가용성(8%) |
| 📡 **WebSocket 실시간 디스패치** | `POST /api/jobs/:id/dispatch` — 30초 ping/pong keepalive |
| 📅 **워커 가용성 캘린더** | 근무 가능 스케줄 + 블랙아웃 날짜 등록, 매칭 필터 적용 |
| 💳 **토스 페이먼츠 연동** | 에스크로 검증, HMAC 멱등성 웹훅, 정산 스텁 |
| ⭐ **양방향 리뷰** | 구직자↔구인자 별점 + 코멘트 시스템 |
| 🛡️ **어드민 운영 API** | 분쟁 관리, 유저 정지, 플랫폼 통계 (Redis 60초 캐시) |
| 📊 **구인자 KPI 대시보드** | 충원율, 평균 매칭 시간, 미해결 분쟁 + 공고별 애널리틱스 |
| 🔔 **비동기 알림** | BullMQ + Socket.io 기반 실시간/비동기 알림 큐 |
| 🗃️ **Redis L2 캐싱** | 지오스페이셜 쿼리 및 워커 프로필 캐싱 |
| 🔎 **구조적 요청 로깅** | 상관 ID(`X-Request-Id`) 기반 추적 로그 |
| 🎭 **Playwright E2E 테스트** | 전체 사용자 흐름 자동화 테스트 환경 |

---

## 🧮 매칭 알고리즘

```
Score (0–100) = 거리(32) + 평점(23) + 직종일치(18) + 신뢰도(13) + 활동성(6) + 가용성(8)

거리점수    = max(0, 1 – distance/radius) × 32
평점점수    = ratingCount > 0 ? ((avgRating–1)/4 × 18 + 5) : 11.5
직종일치    = categories.includes(jobCategory) ? 18 : 0
신뢰도      = (completionRate × 0.7 + verifiedBonus × 0.3) × 13
활동성      = lastSeenAt < 1h: 6점 | < 24h: 4점 | < 7d: 2점 | 이상: 0점
가용성      = 해당 날짜/시간 캘린더 등록 여부 (8점 또는 0점)
```

---

## 📡 실시간 디스패치 흐름

```
구인자                        서버                          워커
  │── POST /api/jobs/:id/dispatch ──→│                          │
  │                                  │── WebSocket 푸시 ────────→│
  │                                  │←── accept / reject ───────│
  │←── 결과 응답 (matched/failed) ───│                          │
  │              (30초 ping/pong keepalive 유지)
```

---

## 💳 결제 흐름 (토스 페이먼츠)

```
구인자 → 에스크로 예치 → 토스 웹훅(HMAC 검증) → 플랫폼 보관
→ 근무 완료 확인 → 정산 실행 (payout stub)
→ 노쇼/분쟁 발생 시 어드민이 분쟁 해결 후 수동 정산
```

---

## 🗂 디렉토리 구조

```
albaconnect/
├── apps/
│   ├── api/                        # Fastify 5 백엔드 (port 3001)
│   │   └── src/
│   │       ├── db/                 # Drizzle ORM + PostGIS 마이그레이션
│   │       ├── routes/             # auth, jobs, workers, applications, reviews,
│   │       │                       # payments, employer, notifications, admin,
│   │       │                       # dispatch (WebSocket), availability
│   │       ├── services/           # matching.ts, scoring.ts, dispatch.ts
│   │       ├── queues/             # BullMQ 알림 큐
│   │       ├── middleware/         # JWT 인증, 상관 ID 로깅
│   │       ├── plugins/            # Socket.io, Redis
│   │       └── __tests__/          # Vitest 단위 테스트
│   └── web/                        # Next.js 15 PWA (port 3000)
│       └── src/app/
│           ├── worker/             # home, search, jobs, earnings, profile,
│           │                       # review, availability
│           └── employer/           # dashboard (KPI), jobs/new, jobs/[id],
│                                   # jobs/[id]/escrow, profile, review
├── packages/shared/                # 공통 타입, 상수
└── e2e/                            # Playwright E2E 테스트
```

---

## 🔌 API 엔드포인트

### 인증
```
POST /auth/signup
POST /auth/login
POST /auth/refresh
```

### 공고
```
GET  /api/jobs              ?lat&lng&radius_km&category&status
POST /api/jobs
GET  /api/jobs/:id
PUT  /api/jobs/:id/cancel
POST /api/jobs/:id/dispatch     # WebSocket 실시간 디스패치
```

### 구직자
```
PUT  /api/workers/availability  { isAvailable, lat, lng }
GET  /api/workers/profile
PUT  /api/workers/profile
GET  /api/workers/availability-calendar
PUT  /api/workers/availability-calendar
```

### 구인자
```
GET  /api/employers/profile
PUT  /api/employers/profile
GET  /api/employers/stats
GET  /api/employers/dashboard/kpi     # 충원율, 평균 매칭 시간, 분쟁 현황
GET  /api/employers/dashboard/jobs    # 공고별 애널리틱스
```

### 지원/배정
```
GET  /api/applications
POST /api/applications/:id/accept
POST /api/applications/:id/reject
POST /api/applications/:id/complete
POST /api/applications/:id/noshow
```

### 리뷰
```
POST /api/reviews
GET  /api/reviews/:userId
```

### 결제 (토스 페이먼츠)
```
POST /api/payments/escrow           # 에스크로 예치
POST /api/payments/webhook          # 토스 웹훅 (HMAC 검증)
GET  /api/payments
```

### 알림
```
GET  /api/notifications
PUT  /api/notifications/read-all
PUT  /api/notifications/:id/read
```

### 어드민 (`X-Admin-Token` 헤더 필수)
```
GET  /api/admin/stats               # 플랫폼 통계 (Redis 60초 캐시)
GET  /api/admin/users
PUT  /api/admin/users/:id/suspend   # 유저 정지
GET  /api/admin/disputes
PUT  /api/admin/disputes/:id        # 분쟁 처리
GET  /api/admin/health
```

---

## 📱 페이지 목록

### 구직자
| 경로 | 설명 |
|------|------|
| `/worker/home` | 메인 — available 토글 + 실시간 매칭 팝업 |
| `/worker/search` | 알바 검색 (카테고리/거리/시급/날짜 필터) |
| `/worker/jobs` | 지원/배정 목록 + 근무완료 확인 |
| `/worker/earnings` | 수입 내역 (순수익 계산) |
| `/worker/profile` | 프로필 + 직종 편집 |
| `/worker/availability` | 가용성 캘린더 설정 (스케줄 + 블랙아웃) |
| `/worker/review/[jobId]` | 리뷰 작성 |

### 구인자
| 경로 | 설명 |
|------|------|
| `/employer/dashboard` | KPI 대시보드 (충원율, 매칭 시간, 분쟁) |
| `/employer/jobs/new` | 공고 등록 (현재위치 자동입력) |
| `/employer/jobs/[id]` | 공고 상세 + 구직자 목록 + 노쇼처리 |
| `/employer/jobs/[id]/escrow` | 임금 에스크로 결제 |
| `/employer/profile` | 프로필 + 통계 |
| `/employer/review/[jobId]` | 구직자 리뷰 작성 |

---

## 💰 패널티 정책

| 상황 | 패널티 |
|------|--------|
| 구직자 노쇼 | 약정 임금 100% 몰수 → 구인자에게 |
| 구인자 당일 취소/노쇼 | 약정 임금 100% + 플랫폼 수수료 → 구직자에게 |
| 구인자 24시간 이내 취소 | 약정 임금 30% → 구직자에게 |

---

## 🛠 기술 스택

| 레이어 | 기술 |
|--------|------|
| **프론트엔드** | Next.js 15, TailwindCSS, PWA |
| **백엔드** | Fastify 5, TypeScript, Node.js 22 |
| **데이터베이스** | PostgreSQL 16 + PostGIS |
| **ORM** | Drizzle ORM |
| **캐시** | Redis (L2 캐시, 60초/5분 TTL) |
| **실시간** | Socket.io, WebSocket |
| **큐** | BullMQ (알림 비동기 처리) |
| **결제** | 토스 페이먼츠 (에스크로) |
| **테스트** | Vitest (단위), Playwright (E2E) |
| **패키지 관리** | pnpm monorepo |

---

## ⚙️ 실행 방법

### 1. PostgreSQL + PostGIS + Redis 시작
```bash
docker-compose up db redis -d
```

### 2. 환경변수 설정
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

### 3. 개발 서버
```bash
pnpm install
pnpm dev    # api(:3001) + web(:3000) 동시 실행
```

### 4. 테스트
```bash
# 단위 테스트
cd apps/api && pnpm test

# E2E 테스트
pnpm e2e
```

### 5. Docker 전체 실행
```bash
docker-compose up
```

### 사내망 POC 실행

맥미니 같은 내부망 단일 호스트에서 구성원만 접근하는 POC는 production용 외부 공개 인프라 대신
`docker-compose.poc.yml`을 사용합니다. 기본값은 Toss mock 결제, PostGIS, Redis, API, Web을 함께 올립니다.

```bash
pnpm poc:setup -- --host macmini.local
pnpm poc:doctor
pnpm poc:up
pnpm poc:health
```

`.local` 호스트명이 사내망에서 불안정하면 `pnpm poc:setup -- --host <맥미니-내부IP> --force`로
고정 IP 기반 `.env.poc`을 생성하세요. POC compose는 Web/API만 LAN에 노출하고 Postgres/Redis는
기본적으로 `127.0.0.1`에만 바인딩합니다.

자세한 절차는 [POC_DEPLOYMENT.md](./POC_DEPLOYMENT.md)를 참고하세요.

---

## 🔧 환경변수

```env
# apps/api/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/albaconnect
REDIS_URL=redis://localhost:6379
JWT_SECRET=                     # 32자 이상 랜덤 문자열
JWT_REFRESH_SECRET=             # 32자 이상 랜덤 문자열
KAKAO_BIZ_API_KEY=              # 카카오 알림톡 API 키
KAKAO_SENDER_KEY=               # 카카오 알림톡 발신 프로필 키
TOSS_CLIENT_KEY=                # 토스페이먼츠 클라이언트 키
TOSS_SECRET_KEY=                # 토스페이먼츠 시크릿 키
TOSS_WEBHOOK_SECRET=            # 토스 웹훅 HMAC 시크릿
TOSS_CLIENT_MODE=rest           # rest | mock | mcp-mock
PAYOUT_RELEASE_MODE=stub        # production: manual 또는 external 필요
ADMIN_TOKEN=                    # 관리자 API 토큰
PORT=3001

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_KAKAO_MAP_API_KEY=  # 카카오 지도 JavaScript 키
```

Production에서는 `JWT_SECRET`, `ADMIN_TOKEN`, `TOSS_SECRET_KEY`, `TOSS_WEBHOOK_SECRET`, `WEB_URL`,
`PAYOUT_RELEASE_MODE`가 없으면 API가 시작되지 않습니다. 정산 API는 실제 외부 정산 운영 절차가 준비된 경우에만
`PAYOUT_RELEASE_MODE=manual` 또는 `PAYOUT_RELEASE_MODE=external`로 열어야 합니다.
운영 환경에서는 `TOSS_SECRET_KEY`가 `live_sk` 또는 `live_gsk`로 시작해야 합니다. 스테이징에서 테스트 키로
production gate를 확인해야 할 때만 `TOSS_ALLOW_TEST_KEYS=true`를 함께 설정하세요.

Toss MCP는 개발 중 문서 검색을 돕는 MCP 서버입니다. 현재 API 런타임에서는 실제 결제 조회를 REST API로 수행하고,
로컬/스테이징에서 네트워크 없이 흐름을 검증하려면 `TOSS_CLIENT_MODE=mock` 또는 `TOSS_CLIENT_MODE=mcp-mock`을
사용합니다. `TOSS_MOCK_PAYMENT_STATUS`, `TOSS_MOCK_ORDER_ID`, `TOSS_MOCK_TOTAL_AMOUNT`,
`TOSS_MOCK_PAYMENT_JSON`으로 mock 응답을 고정할 수 있습니다. production에서는 mock 모드가 기본 차단되며,
의도적으로 열어야 하는 테스트 환경에서만 `TOSS_ALLOW_MOCK_CLIENT=true`를 함께 설정하세요.

### Production readiness / smoke check

```bash
# 필수 운영 환경변수, Toss 웹훅 시크릿 self-test, 선택적 /health 확인
pnpm --filter @albaconnect/api run readiness:production

# 배포 API 헬스체크까지 포함하려면
API_BASE_URL=https://api.example.com pnpm --filter @albaconnect/api run readiness:production

# Toss 결제 조회 smoke: 결제창에서 테스트 결제를 만든 뒤 paymentKey를 넣어 실행
TOSS_SMOKE_PAYMENT_KEY=pay_... \
TOSS_SMOKE_EXPECTED_STATUS=DONE \
pnpm --filter @albaconnect/api run smoke:toss
```
