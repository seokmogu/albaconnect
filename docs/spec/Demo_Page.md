# [Spec] AlbaConnect 3분할 실시간 데모 페이지

**라우트**: `/sim/demo`
**구현**: `apps/web/src/app/sim/demo/page.tsx` (서버) + `DemoPlayer.tsx` (클라이언트)
**작성일**: 5월 19일
**목적**: 사내 공유용 — 좌·중·우 3시점을 한 화면에 두고 매칭 흐름을 영상으로 녹화

---

## 1. 개요

데모 페이지는 dispatch 이벤트를 타임라인으로 자동 재생해, 하나의 매칭이
구인자·구직자·관리자 세 시점에서 동시에 어떻게 보이는지 보여준다. 영상 녹화
결과물은 `docs/demo.webm`.

---

## 2. 데이터 구성 (서버 — `page.tsx`)

`loadSnapshot()`으로 시뮬 스냅샷을 읽고, 매칭 성공(`acceptedBy` 존재) dispatch
중 **앞 30건**을 `DemoStep[]`으로 변환한다.

```
DemoStep:
  postingId   string
  employer    { id, name, hub, location }
  worker      { id, name, avgRating, ratingCount, completionRate, location }
  posting     { title, hourlyRate, durationHours, headcount, category, employmentType }
  acceptedReason            string | null
  acceptedSecondsToDecide   number | null
```

`employer`/`worker`/`posting`을 `Map<string, T>`로 색인 후 조인. 조인 실패
(누락) 스텝은 `null` 반환 후 `filter`로 제거.

---

## 3. 재생 동작 (클라이언트 — `DemoPlayer.tsx`)

### 3.1 Props

`steps`, `totalEmployers`, `totalWorkers`, `totalDispatches`.

### 3.2 페이즈 루프

각 스텝은 3페이즈를 순환한다.

| 페이즈 | 지속 | 내용 |
|--------|------|------|
| `posting` | 1.3초 | 사장님이 공고를 등록 |
| `matching` | 1.3초 | 6요소 매칭 알고리즘이 반경 내 워커 정렬 — 구직자 패널에 "30초"(고정) 배지 |
| `accepted` | 2.2초 | 워커가 `acceptedSecondsToDecide`초 만에 수락 (값이 null이면 "—") |

`accepted` 종료 시 다음 스텝으로(`(idx+1) % steps.length` 순환). `playing`
토글로 일시정지/재생.

### 3.3 3분할 패널

| 위치 | 패널 | accent |
|------|------|--------|
| 좌 | 구인자 (사장님) | `#FF6E0D` |
| 중 | 구직자 (워커) | `#22C55E` |
| 우 | 관리자 (관제) | `#3B82F6` |

- 구인자 패널: 공고 카드 + 페이즈별 "등록 / 매칭 중" 배지
- 구직자 패널: `matching` 전까지 "매칭 알림 대기 중", 이후 매칭 워커·수락 사유
- 관리자 패널: 강남구 미니맵(좌표 투영, 320×260) + 누적 매칭 KPI

고용형태(`employmentType`)는 4색 배지로 표시(`긱`/`일일`/`단기`/`장기`).

---

## 4. 제약 및 비범위

- 30 스텝 고정 — dispatch가 30건 미만이면 있는 만큼만
- 자체 완결: 스냅샷 JSON만 의존, 실DB·API 없음
- 영상 녹화는 수동 (Playwright 등 외부 도구)
