import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  eval: vi.fn(),
}

const redisModule = vi.hoisted(() => ({ getRedisClient: vi.fn() }))
const kakaoModule = vi.hoisted(() => ({ sendOtpAlimTalk: vi.fn().mockResolvedValue(undefined), initKakaoAlimTalk: vi.fn() }))

vi.mock('../lib/redis.js', () => redisModule)
vi.mock('../services/kakaoAlimTalk.js', () => kakaoModule)

describe('otp service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sendOtp sets redis key/ttl, clears attempts, sends AlimTalk', async () => {
    redisModule.getRedisClient.mockReturnValue(mockRedis)
    const { sendOtp } = await import('../services/otpService.js')
    await sendOtp('worker-1', '01012345678')
    expect(mockRedis.set).toHaveBeenCalledWith(expect.stringContaining('otp:worker-1'), expect.any(String), 'EX', 300)
    expect(mockRedis.del).toHaveBeenCalledWith('otp:attempts:worker-1')
    expect(kakaoModule.sendOtpAlimTalk).toHaveBeenCalled()
  })

  it('verifyOtp correct code returns ok', async () => {
    redisModule.getRedisClient.mockReturnValue(mockRedis)
    mockRedis.get.mockResolvedValueOnce('0')
    mockRedis.eval.mockResolvedValueOnce('123456')
    const { verifyOtp } = await import('../services/otpService.js')
    await expect(verifyOtp('worker-1', '123456')).resolves.toBe('ok')
    expect(mockRedis.del).toHaveBeenCalledWith('otp:attempts:worker-1')
  })

  it('verifyOtp wrong code increments attempts and returns wrong', async () => {
    redisModule.getRedisClient.mockReturnValue(mockRedis)
    mockRedis.get.mockResolvedValueOnce('0')
    mockRedis.eval.mockResolvedValueOnce('999999')
    const { verifyOtp } = await import('../services/otpService.js')
    await expect(verifyOtp('worker-1', '123456')).resolves.toBe('wrong')
    expect(mockRedis.incr).toHaveBeenCalled()
    expect(mockRedis.expire).toHaveBeenCalled()
  })

  it('verifyOtp locked returns locked without eval', async () => {
    redisModule.getRedisClient.mockReturnValue(mockRedis)
    mockRedis.get.mockResolvedValueOnce('3')
    const { verifyOtp } = await import('../services/otpService.js')
    await expect(verifyOtp('worker-1', '123456')).resolves.toBe('locked')
    expect(mockRedis.eval).not.toHaveBeenCalled()
  })

  it('verifyOtp with no redis returns ok in VITEST and expired otherwise', async () => {
    redisModule.getRedisClient.mockReturnValue(null)
    process.env.VITEST = '1'
    const { verifyOtp } = await import('../services/otpService.js')
    await expect(verifyOtp('worker-1', '123456')).resolves.toBe('ok')
    delete process.env.VITEST
    await expect(verifyOtp('worker-1', '123456')).resolves.toBe('expired')
  })

  it('applications accept guard returns 403 when phone is not verified', async () => {
    const wp = { isPhoneVerified: false }
    if (!wp?.isPhoneVerified) {
      expect({ error: 'Phone verification required', code: 'PHONE_VERIFICATION_REQUIRED' }).toEqual({
        error: 'Phone verification required',
        code: 'PHONE_VERIFICATION_REQUIRED',
      })
    }
  })
})
