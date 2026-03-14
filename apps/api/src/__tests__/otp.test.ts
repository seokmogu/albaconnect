/**
 * OTP Service unit tests
 *
 * Security properties verified here:
 *  - verifyOtp uses GETDEL (atomic) — no separate GET + DEL race
 *  - verifyOtp throws when Redis is unavailable — no silent bypass
 *  - Attempt counter uses INCR before OTP read (atomic gate)
 *  - Lockout fires at > MAX_ATTEMPTS, not >= (so attempt #4 triggers lock)
 *
 * NOTE: POST /applications/:id/accept integration guard tests
 * (isPhoneVerified true/false flow) require full Fastify + DB setup
 * and live in the integration test suite.
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  getdel: vi.fn(),    // atomic GETDEL — used by verifyOtp
  incr: vi.fn(),
  expire: vi.fn(),
  exists: vi.fn(),
}

const redisModule = vi.hoisted(() => ({ getRedisClient: vi.fn() }))
const kakaoModule = vi.hoisted(() => ({
  sendOtpAlimTalk: vi.fn().mockResolvedValue(undefined),
  initKakaoAlimTalk: vi.fn(),
}))

vi.mock("../lib/redis.js", () => redisModule)
vi.mock("../services/kakaoAlimTalk.js", () => kakaoModule)

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  redisModule.getRedisClient.mockReturnValue(mockRedis)
  mockRedis.set.mockResolvedValue("OK")
  mockRedis.del.mockResolvedValue(1)
  mockRedis.get.mockResolvedValue(null)
  mockRedis.getdel.mockResolvedValue(null)
  mockRedis.incr.mockResolvedValue(1)
  mockRedis.expire.mockResolvedValue(1)
  mockRedis.exists.mockResolvedValue(0)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("OTP Service", () => {
  it("sendOtp writes OTP to Redis with TTL 300, resets attempt counter, calls sendOtpAlimTalk", async () => {
    const { sendOtp } = await import("../services/otpService.js")
    await sendOtp("worker-1", "01012345678")

    expect(mockRedis.set).toHaveBeenCalledWith(
      "otp:worker-1",
      expect.stringMatching(/^\d{6}$/),
      "EX",
      300
    )
    expect(mockRedis.del).toHaveBeenCalledWith("otp:attempts:worker-1")
    expect(kakaoModule.sendOtpAlimTalk).toHaveBeenCalledWith(
      "01012345678",
      expect.stringMatching(/^\d{6}$/)
    )
  })

  it("verifyOtp correct code uses atomic GETDEL, cleans up attempt counter, returns 'ok'", async () => {
    const { verifyOtp } = await import("../services/otpService.js")

    mockRedis.incr.mockResolvedValue(1)
    mockRedis.getdel.mockResolvedValue("123456") // atomic read-and-delete

    const result = await verifyOtp("worker-1", "123456")

    expect(result).toBe("ok")
    // Must use GETDEL (not separate GET + DEL) to prevent concurrent-submission race
    expect(mockRedis.getdel).toHaveBeenCalledWith("otp:worker-1")
    expect(mockRedis.get).not.toHaveBeenCalled() // GET must not be used here
    expect(mockRedis.del).toHaveBeenCalledWith("otp:attempts:worker-1")
  })

  it("verifyOtp wrong code returns 'wrong', increments attempt counter via INCR", async () => {
    const { verifyOtp } = await import("../services/otpService.js")

    mockRedis.incr.mockResolvedValue(1)
    mockRedis.getdel.mockResolvedValue("999999") // stored differs from submitted

    const result = await verifyOtp("worker-1", "123456")

    expect(result).toBe("wrong")
    expect(mockRedis.incr).toHaveBeenCalledWith("otp:attempts:worker-1")
  })

  it("verifyOtp after >3 failed attempts returns 'locked', extends TTL, skips GETDEL", async () => {
    const { verifyOtp } = await import("../services/otpService.js")

    mockRedis.incr.mockResolvedValue(4) // exceeds MAX_ATTEMPTS = 3

    const result = await verifyOtp("worker-1", "123456")

    expect(result).toBe("locked")
    expect(mockRedis.expire).toHaveBeenCalledWith("otp:attempts:worker-1", 300)
    // Short-circuit before reaching GETDEL — do not waste a round-trip
    expect(mockRedis.getdel).not.toHaveBeenCalled()
  })

  it("verifyOtp returns 'expired' when GETDEL returns null (OTP not in Redis)", async () => {
    const { verifyOtp } = await import("../services/otpService.js")

    mockRedis.incr.mockResolvedValue(1)
    mockRedis.getdel.mockResolvedValue(null) // OTP expired or never sent

    const result = await verifyOtp("worker-1", "123456")

    expect(result).toBe("expired")
  })

  it("verifyOtp throws when Redis is unavailable — must not silently bypass verification", async () => {
    redisModule.getRedisClient.mockReturnValue(null) // simulate Redis down

    const { verifyOtp } = await import("../services/otpService.js")

    await expect(verifyOtp("worker-1", "123456")).rejects.toThrow(/Redis/i)
  })

  it("generateOtp always returns a valid 6-digit string", async () => {
    const { generateOtp } = await import("../services/otpService.js")

    for (let i = 0; i < 30; i++) {
      const otp = generateOtp()
      expect(otp).toMatch(/^\d{6}$/)
      expect(Number(otp)).toBeGreaterThanOrEqual(100_000)
      expect(Number(otp)).toBeLessThan(1_000_000)
    }
  })
})
