# ⚡ AlbaConnect

위치 기반 초단기/단기 알바 매칭 플랫폼

카카오T 택시 배차, 쿠팡이츠 라이더 배차 방식에서 영감을 받아 구직자와 구인자를 실시간으로 연결합니다.

## 핵심 기능

- **위치 기반 매칭**: PostGIS를 이용한 반경 5km 내 실시간 구직자 탐색
- **15초 수락 시스템**: 카카오T처럼 타이머 기반 수락/거절
- **임금 예치 시스템**: 플랫폼이 임금 보관 후 근무 완료시 지급
- **노쇼 패널티**: 구직자 노쇼 → 임금 몰수, 구인자 노쇼 → 100% + 수수료
- **실시간 통신**: Socket.io 기반 양방향 알림

## 기술 스택

```
albaconnect/
├── apps/
│   ├── api/     # Fastify + TypeScript + PostGIS + Socket.io
│   └── web/     # Next.js 15 PWA + Tailwind CSS
└── packages/
    └── shared/  # 공통 타입 및 상수
```

- **Backend**: Fastify, Drizzle ORM, PostgreSQL + PostGIS, Socket.io
- **Frontend**: Next.js 15 App Router, Tailwind CSS, Zustand, Socket.io-client
- **Auth**: JWT (access + refresh token)
- **Maps**: Kakao Maps API
- **Payment**: Toss Payments (stub)

## 실행 방법

### 사전 요구사항
- Node.js 20+
- pnpm 9+
- PostgreSQL with PostGIS extension

### 설치

```bash
pnpm install
```

### 환경 변수 설정

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 개발 서버 실행

```bash
# 전체 동시 실행
pnpm dev

# 개별 실행
cd apps/api && pnpm dev   # :3001
cd apps/web && pnpm dev   # :3000
```

## API 엔드포인트

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/signup | 회원가입 |
| POST | /auth/login | 로그인 |
| GET | /jobs | 공고 목록 (위치 필터) |
| POST | /jobs | 공고 등록 |
| PUT | /workers/availability | 가용 상태 토글 |
| POST | /applications/:id/accept | 매칭 수락 |
| POST | /applications/:id/reject | 매칭 거절 |

## 매칭 로직

1. 구인자가 공고 등록 → 매칭 엔진 트리거
2. PostGIS `ST_DWithin`으로 반경 5km 내 available 구직자 조회
3. 거리 → 평점 순으로 정렬
4. Socket.io로 첫 번째 구직자에게 `job_offer` 이벤트 전송
5. 15초 타이머 → 수락: 확정, 거절/타임아웃: 다음 구직자로

## 패널티 정책

| 상황 | 패널티 |
|------|--------|
| 구직자 노쇼 | 약정 임금 100% 몰수 → 구인자에게 |
| 구인자 당일 취소 | 약정 임금 100% + 수수료 → 구직자에게 |
| 구인자 24시간 이내 취소 | 약정 임금 30% → 구직자에게 |

## 플랫폼 수수료

- 정상 완료: 임금의 10%
- 수수료는 예치 시점에 합산하여 징수
