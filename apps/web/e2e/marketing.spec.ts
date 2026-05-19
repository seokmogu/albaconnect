/**
 * Marketing landing E2E.
 *
 * Covers the new (marketing) route group: hero, pricing comparison, CTA,
 * and conditional businessNumber field when the employer role is selected.
 *
 * SPEC: .agency/briefs/BRIEF-001-albaconnect-landing/brief.md §8
 */
import { test, expect } from "@playwright/test"

test.describe("AlbaConnect marketing landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("renders hero with headline and dual CTAs", async ({ page }) => {
    // Hero headline split across two lines (2트랙 포괄 헤드라인으로 변경됨)
    await expect(page.getByRole("heading", { level: 1 })).toContainText("알바도 심부름도")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("30초 안에 사람을 구해요")

    // Dual CTAs — employer (primary) and worker (secondary). Multiple occurrences
    // are expected (Hero + ForEmployers + ForWorkers + FinalCTA), so we check first().
    await expect(page.getByRole("button", { name: "사장님으로 사전 신청" }).first()).toBeVisible()
    await expect(page.getByRole("button", { name: "워커로 사전 신청" }).first()).toBeVisible()

    // Employer emphasis badge (business analysis L1)
    await expect(page.getByText("사장님 우선")).toBeVisible()

    // Toss payment badge (L6)
    await expect(page.getByText("토스 페이먼츠 에스크로")).toBeVisible()
  })

  test("renders pricing comparison table (L2)", async ({ page }) => {
    const pricing = page.locator("#pricing")
    await expect(pricing).toBeVisible()
    await expect(pricing.getByText("매칭 1건당 평균 3,840원")).toBeVisible()
    await expect(pricing.getByText("알바몬 커넥트", { exact: true })).toBeVisible()
    await expect(pricing.getByText("알바몬 정액 광고", { exact: true })).toBeVisible()
    await expect(pricing.getByText("당근알바 동네 노출", { exact: true })).toBeVisible()
  })

  test("renders matching algorithm with 13% highlight (L7)", async ({ page }) => {
    const matching = page.locator("#matching")
    await expect(matching).toBeVisible()
    // The large highlight infographic shows the value as separate number + unit
    await expect(matching.getByText("13", { exact: true })).toBeVisible()
    await expect(matching.getByText("양방향 리뷰가 매칭 점수에 미치는 영향")).toBeVisible()
  })

  test("renders region-limited stats (L4)", async ({ page }) => {
    // Numbers appear in both Stats grid and in surrounding solution copy; the
    // standalone <dd> values are what we care about.
    await expect(page.getByText("23초", { exact: true })).toBeVisible()
    await expect(page.getByText("87%", { exact: true })).toBeVisible()
    await expect(page.getByText("5개동", { exact: true })).toBeVisible()
    await expect(page.getByText(/베타 테스트 자체 측정치/)).toBeVisible()
  })

  test("FAQ surfaces the top-3 conversion-blocker questions in order (L5)", async ({ page }) => {
    const faq = page.locator("#faq")
    await expect(faq).toBeVisible()
    const summaries = faq.locator("summary")
    await expect(summaries.nth(0)).toContainText("수수료가 얼마인가요")
    await expect(summaries.nth(1)).toContainText("노쇼")
    await expect(summaries.nth(2)).toContainText("기존 알바 직원")
  })

  test("clicking employer CTA scrolls to the final form", async ({ page }) => {
    await page.getByRole("button", { name: "사장님으로 사전 신청" }).first().click()
    // Smooth scroll lands on the sign-up form section
    await expect(page.locator("#final-cta")).toBeInViewport({ ratio: 0.3, timeout: 5000 })
  })

  test("selecting employer role reveals businessNumber field (L9)", async ({ page }) => {
    // Scroll to the form
    await page.locator("#final-cta").scrollIntoViewIfNeeded()

    // Before selecting role, businessNumber should NOT be visible
    await expect(page.getByLabel(/사업자등록번호/)).toHaveCount(0)

    // Click employer role segmented control
    await page.getByRole("button", { name: /사장님 \(구인\)/ }).click()

    // businessNumber field should appear
    await expect(page.getByLabel(/사업자등록번호/)).toBeVisible()
    await expect(page.getByPlaceholder("000-00-00000")).toBeVisible()
  })

  test("selecting worker role does NOT show businessNumber field", async ({ page }) => {
    await page.locator("#final-cta").scrollIntoViewIfNeeded()
    await page.getByRole("button", { name: /워커 \(구직\)/ }).click()
    await expect(page.getByLabel(/사업자등록번호/)).toHaveCount(0)
  })

  test("meta tags include albaconnect title and og image", async ({ page }) => {
    const title = await page.title()
    expect(title).toContain("알바몬 커넥트")
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content")
    expect(ogTitle).toContain("알바몬 커넥트")
  })

  test("noshow re-dispatch trust badge is visible in hero (L3)", async ({ page }) => {
    await expect(page.getByText("노쇼 시 무료 재디스패치").first()).toBeVisible()
  })

  test("개인 용역 트랙 섹션이 도급 법적 고지와 함께 렌더된다 [MKT-2]", async ({ page }) => {
    const gig = page.locator("#for-gig-service")
    await expect(gig).toBeVisible()
    // 고용형과 구분되는 법적 고지 — 민법상 도급계약, 근로계약 아님
    await expect(gig.getByText(/민법상 도급계약/).first()).toBeVisible()
    await expect(gig.getByText(/근로기준법·최저임금법 적용 대상이 아닙니다/)).toBeVisible()
  })

  test("개인 용역 섹션 CTA가 신청 폼으로 스크롤된다 [MKT-2]", async ({ page }) => {
    await page.locator("#for-gig-service")
      .getByRole("button", { name: "용역 의뢰인으로 사전 신청" }).click()
    await expect(page.locator("#final-cta")).toBeInViewport({ ratio: 0.3, timeout: 5000 })
  })
})
