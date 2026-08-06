import { describe, expect, it } from "vitest"
import { pocContent } from "../app/(marketing)/_content/poc"

describe("marketing POC landing copy", () => {
  it("does not present the internal matching POC as a paid live service", () => {
    const landingCopy = JSON.stringify(pocContent)

    expect(landingCopy).not.toContain("30초")
    expect(landingCopy).not.toContain("수수료")
    expect(landingCopy).not.toContain("토스")
    expect(landingCopy).not.toContain("바로 가입")
  })

  it("routes the primary conversion to the click-through demo and states its boundaries", () => {
    expect(pocContent.header.cta).toBe("클릭형 데모 시작")
    expect(pocContent.hero.primaryCta).toBe("클릭형 데모 시작")
    expect(pocContent.boundaries).toContain("실제 내부 DB 미연결")
    expect(pocContent.boundaries).toContain("결제·정산 제외")
  })
})
