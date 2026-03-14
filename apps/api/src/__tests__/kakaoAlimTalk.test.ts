import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Import module under test — do NOT use dynamic import so vi.mock can intercept
import {
  normalizePhone,
  initKakaoAlimTalk,
  isKakaoConfigured,
  sendAlimTalk,
  jobAvailableAlimTalk,
} from "../services/kakaoAlimTalk.js"

describe("normalizePhone", () => {
  it("strips +82 country code and returns domestic format", () => {
    expect(normalizePhone("+821012345678")).toBe("01012345678")
    expect(normalizePhone("821012345678")).toBe("01012345678")
  })

  it("passes through already-domestic Korean mobile numbers", () => {
    expect(normalizePhone("01012345678")).toBe("01012345678")
    expect(normalizePhone("01112345678")).toBe("01112345678")
  })

  it("returns null for invalid or non-Korean numbers", () => {
    expect(normalizePhone("")).toBeNull()
    expect(normalizePhone("+1-555-1234567")).toBeNull()
    expect(normalizePhone("12345")).toBeNull()
    expect(normalizePhone("07012345678")).toBeNull() // Japanese prefix
  })

  it("strips hyphens and spaces before validation", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678")
    expect(normalizePhone("010 1234 5678")).toBe("01012345678")
  })
})

describe("sendAlimTalk — dev-stub mode (no API key)", () => {
  beforeEach(() => {
    // Clear module-level kakaoConfigured flag by re-initializing without keys
    vi.stubEnv("KAKAO_BIZ_API_KEY", "")
    vi.stubEnv("KAKAO_SENDER_KEY", "")
    vi.stubEnv("VITEST", "") // bypass VITEST guard so initKakaoAlimTalk() runs
    initKakaoAlimTalk()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("does NOT call fetch when API key is not set (dev-stub mode)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)

    await sendAlimTalk({ phone: "01012345678", templateCode: "JOB_AVAILABLE", variables: {} })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("sendAlimTalk — configured mode", () => {
  beforeEach(() => {
    vi.stubEnv("KAKAO_BIZ_API_KEY", "test-biz-key")
    vi.stubEnv("KAKAO_SENDER_KEY", "test-sender-key")
    vi.stubEnv("VITEST", "") // bypass VITEST guard
    initKakaoAlimTalk()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("calls fetch with correct URL and KakaoAK Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)

    await sendAlimTalk({
      phone: "01012345678",
      templateCode: "JOB_AVAILABLE",
      variables: { jobTitle: "편의점 알바", hourlyRate: "12,000" },
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.bizmessage.kakao.com/talk/bizmessage/v1/send")
    expect((options as RequestInit).headers).toMatchObject({
      Authorization: "KakaoAK test-biz-key",
      "Content-Type": "application/json",
    })

    const body = JSON.parse((options as RequestInit).body as string)
    expect(body.senderKey).toBe("test-sender-key")
    expect(body.templateCode).toBe("JOB_AVAILABLE")
    expect(body.recipientList[0].recipientNo).toBe("01012345678")
  })

  it("throws with Kakao error code when API returns non-ok status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ errorCode: "E901", errorMessage: "template not found" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      sendAlimTalk({ phone: "01012345678", templateCode: "INVALID_CODE", variables: {} })
    ).rejects.toThrow("E901")
  })

  it("skips send and does not throw when phone is invalid (null from normalizePhone)", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    // Should not throw, should not call fetch
    await expect(
      sendAlimTalk({ phone: "+1-555-9999999", templateCode: "JOB_AVAILABLE", variables: {} })
    ).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("jobAvailableAlimTalk calls sendAlimTalk with JOB_AVAILABLE template code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal("fetch", fetchMock)

    await jobAvailableAlimTalk({
      phone: "01012345678",
      jobTitle: "카페 알바",
      hourlyRate: 10000,
      address: "서울시 강남구",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.templateCode).toBe("JOB_AVAILABLE")
    expect(body.recipientList[0].templateParameter.jobTitle).toBe("카페 알바")
  })
})
