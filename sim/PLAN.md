# AlbaConnect Stand-Alone Simulator v2 — 강남구 대규모

> 목표: 강남구 100개 사업장 × 약 1만명 구직자 (또는 실 알바몬 비율로 조정) 시뮬레이션. claude haiku 4.5로 공고/이력서 일괄 생성. 결과를 sim DB에 누적, 관제 UI 3종(구인자/구직자/관리자)으로 시각화.

---

## 0. 데이터 의존성

### 실 알바몬 비율 (사용자 작업 필요)

`~/project/dskit` (ClickHouse + Athena CLI)을 통해 사내 데이터레이크에 접근:

```bash
cp ~/project/dskit/.env.example ~/project/dskit/.env
# .env에 CH_HOST / CH_USER / CH_PASSWORD 채움 (DS/DRE 팀 문의)
aws sso login --profile ldp-local   # Athena 사용 시
```

추출할 비율 (강남구 한정):

```sql
-- mon_resume_db (1.18억건 전국, 분석 리포트 §01)에서
SELECT count(*) AS resume_count_gangnam
  FROM mon_resume_db
 WHERE gg_want_area_no = '강남구 코드'
   AND _row_status = 1
   AND m_want_job_stat = 1;  -- 구직 활성

-- 공고 테이블 (mon_job_db 또는 유사)
SELECT count(*) AS posting_count_gangnam
  FROM mon_job_db_or_equivalent
 WHERE area_code = '강남구 코드'
   AND status = 'active';

-- 사업장 단위 unique
SELECT count(DISTINCT employer_id) AS employer_count_gangnam
  FROM mon_job_db_or_equivalent
 WHERE area_code = '강남구 코드';
```

도출 비율 (예시 — 실측 후 교체):

| 항목 | 강남구 추정 | 시뮬 스케일 (×0.01) |
|------|-------------|---------------------|
| 사업장 수 | ~10,000 | 100 |
| 구직자 (월간 활성) | ~80,000 | 800 (또는 1만 풀스케일) |
| 활성 공고 (시점) | ~2,000 | 20 |
| 1사업장당 월평균 공고 | 1-3건 | 동일 |

→ 시뮬 스케일은 실측 후 PLAN §3에 확정.

---

## 1. 디렉터리 구조

```
albaconnect/sim/
├── PLAN.md                     # 이 문서
├── run.mjs                     # v1 — 3 사장님 × 6 워커 데모 (기존)
├── data/
│   ├── employers.json          # 강남구 100개 사업장 (lat/lng/카테고리/상호명)
│   ├── workers.json            # 구직자 N명 (lat/lng/카테고리/평점/페르소나 1줄)
│   ├── postings.json           # haiku로 생성된 공고 N건
│   └── albamon-ratios.json     # dskit에서 추출한 실 비율
├── lib/
│   ├── claude.mjs              # claude -p 헤드리스 wrapper (haiku 모델 고정)
│   ├── geo.mjs                 # 강남구 행정동 + 격자 sampler
│   ├── scoring.mjs             # 6요소 매칭 (run.mjs에서 추출)
│   └── db.mjs                  # sim 전용 sqlite 또는 postgres sim schema
├── seed/
│   ├── seed-employers.mjs      # 강남구 사업장 100개 생성
│   ├── seed-postings.mjs       # haiku batch — 사업장당 공고 N건
│   ├── seed-workers.mjs        # haiku batch — 공고 보고 적합 이력서 N명
│   └── derive-ratios.mjs       # dskit 호출 → albamon-ratios.json 저장
├── runner/
│   ├── run-dispatch.mjs        # 시간 슬라이스로 dispatch 시뮬
│   └── run-batch.mjs           # N분 시뮬레이션 실행 + DB 누적
└── ui/                         # → albaconnect/apps/web/src/app/sim/ 신규 라우트
```

UI는 albaconnect/apps/web 안에 `/sim/employer`, `/sim/worker`, `/sim/admin` 추가.

---

## 2. Phase 분할

### Phase 1 — 데이터 준비 (이번 세션 일부 진행)

- [ ] **derive-ratios.mjs**: dskit으로 강남구 비율 추출 → albamon-ratios.json
  - 사용자가 dskit/.env 자격증명 채움 필요
  - 대기 중에는 추정값 (사업장 100 vs 구직자 800)으로 진행
- [x] **seed-employers.mjs**: 강남구 100개 사업장 (행정동 분포 + 카테고리 분포)
- [ ] **seed-postings.mjs**: haiku batch — 100개 사업장 × 평균 2공고 = 200건
  - 입력: 사업장 (카테고리, 위치, 페르소나)
  - 출력: 자연어 공고 → normalizer로 구조화된 JSON
  - 모델: claude-haiku-4-5
  - 병렬: 5개씩 동시 호출 (rate-friendly)
- [ ] **seed-workers.mjs**: haiku batch — 공고 보고 적합 이력서 N명
  - 공고 N건을 보고 각 공고당 매칭 가능한 워커 페르소나 5-10명 생성
  - 즉 "공고 200건 × 5워커 = 1000명" 또는 비율에 맞춰 800-10000명
  - 거리/카테고리/평점 분포가 매칭 알고리즘 의도대로 작동하도록 분포 의도적 설계

### Phase 2 — DB + 시뮬 엔진

- [ ] **lib/db.mjs**: sqlite (`sim/data/sim.db`) — 의존성 0
  - 테이블: employers, workers, postings, dispatches, decisions, matches, stats
- [ ] **runner/run-dispatch.mjs**: 단일 공고 dispatch
  1. 공고 1개 INSERT
  2. 매칭 알고리즘 (scoring.mjs)으로 워커 ranking
  3. Top-3 워커에게 haiku 호출 (수락/거절 결정)
  4. 첫 수락자 → match 확정, dispatches 종료
  5. DB INSERT
- [ ] **runner/run-batch.mjs**: 시간 슬라이스 시뮬
  - 예: 60분간 매 1분당 평균 3건 dispatch (Poisson 분포)
  - 각 dispatch 비동기 처리
  - 완료 시 stats 집계 (충원율, 평균 매칭 시간)

### Phase 3 — 관제 UI 3종

위치: `albaconnect/apps/web/src/app/sim/`

#### 3a. `/sim/employer/[employerId]` — 구인자 화면

User Task: 사장님이 자기 매장 공고 진행상황 보기

| 섹션 | 컨텐츠 |
|------|--------|
| 헤더 | 매장명, 위치 핀, 활성 공고 N건 |
| 진행 중 공고 | dispatch 진행률, 알림 받은 워커 수, 수락 대기 시간 |
| 매칭 확정 카드 | 워커 정보 (이름·평점·거리·도착 ETA) + "연락하기"/"분쟁신고" |
| 과거 공고 히스토리 | 충원/노쇼/평점 |
| KPI | 평균 매칭 시간, 충원율, 누적 정산액 |

#### 3b. `/sim/worker/[workerId]` — 구직자 화면

User Task: 워커가 알림 받고 수락/거절, 정산 확인

| 섹션 | 컨텐츠 |
|------|--------|
| 헤더 | 이름·평점·신뢰도, 위치 토글 (공고 수신 ON/OFF) |
| 새 매칭 알림 | 카드 형식, 30초 카운트다운, 수락/거절 버튼 (또는 "LLM auto-decide") |
| 진행 중 일감 | 도착 체크인, 근무 완료 버튼 |
| 정산 현황 | 진행/완료/대기 별 금액 |
| 평점 이력 | 받은 평점·코멘트 |

#### 3c. `/sim/admin` — 관리자 화면

User Task: 운영자가 실시간 매칭 현황 + 분쟁 + KPI 모니터링

| 섹션 | 컨텐츠 |
|------|--------|
| 라이브 지도 | 강남구 지도 + 사업장 핀 + 매칭 라인 애니메이션 |
| 실시간 KPI | 현재 dispatch 진행 N건, 매칭 성공률, 평균 매칭 시간, 활성 워커 수 |
| dispatch 흐름 로그 | 최근 50건 (공고 등록→매칭→수락→완료 타임라인) |
| 분쟁 큐 | AI 트리아지 결과 + 우선순위 + 권장 조치 |
| 시뮬 컨트롤 | "현재 시각 가속 ×N", "공고 발생률 조정", "노쇼 시나리오 주입" |
| LLM 비용 모니터 | 일 누적 토큰 / 비용 / agent별 호출 수 |

UT 차이:
- 구인자: **불안 해소 중심** (지금 매칭되고 있다는 확신, 워커 신뢰도 미리 보기)
- 구직자: **빠른 의사결정 + 정산 안심** (30초 카운트다운, 정산 진행 상태)
- 관리자: **전체 흐름 가시화 + 개입 가능성** (라이브 지도, 분쟁 큐, 시뮬 컨트롤)

### Phase 4 — 분쟁 시뮬 (선택)

매칭 후 시나리오:
- 5% 노쇼 → DisputeTriageAgent 호출 → 차순위 워커 재디스패치
- 1% 분쟁 (정산 이견) → 양측 LLM 진술 생성 → 트리아지

---

## 3. 모델 선택

| 단계 | 모델 | 이유 |
|------|------|------|
| 사장님 자연어 공고 작성 | haiku | 짧음, 빠름, 비용 |
| ListingNormalizer | haiku | 정확도 좋음, 비용 작음 |
| 워커 이력서 생성 | haiku | 대량 (1000+) |
| 워커 매칭 수락 결정 | haiku | 짧은 결정 |
| 분쟁 트리아지 | haiku (시뮬용 — 실 운영은 sonnet) | 시뮬 비용 |

claude CLI: `claude -p --model claude-haiku-4-5 --output-format text`

---

## 4. 비용 가드

OAuth 토큰 한도 보호:

- 시드 단계: 한 번만 실행, 결과 캐시 (JSON 파일)
- 시뮬 실행: 분당 dispatch 수 제한 (Phase 2 batch에서 throttle)
- 일 누적 호출 수 콘솔 표시
- 1만명 워커 풀스케일 이력서는 *공고 매칭 시 lazy 생성* 패턴도 검토 (한 번에 다 안 만듦)

---

## 5. 이번 세션 처리 (Phase 1 일부)

지금 진행:
1. ✅ PLAN.md 작성
2. → seed-employers.mjs (강남구 100개 사업장, 자격증명 불필요)
3. → seed-postings.mjs 데모 (10건만, haiku 호출 검증)
4. → 사용자에게 dskit 자격증명 요청 안내 (병렬)

다음 세션:
- 사용자가 자격증명 채우면 derive-ratios.mjs → 실 비율
- 그 비율로 seed-workers.mjs 풀스케일
- DB + UI 단계

---

## 6. 진행 상태 체크리스트

- [x] Phase 0: 데이터 의존성 분석
- [x] Phase 1a: 강남구 사업장 시드 — 312개
- [x] Phase 1b: 공고 시드 (haiku) — 624건
- [x] Phase 1c: 비율 추출 (Athena ldp-viewer) — albamon-ratios.json
- [x] Phase 1d: 워커 이력서 시드 (haiku) — 9,950명
- [x] Phase 2: dispatch runner — 624건 dispatch, 613 매칭 (98%)
- [x] Phase 3a: /sim/employer UI — 목록+상세
- [x] Phase 3b: /sim/worker UI — 목록+상세
- [x] Phase 3c: /sim/admin UI — 관제 대시보드 (지도+KPI+매칭라인)
- [ ] Phase 4: 분쟁 시뮬 (DisputeTriageAgent 연동) — 미실행

결과 요약: [RESULTS.md](RESULTS.md)
