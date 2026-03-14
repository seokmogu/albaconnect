import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  initKakaoAlimTalk,
  sendAlimTalk,
  jobAvailableAlimTalk,
} from '../services/kakaoAlimTalk.js'

describe('kakaoAlimTalk', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('configured -> fetch called with correct URL and Authorization header', async () => {
    vi.stubEnv('KAKAO_BIZ_API_KEY', 'biz-key')
    vi.stubEnv('KAKAO_SENDER_KEY', 'sender-key')
    vi.stubEnv('VITEST', '')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    initKakaoAlimTalk()

    await sendAlimTalk('01012345678', 'JOB_AVAILABLE', { jobTitle: '카페', hourlyRate: '10000' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://alimtalk-api.kakao.com/v2/sender/send',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'KakaoAK biz-key' }),
      }),
    )
  })

  it('not configured -> fetch NOT called, console.log called', async () => {
    vi.resetModules()
    vi.stubEnv('KAKAO_BIZ_API_KEY', '')
    vi.stubEnv('KAKAO_SENDER_KEY', '')
    vi.stubEnv('VITEST', '')
    const fetchMock = vi.fn()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetchMock)
    const mod = await import('../services/kakaoAlimTalk.js')
    mod.initKakaoAlimTalk()

    await mod.sendAlimTalk('01012345678', 'JOB_AVAILABLE', {})

    expect(fetchMock).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalled()
  })

  it('fetch non-ok -> throws', async () => {
    vi.stubEnv('KAKAO_BIZ_API_KEY', 'biz-key')
    vi.stubEnv('KAKAO_SENDER_KEY', 'sender-key')
    vi.stubEnv('VITEST', '')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ errorCode: 'E400', errorMessage: 'bad' }),
    }))
    initKakaoAlimTalk()

    await expect(sendAlimTalk('01012345678', 'JOB_AVAILABLE', {})).rejects.toThrow('E400')
  })

  it('jobAvailableAlimTalk uses JOB_AVAILABLE template', async () => {
    vi.stubEnv('KAKAO_BIZ_API_KEY', 'biz-key')
    vi.stubEnv('KAKAO_SENDER_KEY', 'sender-key')
    vi.stubEnv('VITEST', '')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    initKakaoAlimTalk()

    await jobAvailableAlimTalk({
      phone: '01012345678',
      jobTitle: '테스트',
      hourlyRate: 10000,
      address: '서울',
      expiresAt: new Date().toISOString(),
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.templateCode).toBe('JOB_AVAILABLE')
  })

  it('offer path fallback remains graceful when fetch rejects', async () => {
    vi.stubEnv('KAKAO_BIZ_API_KEY', 'biz-key')
    vi.stubEnv('KAKAO_SENDER_KEY', 'sender-key')
    vi.stubEnv('VITEST', '')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    initKakaoAlimTalk()

    await expect(jobAvailableAlimTalk({
      phone: '01012345678',
      jobTitle: '테스트',
      hourlyRate: 10000,
      address: '서울',
      expiresAt: new Date().toISOString(),
    })).rejects.toThrow('network')
  })
})
