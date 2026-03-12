# ⚡ AlbaConnect

> 위치 기반 초단기/단기 알바 매칭 플랫폼  
> 카카오T 배차 + 쿠팡이츠 디스패치 방식으로 구직자와 구인자를 실시간 연결

## 🚀 핵심 기능

| 기능 | 설명 |
|------|------|
| **위치 기반 매칭** | PostGIS `ST_DWithin`으로 반경 5km 내 실시간 탐색 |
| **복합 매칭 스코어** | 거리(40%) + 평점(25%) + 직종일치(20%) + 활동성(15%) |
| **15초 수락 시스템** | 카카오T처럼 타이머 기반 수락/거절, 미수락 시 자동 다음 순위 |
| **임금 예치 보호** | 플랫폼이 임금 보관 → 근무 완료 후 지급 |
| **노쇼 패널티** | 구직자 노쇼 → 임금 몰수, 구인자 노쇼 → 100% + 수수료 |
| **실시간 알림** | Socket.io 기반 매칭 알림 + DB 저장 알림 시스템 |
| **양방향 리뷰** | 구인자↔구직자 별점 + 코멘트 |
| **PWA** | 홈 화면 설치 가능한 모바일 웹앱 |

## 🗂 디렉토리 구조

```
albaconnect/
├── apps/
│   ├── api/                    # Fastify 백엔드 (port 3001)
│   │   ├── src/
│   │   │   ├── db/             # Drizzle ORM + PostGIS 마이그레이션
│   │   │   ├── routes/         # auth, jobs, workers, applications, reviews,
│   │   │   │                   # payments, employer, notifications, admin
│   │   │   ├── services/       # matching.ts, scoring.ts
│   │   │   ├── middleware/     # JWT 인증
│   │   │   └── plugins/        # Socket.io 설정
│   │   └── src/__tests__/      # Vitest 단위 테스트
│   └── web/                    # Next.js 15 PWA (port 3000)
│       └── src/app/
│           ├── worker/         # home, search, jobs, earnings, profile, review
│           └── employer/       # dashboard, jobs/new, jobs/[id], jobs/[id]/escrow, profile, review
└── packages/shared/            # 공통 타입, 상수
```

## 🧮 매칭 알고리즘

```
Score (0-100) = 거리점수(40) + 평점점수(25) + 직종일치(20) + 활동성(15)

거리점수 = max(0, 1 - distance/radius) × 40
평점점수 = ratingCount > 0 ? ((avg-1)/4 × 20 + 5) : 12.5
직종일치 = categories.includes(jobCategory) ? 20 : 0
활동성   = lastSeenAt < 1h: 15점, < 24h: 12점, < 7d: 7점, 이상: 2점
```

## 📱 페이지 목록

### 구직자
| 경로 | 설명 |
|------|------|
| `/worker/home` | 메인 — available 토글 + 15초 카운트다운 매칭 팝업 |
| `/worker/search` | 알바 검색 (카테고리/거리/시급/날짜 필터) |
| `/worker/jobs` | 지원/배정 목록 + 근무완료 확인 |
| `/worker/earnings` | 수입 내역 (순수익 계산) |
| `/worker/profile` | 프로필 + 직종 편집 |
| `/worker/review/[jobId]` | 리뷰 작성 |

### 구인자
| 경로 | 설명 |
|------|------|
| `/employer/dashboard` | 공고 관리 대시보드 |
| `/employer/jobs/new` | 공고 등록 (현재위치 자동입력) |
| `/employer/jobs/[id]` | 공고 상세 + 구직자 목록 + 노쇼처리 |
| `/employer/jobs/[id]/escrow` | 임금 예치 결제 |
| `/employer/profile` | 프로필 + 통계 |
| `/employer/review/[jobId]` | 구직자 리뷰 작성 |

### 공통
| 경로 | 설명 |
|------|------|
| `/notifications` | 알림 목록 (읽음 처리) |

## 🔌 API 엔드포인트

```
# 인증
POST /auth/signup
POST /auth/login
POST /auth/refresh

# 공고
GET  /jobs              ?lat&lng&radius_km&category&status
POST /jobs
GET  /jobs/:id
PUT  /jobs/:id/cancel

# 구직자
PUT  /workers/availability  { isAvailable, lat, lng }
GET  /workers/profile
PUT  /workers/profile

# 구인자
GET  /employers/profile
PUT  /employers/profile
GET  /employers/stats

# 지원/배정
GET  /applications
POST /applications/:id/accept
POST /applications/:id/reject
POST /applications/:id/complete
POST /applications/:id/noshow

# 리뷰
POST /reviews
GET  /reviews/:userId

# 결제
GET  /payments
POST /payments/escrow

# 알림
GET  /notifications
PUT  /notifications/read-all
PUT  /notifications/:id/read

# 관리자 (X-Admin-Token 헤더)
GET  /admin/stats
GET  /admin/users
GET  /admin/penalties
GET  /admin/health
```

## ⚙️ 실행 방법

### 1. PostgreSQL + PostGIS 시작
```bash
docker-compose up db -d
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
cd apps/api && pnpm test
```

### 5. Docker 전체 실행
```bash
docker-compose up
```

## 💰 패널티 정책

| 상황 | 패널티 |
|------|--------|
| 구직자 노쇼 | 약정 임금 100% 몰수 → 구인자에게 |
| 구인자 당일 취소/노쇼 | 약정 임금 100% + 플랫폼 수수료 → 구직자에게 |
| 구인자 24시간 이내 취소 | 약정 임금 30% → 구직자에게 |

## 🔧 환경변수

```env
# apps/api/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/albaconnect
JWT_SECRET=                    # 32자 이상 랜덤 문자열
JWT_REFRESH_SECRET=            # 32자 이상 랜덤 문자열
KAKAO_REST_API_KEY=            # 카카오 REST API 키
TOSS_CLIENT_KEY=               # 토스페이먼츠 클라이언트 키
TOSS_SECRET_KEY=               # 토스페이먼츠 시크릿 키
ADMIN_TOKEN=                   # 관리자 API 토큰
PORT=3001

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_KAKAO_MAP_API_KEY= # 카카오 지도 JavaScript 키
```
