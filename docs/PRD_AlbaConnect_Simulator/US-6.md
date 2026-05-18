# US-6: 운영자는 개별 dispatch를 추적하기 위해 dispatch 로그를 조회할 수 있다

**Epic**: Epic 2 - 관제 대시보드

**Phase**: Phase 2

**Priority**: P1

**구현 상태**: 구현 완료 (`/sim/admin` dispatch 로그 영역)

---

## 배경 및 해결하고자 하는 문제

운영자는 전체 KPI뿐 아니라 개별 dispatch가 어떻게 처리됐는지 추적해야 한다. 어떤 공고가 어떤 워커에게 매칭됐는지, 알림을 몇 명이 받았는지, 매칭이 안 된 dispatch는 무엇인지 확인할 수 있어야 매칭 알고리즘을 디버깅할 수 있다.

---

## 기능 요구사항 (Functional Requirements)

### 세부 기능

**1. 최근 dispatch 목록**
최근 dispatch를 공고 ID·매칭 여부·알림 받은 워커 수와 함께 표시한다.

**2. 매칭/미매칭 구분**
매칭 확정 dispatch는 수락 워커를, 미매칭은 사유를 표시한다.

**3. 공고 목록 연동**
최근 공고 목록에서 사업장 이름을 클릭하면 해당 구인자 페이지로 이동한다.

---

## Acceptance Criteria

- [ ] dispatch 로그에 최근 dispatch가 매칭 여부와 함께 표시된다
- [ ] 매칭 확정 dispatch는 수락 워커 ID를 표시한다
- [ ] 미매칭 dispatch는 식별 가능하게 구분 표시된다
- [ ] 공고 목록의 사업장 링크로 구인자 페이지에 이동할 수 있다

---

## 성공 지표 (Success Metrics)

* dispatch 로그가 시뮬 결과와 100% 일치
* 미매칭 dispatch 식별 가능

---

## 의존성 및 제약사항

* **선행**: US-5(관제 대시보드 기반)
* **제약**: 로그는 최근 N건만 표시 (전체 624건 일괄 렌더 회피)

---

## Definition of Done

- [ ] dispatch 로그 영역 동작
- [ ] Acceptance Criteria 통과
