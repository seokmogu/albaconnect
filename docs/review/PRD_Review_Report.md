# PRD Review Report: AlbaConnect 시뮬레이터

**Review Date**: 5월 18일
**Reviewed By**: Claude (PRD Reviewer)
**Document(s)**: PRD_AlbaConnect_Simulator.md, US-1~7, Technical_Spec.md, TC_AlbaConnect_Simulator.md

---

## Executive Summary

마이페이지 신규 요구를 P0로 명확히 분리하고, 기존 구현분(관제 대시보드)을 P1로 구분한 점은 좋다. 다만 Phase 3 US(US-8/9)가 PRD에만 존재하고 US 문서가 없으며, US-3의 상태 저장 방식이 문서 간 불일치한다. 성공 지표 중 일부는 이미 달성된 값을 목표로 잡아 측정 의미가 약하다.

**Issue Count**:
- Critical: 1
- Major: 3
- Minor: 4

---

## Detailed Findings

### PRD 본문

#### Critical Issues

**Phase 3 US 문서 부재**
- **Location**: PRD Section 5, Epic 3 (US-8, US-9)
- **Issue**: PRD는 US-8(노쇼 시뮬), US-9(분쟁 트리아지)를 정의했으나 해당 US 상세 문서가 없다. Phase 3 항목이라 즉시 작업 대상은 아니지만, PRD에 ID가 등록된 이상 최소 stub US 문서가 있어야 추적 가능하다.
- **Impact**: US 목록과 실제 US 문서 집합이 불일치해 문서 완결성이 깨진다.
- **Recommendation**: US-8/US-9 stub 문서를 생성하거나, PRD Section 5에서 Phase 3을 "추후 정의" 주석으로 명시하고 US ID 부여를 보류한다.

#### Major Issues

**성공 지표가 이미 달성된 값을 목표로 설정**
- **Location**: PRD Section 4, 제품 지표 "평균 매칭 시간 15초 이하"
- **Issue**: 시뮬 실측이 이미 8.6초다. 목표 15초는 현 상태로 자동 충족되어 개선 측정 의미가 없다.
- **Impact**: 지표가 프로젝트 진척을 변별하지 못한다.
- **Recommendation**: 마이페이지 도입 후 측정 의미가 있는 지표(예: 본인 시점 진입 성공률, 수락/거절 인터랙션 성공률)에 집중하고, 이미 달성된 항목은 "현황"으로 표기해 목표와 구분한다.

**마이페이지 라우트가 PRD에 미명세**
- **Location**: PRD Section 3 vs Technical_Spec 4.2
- **Issue**: spec은 `/sim/me/*` 네임스페이스를 명확히 정의했으나 PRD 본문에는 라우트 구조가 없다. PRD만 읽으면 마이페이지가 기존 `/sim/employer/[id]`를 대체하는지 별도인지 알 수 없다.
- **Impact**: PRD-spec 간 정보 비대칭. PRD 단독으로 범위 판단 불가.
- **Recommendation**: PRD Section 3 핵심 기능에 "마이페이지는 기존 관리자 시점 화면과 별도 네임스페이스로 추가"를 한 줄 명시한다.

**US-3 상태 저장 방식 문서 간 불일치**
- **Location**: US-3 Business Rules vs Technical_Spec 5.3
- **Issue**: US-3은 수락 결과가 "구인자 화면에 반영"된다고 하나 저장 매체를 명시하지 않는다. spec은 "JSON 갱신 또는 세션 메모리(재현성 우선이면 메모리)"로 둘 다 열어뒀다. 결정이 미뤄진 상태다.
- **Impact**: 구현자가 임의 선택하면 US-3-TC-3(구인자 화면 반영)·DATA-1(재현성)이 충돌할 수 있다.
- **Recommendation**: 저장 방식을 하나로 확정한다. 시뮬 재현성을 지표(Section 4)로 명시했으므로 "세션 메모리, 새로고침 시 dispatches.json 기준으로 리셋"이 일관적이다.

#### Minor Issues

**US-1/US-2 마이페이지의 구현 상태 미표기**
- **Location**: US-1, US-2 헤더
- **Issue**: US-5~7은 "구현 상태: 구현 완료"를 표기했으나 US-1~4는 구현 상태 표기가 없다. 미구현임을 명시하면 추적이 쉽다.
- **Recommendation**: US-1~4 헤더에 "구현 상태: 미구현"을 추가한다.

**Phase 기간 미표기**
- **Location**: PRD Section 0 Phase 로드맵
- **Issue**: prd_structure 템플릿은 Phase에 기간(N주)을 권장하나 표에 기간이 없다.
- **Recommendation**: 시뮬 프로젝트라 기간 산정이 어렵다면 "기간 미정"을 명시하거나 우선순위만 남긴다 (의도적 생략이면 유지 가능).

**TC와 US Acceptance Criteria 매핑 누락**
- **Location**: TC_AlbaConnect_Simulator.md
- **Issue**: 각 TC가 어떤 Acceptance Criteria를 검증하는지 역참조가 없다.
- **Recommendation**: TC 테이블에 "관련 AC" 열을 추가하면 커버리지 검증이 쉬워진다 (선택).

**PRD Section 2 사례 인용이 1건뿐**
- **Location**: PRD Section 2 문제 1~3
- **Issue**: prd_structure는 핵심 문제마다 "사례(실제 사용자 목소리)"를 권장하나 문제 2·3에 사례 인용이 없다.
- **Recommendation**: 문제 2(불투명성), 문제 3(탐색성)에도 한 줄 사례를 추가하면 설득력이 올라간다.

---

## Cross-Document Consistency

| 항목 | PRD | US | Spec | TC | 일치 |
|------|-----|-----|------|-----|------|
| 6요소 가중치 | 언급 | - | 명세 | DATA-2 | ✓ |
| 마이페이지 라우트 | 미명세 | 미명세 | `/sim/me/*` | TC에서 사용 | ✗ (PRD/US 보강 필요) |
| US-3 상태 저장 | 미결정 | 미결정 | 양자택일 | TC-3/DATA-1 충돌 가능 | ✗ |
| 구현 완료 범위 | Phase 2 | US-5~7 표기 | 4.1 표기 | - | ✓ |
| 매칭률 목표 95% | Section 4 | - | - | - | 실측 98%와 정합 ✓ |

---

## Positive Observations

- 1-pager가 "현재 화면은 관리자 중심"이라는 Gap을 명확히 짚고 마이페이지를 P0로 끌어올린 점이 좋다.
- US-1~4가 INVEST 원칙에 부합한다 — 각 스토리가 독립적이고, 시나리오·Business Rules·Acceptance Criteria가 구체적이다.
- Technical_Spec이 데이터 모델·매칭 산식·라우트를 구현자가 바로 쓸 수 있는 수준으로 명세했다.
- 기존 구현분(US-5~7)에 "구현 상태" 표기를 둬 신규/기존 범위를 구분한 점이 좋다.

---

## Recommendations Summary

1. **[Critical]** US-8/US-9 stub 문서 생성 또는 PRD에서 Phase 3 ID 부여 보류
2. **[Major]** US-3 상태 저장 방식을 "세션 메모리"로 확정하고 PRD·US·spec 통일
3. **[Major]** PRD Section 3에 마이페이지 라우트 분리 정책 한 줄 추가
4. **[Major]** 성공 지표를 마이페이지 도입 효과 중심으로 재정렬, 달성 항목은 "현황" 표기
5. **[Minor]** US-1~4 헤더에 "구현 상태: 미구현" 추가
6. **[Minor]** TC에 관련 AC 열 추가 (선택)

> 💡 Critical 1건·Major 3건을 먼저 반영하면 PRD-US-Spec-TC 4개 문서가 정합 상태가 된다. Minor는 후속 보강으로 충분하다.

---

## 반영 상태 (5월 18일 1차 리뷰 후속)

| # | 이슈 | 심각도 | 반영 |
|---|------|--------|------|
| 1 | Phase 3 US 문서 부재 | Critical | ✅ PRD Section 5 Epic 3을 "추후 정의" 주석으로 변경, US ID 부여 보류 |
| 2 | 성공 지표 달성값 목표 설정 | Major | ✅ 평균 매칭 시간을 "현황 모니터링 항목"으로 재분류, 인터랙션 성공률 추가 |
| 3 | 마이페이지 라우트 PRD 미명세 | Major | ✅ PRD Section 3 핵심 기능 1에 `/sim/me/*` 네임스페이스 분리 명시 |
| 4 | US-3 상태 저장 방식 불일치 | Major | ✅ US-3·Spec 모두 "세션 메모리, 새로고침 시 리셋"으로 통일 |
| 5 | US-1~4 구현 상태 미표기 | Minor | ✅ 4개 US 헤더에 "구현 상태: 미구현" + 라우트 추가 |
| 6 | TC-AC 매핑 누락 | Minor | ⬜ 후속 보강 (선택) |
| 7 | PRD Section 2 사례 인용 부족 | Minor | ⬜ 후속 보강 (선택) |

Critical·Major 4건 전부 반영 완료. PRD-US-Spec-TC 4개 문서 정합 상태 확보. Minor 2건은 후속 보강 대상.
