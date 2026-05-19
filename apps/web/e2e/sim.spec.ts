/**
 * AlbaConnect 시뮬레이터 E2E.
 *
 * /sim/* 라우트의 핵심 인터랙션 경로를 검증한다:
 *  - 메인 진입, 용역 트랙(필터·합의서 모달), 구직자 마이페이지(수락→합의서·지오펜스 체크인),
 *    관제 대시보드(분쟁 트리아지 패널).
 *
 * 시뮬레이터 상태는 세션 메모리 기반 — 각 test는 독립 페이지 로드로 시작한다.
 */
import { test, expect } from "@playwright/test"

// 일감·알림이 가장 많은 워커 (run-dispatch 스냅샷 기준)
const WORKER_ID = "w-5272"

test.describe("시뮬레이터 메인", () => {
  test("메인 페이지가 사장님·워커·용역 진입점을 노출한다", async ({ page }) => {
    await page.goto("/sim")
    await expect(page.getByText("알바몬 커넥트")).toBeVisible()
    // 용역 트랙 링크가 존재한다
    await expect(page.getByRole("link", { name: /용역/ }).first()).toBeVisible()
  })
})

test.describe("용역 트랙 (/sim/service)", () => {
  test("카테고리 필터가 의뢰 목록을 좁힌다", async ({ page }) => {
    await page.goto("/sim/service")
    await expect(page.getByRole("heading", { name: "용역 의뢰 둘러보기" })).toBeVisible()

    // 전체 120건 → 심부름 필터 적용
    await page.getByRole("link", { name: /심부름/ }).click()
    await expect(page).toHaveURL(/cat=errand/)
    // 도급 안내 배너는 필터 후에도 유지
    await expect(page.getByText("용역 트랙 — 개인 간 도급, 근로계약 아님.")).toBeVisible()
  })

  test("전자 용역 합의서 모달 — 동의 전 확정 버튼 비활성, 동의 후 계약 성립", async ({ page }) => {
    await page.goto("/sim/service")
    await page.getByRole("button", { name: "용역 합의 진행" }).first().click()

    const dialog = page.getByRole("dialog", { name: "전자 용역 합의서" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("민법상 도급계약")).toBeVisible()

    const confirm = dialog.getByRole("button", { name: "동의하고 용역 계약 확정" })
    await expect(confirm).toBeDisabled()

    await dialog.getByRole("checkbox").check()
    await expect(confirm).toBeEnabled()

    await confirm.click()
    await expect(dialog.getByText("용역 계약 성립")).toBeVisible()
  })
})

test.describe("구직자 마이페이지 (/sim/me/worker)", () => {
  test("매칭 알림 수락 시 전자 근로 합의서 모달이 열린다", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await expect(page.getByText("새 매칭 알림")).toBeVisible()

    await page.getByRole("button", { name: "수락" }).first().click()
    const dialog = page.getByRole("dialog", { name: "전자 근로 합의서" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "동의하고 계약 확정" })).toBeVisible()
  })

  test("지오펜스 체크인 — 반경 밖 거부 → 도착 → 체크인 → 체크아웃 근로시간 기록", async ({ page }) => {
    await page.goto(`/sim/me/worker/${WORKER_ID}`)
    await page.getByRole("button", { name: /일감/ }).first().click()

    // 첫 일감 카드는 사업장 반경 밖 — "사업장 도착 (시뮬)" 버튼이 보인다
    const arrive = page.getByRole("button", { name: "사업장 도착 (시뮬)" }).first()
    await expect(arrive).toBeVisible()
    await arrive.click()

    // 도착 후 체크인 가능
    const checkIn = page.getByRole("button", { name: "지오펜스 체크인" }).first()
    await expect(checkIn).toBeVisible()
    await checkIn.click()

    // 근무 중 → 체크아웃
    await expect(page.getByText(/근무 중/).first()).toBeVisible()
    await page.getByRole("button", { name: "체크아웃" }).first().click()
    await expect(page.getByText("근로시간 기록 완료 (양측 동의)").first()).toBeVisible()
  })
})

test.describe("관제 대시보드 (/sim/admin)", () => {
  test("분쟁 트리아지 패널이 준비금 현황과 함께 렌더된다", async ({ page }) => {
    await page.goto("/sim/admin")
    await expect(page.getByText("알바몬 커넥트 관제 대시보드")).toBeVisible()
    await expect(page.getByRole("heading", { name: /분쟁 트리아지/ })).toBeVisible()
    await expect(page.getByText("분쟁 준비금")).toBeVisible()
  })
})
