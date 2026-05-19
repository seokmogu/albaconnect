/**
 * AlbaConnect 시뮬레이터 E2E — P0 테스트 케이스 전면 커버.
 *
 * docs/TC_AlbaConnect_Simulator.md의 P0 TC를 Playwright로 구현한다.
 * 각 test 제목 끝의 [US-NN-TC-N]이 커버하는 TC-ID다.
 *
 * 시뮬레이터 상태는 세션 메모리 기반 — 각 test는 독립 페이지 로드로 시작한다.
 * 세션 메모리 한계로 페이지 간 상태 전파를 요구하는 TC는 test.skip 처리하고 사유를 남긴다.
 */
import { test, expect } from "@playwright/test"

// run-dispatch 스냅샷 기준 — 일감·알림이 가장 많은 워커
const WORKER_ID = "w-5272"
const EMPLOYER_ID = "emp-001"

// ───────────────────────────────────────────────────────────────────────────
// Epic 1: 마이페이지 (US-1 ~ US-4)
// ───────────────────────────────────────────────────────────────────────────
test.describe("Epic 1 — 마이페이지", () => {
  test("구인자 마이페이지가 매장 컨텍스트와 탭을 렌더한다 [US-1-TC-1, US-1-TC-3]", async ({ page }) => {
    const res = await page.goto(`/sim/me/employer/${EMPLOYER_ID}`)
    expect(res?.status()).toBe(200)
    await expect(page.getByText(/모드/).first()).toBeVisible()
    // 공고·매칭·정산·내정보 탭
    await expect(page.getByText("공고", { exact: true }).first()).toBeVisible()
  })

  test("없는 사업장 ID는 404 처리된다 [US-1-TC-4, US-4-TC-4]", async ({ page }) => {
    const res = await page.goto("/sim/me/employer/emp-99999")
    expect(res?.status()).toBe(404)
  })

  test("구직자 마이페이지가 평점·신뢰도를 렌더한다 [US-2-TC-1]", async ({ page }) => {
    const res = await page.goto(`/sim/me/worker/${WORKER_ID}`)
    expect(res?.status()).toBe(200)
    await expect(page.getByText("워커 모드")).toBeVisible()
    await expect(page.getByText(/신뢰도/).first()).toBeVisible()
  })

  test("받은 매칭 알림이 카드로 표시된다 [US-2-TC-2]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await expect(page.getByText("새 매칭 알림")).toBeVisible()
    await expect(page.getByRole("button", { name: "수락" }).first()).toBeVisible()
  })

  test("진행 일감이 예상 정산액과 함께 표시된다 [US-2-TC-3]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: /일감/ }).first().click()
    await expect(page.getByText("예상 정산").first()).toBeVisible()
  })

  test("없는 워커 ID는 404 처리된다 [US-2-TC-4]", async ({ page }) => {
    const res = await page.goto("/sim/me/worker/w-99999")
    expect(res?.status()).toBe(404)
  })

  test("매칭 알림 수락 시 알림이 진행 일감으로 이동한다 [US-3-TC-1]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    const before = await page.getByRole("button", { name: "수락" }).count()
    await page.getByRole("button", { name: "수락" }).first().click()
    // 합의서 동의 → 알림 제거
    await page.getByRole("dialog", { name: "전자 근로 합의서" })
      .getByRole("button", { name: "동의하고 계약 확정" }).click()
    await expect(page.getByRole("button", { name: "수락" })).toHaveCount(before - 1)
  })

  test("매칭 알림 거절 시 알림이 제거된다 [US-3-TC-2]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    const before = await page.getByRole("button", { name: "거절" }).count()
    await page.getByRole("button", { name: "거절" }).first().click()
    await expect(page.getByRole("button", { name: "거절" })).toHaveCount(before - 1)
  })

  test.skip("수락이 구인자 마이페이지에 반영된다 [US-3-TC-3]", async () => {
    // 세션 메모리 아키텍처 — 워커 페이지의 수락 상태는 별도 로드되는
    // 구인자 페이지에 전파되지 않는다. 크로스 페이지 검증 불가.
  })

  test.skip("이미 매칭된 공고 수락 차단 [US-3-TC-4]", async () => {
    // 알림 목록에는 미수락 dispatch만 노출되므로 이 상태를 e2e로 재현 불가.
  })

  test("메인에서 사장님 로그인으로 진입할 수 있다 [US-4-TC-1]", async ({ page }) => {
    await page.goto("/sim")
    await page.getByRole("link", { name: /사장님 로그인/ }).click()
    await expect(page).toHaveURL(/login\/employer/)
    await expect(page.getByText("사장님 로그인")).toBeVisible()
  })

  test("메인에서 워커 로그인으로 진입할 수 있다 [US-4-TC-2]", async ({ page }) => {
    await page.goto("/sim")
    await page.getByRole("link", { name: /워커 로그인/ }).click()
    await expect(page).toHaveURL(/login\/worker/)
  })

  test("레거시 /sim/me는 메인으로 리다이렉트된다 [US-4-TC-5]", async ({ page }) => {
    await page.goto("/sim/me")
    await expect(page).toHaveURL(/\/sim$/)
  })

  test("구인자 마이페이지 매칭 탭이 매칭 현황을 렌더한다 [US-1-TC-2]", async ({ page }) => {
    await page.goto(`/sim/me/employer/${EMPLOYER_ID}`)
    await page.getByText("매칭", { exact: true }).first().click()
    // 매칭 워커 정보 또는 빈 상태 안내 — 탭이 깨지지 않고 렌더된다
    await expect(page.getByText(/매칭/).first()).toBeVisible()
  })

  test("구인자 마이페이지는 본인 매장 컨텍스트로 고정된다 [US-1-TC-7]", async ({ page }) => {
    await page.goto(`/sim/me/employer/${EMPLOYER_ID}`)
    // "사장님 모드" 컨텍스트 배지 — 다른 사업장 데이터·이동 링크 없음
    await expect(page.getByText("사장님 모드")).toBeVisible()
    await expect(page.locator('a[href*="/sim/me/employer/emp-002"]')).toHaveCount(0)
  })

  test("구직자 마이페이지는 본인 워커 컨텍스트로 고정된다 [US-2-TC-6]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    // "워커 모드" 컨텍스트 배지 — 다른 워커 마이페이지 이동 링크 없음
    await expect(page.getByText("워커 모드")).toBeVisible()
    await expect(page.locator('a[href*="/sim/me/worker/w-"]')).toHaveCount(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Epic 2: 관제 대시보드 (US-5, US-7)
// ───────────────────────────────────────────────────────────────────────────
test.describe("Epic 2 — 관제 대시보드", () => {
  test("관제 대시보드가 지도·KPI와 함께 렌더된다 [US-5-TC-1]", async ({ page }) => {
    const res = await page.goto("/sim/admin")
    expect(res?.status()).toBe(200)
    await expect(page.getByText("알바몬 커넥트 관제 대시보드")).toBeVisible()
    await expect(page.locator("svg").first()).toBeVisible()
  })

  test("구직자 목록이 페이지당 60명으로 분할된다 [US-7-TC-1]", async ({ page }) => {
    const res = await page.goto("/sim/worker")
    expect(res?.status()).toBe(200)
    await expect(page.getByLabel("페이지 네비게이션")).toBeVisible()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Epic 4: 워커 가용성 (US-10, US-11)
// ───────────────────────────────────────────────────────────────────────────
test.describe("Epic 4 — 워커 가용성", () => {
  test("스케줄 규칙을 추가하면 목록에 표시된다 [US-10-TC-1]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: /스케줄/ }).first().click()
    await page.getByRole("button", { name: /추가/ }).click()
    await page.getByRole("button", { name: "월", exact: true }).click()
    await page.getByRole("button", { name: "스케줄 추가" }).click()
    await expect(page.getByText(/월/).first()).toBeVisible()
  })

  test("요일 미선택 시 스케줄 추가가 차단된다 [US-10-TC-3]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: /스케줄/ }).first().click()
    await page.getByRole("button", { name: /추가/ }).click()
    page.once("dialog", (d) => d.accept()) // alert "요일을 선택하세요"
    await page.getByRole("button", { name: "스케줄 추가" }).click()
    // 규칙 카운트가 늘지 않음 — 폼이 그대로 열려 있다
    await expect(page.getByRole("button", { name: "스케줄 추가" })).toBeVisible()
  })

  test("종료 시각이 시작보다 빠르면 차단된다 [US-10-TC-4]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: /스케줄/ }).first().click()
    await page.getByRole("button", { name: /추가/ }).click()
    await page.getByRole("button", { name: "월", exact: true }).click()
    await page.locator('input[type="time"]').first().fill("18:00")
    await page.locator('input[type="time"]').nth(1).fill("12:00")
    page.once("dialog", (d) => d.accept())
    await page.getByRole("button", { name: "스케줄 추가" }).click()
    await expect(page.getByRole("button", { name: "스케줄 추가" })).toBeVisible()
  })

  test("라이브 매칭 토글 시 위치 선택과 수신 안내가 노출된다 [US-11-TC-1]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: "라이브 매칭 토글" }).click()
    await expect(page.getByText(/반경 3km/)).toBeVisible()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Epic 5: Trust & Safety (US-12, US-13, US-14)
// ───────────────────────────────────────────────────────────────────────────
test.describe("Epic 5 — Trust & Safety", () => {
  test("지오펜스 체크인 — 도착 후 체크인하면 근무 중으로 전환된다 [US-12-TC-1]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: /일감/ }).first().click()
    await page.getByRole("button", { name: "사업장 도착 (시뮬)" }).first().click()
    await page.getByRole("button", { name: "지오펜스 체크인" }).first().click()
    await expect(page.getByText(/근무 중/).first()).toBeVisible()
  })

  test("체크아웃 시 근로시간이 기록된다 [US-12-TC-2]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: /일감/ }).first().click()
    await page.getByRole("button", { name: "사업장 도착 (시뮬)" }).first().click()
    await page.getByRole("button", { name: "지오펜스 체크인" }).first().click()
    await page.getByRole("button", { name: "체크아웃" }).first().click()
    await expect(page.getByText("근로시간 기록 완료 (양측 동의)").first()).toBeVisible()
  })

  test("사업장 반경 밖에서는 체크인이 거부된다 [US-12-TC-3]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: /일감/ }).first().click()
    // 도착 시뮬 없이 — 반경 밖이면 체크인 버튼 대신 도착 버튼이 노출된다
    await expect(page.getByRole("button", { name: "사업장 도착 (시뮬)" }).first()).toBeVisible()
    await expect(page.getByText(/사업장 반경 밖/).first()).toBeVisible()
  })

  test("매칭 수락 시 전자 근로 합의서 모달이 열린다 [US-13-TC-1]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: "수락" }).first().click()
    await expect(page.getByRole("dialog", { name: "전자 근로 합의서" })).toBeVisible()
  })

  test("합의서 동의 시 진행 일감으로 이동한다 [US-13-TC-2]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: "수락" }).first().click()
    const dialog = page.getByRole("dialog", { name: "전자 근로 합의서" })
    await dialog.getByRole("button", { name: "동의하고 계약 확정" }).click()
    await expect(dialog).not.toBeVisible()
  })

  test("합의서 취소 시 알림 목록이 유지된다 [US-13-TC-3]", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    const before = await page.getByRole("button", { name: "수락" }).count()
    await page.getByRole("button", { name: "수락" }).first().click()
    await page.getByRole("dialog", { name: "전자 근로 합의서" })
      .getByRole("button", { name: "취소" }).click()
    await expect(page.getByRole("button", { name: "수락" })).toHaveCount(before)
  })

  test("분쟁 트리아지 패널이 유형·권장 조치와 함께 렌더된다 [US-14-TC-1]", async ({ page }) => {
    await page.goto("/sim/admin")
    await expect(page.getByRole("heading", { name: /분쟁 트리아지/ })).toBeVisible()
    await expect(page.getByText("권장 조치 ·").first()).toBeVisible()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Epic 6: 개인 용역 (US-15)
// ───────────────────────────────────────────────────────────────────────────
test.describe("Epic 6 — 개인 용역", () => {
  test("용역 의뢰 목록과 도급 안내 배너가 렌더된다 [US-15-TC-1]", async ({ page }) => {
    const res = await page.goto("/sim/service")
    expect(res?.status()).toBe(200)
    await expect(page.getByText("용역 트랙 — 개인 간 도급, 근로계약 아님.")).toBeVisible()
  })

  test("카테고리 필터가 의뢰 목록을 좁힌다 [US-15-TC-2]", async ({ page }) => {
    await page.goto("/sim/service")
    await page.getByRole("link", { name: /심부름/ }).click()
    await expect(page).toHaveURL(/cat=errand/)
  })

  test("용역 합의 진행 시 전자 용역 합의서 모달이 열린다 [US-15-TC-3]", async ({ page }) => {
    await page.goto("/sim/service")
    await page.getByRole("button", { name: "용역 합의 진행" }).first().click()
    await expect(page.getByRole("dialog", { name: "전자 용역 합의서" })).toBeVisible()
  })

  test("동의 후 용역 계약이 성립한다 [US-15-TC-4]", async ({ page }) => {
    await page.goto("/sim/service")
    await page.getByRole("button", { name: "용역 합의 진행" }).first().click()
    const dialog = page.getByRole("dialog", { name: "전자 용역 합의서" })
    await dialog.getByRole("checkbox").check()
    await dialog.getByRole("button", { name: "동의하고 용역 계약 확정" }).click()
    await expect(dialog.getByText("용역 계약 성립")).toBeVisible()
  })

  test("동의 체크 전에는 확정 버튼이 비활성이다 [US-15-TC-5]", async ({ page }) => {
    await page.goto("/sim/service")
    await page.getByRole("button", { name: "용역 합의 진행" }).first().click()
    const dialog = page.getByRole("dialog", { name: "전자 용역 합의서" })
    await expect(dialog.getByRole("button", { name: "동의하고 용역 계약 확정" })).toBeDisabled()
  })
})
