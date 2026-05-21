import { describe, expect, it } from "vitest"
import { copy } from "../app/(marketing)/_content/copy"

describe("marketing beta launch copy", () => {
  it("does not expose pre-registration language on the landing copy", () => {
    const landingCopy = JSON.stringify(copy)

    expect(landingCopy).not.toContain("사전 신청")
    expect(landingCopy).not.toContain("우선 초대")
    expect(landingCopy).not.toContain("정식 오픈 전")
    expect(landingCopy).not.toContain("대기자")
  })

  it("routes beta conversion CTAs to real signup and login flows", () => {
    expect(copy.finalCta.cards.map(card => card.href)).toEqual([
      "/signup?role=employer",
      "/signup?role=worker",
    ])
    expect(copy.header.ctaPrimary).toContain("베타")
    expect(copy.header.ctaSecondary).toBe("로그인")
  })
})
