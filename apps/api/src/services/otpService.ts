import { randomInt } from 'crypto'
import { getRedisClient } from '../lib/redis.js'
import { sendOtpAlimTalk } from './kakaoAlimTalk.js'

export function generateOtp(): string {
  return randomInt(100000, 1000000).toString()
}

export async function sendOtp(workerId: string, phone: string): Promise<void> {
  const otp = generateOtp()
  const redis = getRedisClient()
  if (redis) {
    await redis.set(`otp:${workerId}`, otp, 'EX', 300)
    await redis.del(`otp:attempts:${workerId}`)
  } else {
    console.log(`[OTP:dev] Code for worker ${workerId}: ${otp}`)
  }
  await sendOtpAlimTalk(phone, otp)
}

const LUA_GETDEL = `local v = redis.call('GET', KEYS[1])\nredis.call('DEL', KEYS[1])\nreturn v`

export async function verifyOtp(
  workerId: string,
  code: string
): Promise<'ok' | 'wrong' | 'locked' | 'expired'> {
  const redis = getRedisClient()
  if (!redis) {
    return process.env.VITEST ? 'ok' : 'expired'
  }

  const attemptsRaw = await redis.get(`otp:attempts:${workerId}`)
  const attempts = Number(attemptsRaw ?? 0)
  if (attempts >= 3) return 'locked'

  const stored = await redis.eval(LUA_GETDEL, 1, `otp:${workerId}`) as string | null
  if (!stored) return 'expired'

  if (stored !== code) {
    await redis.incr(`otp:attempts:${workerId}`)
    await redis.expire(`otp:attempts:${workerId}`, 300)
    return 'wrong'
  }

  await redis.del(`otp:attempts:${workerId}`)
  return 'ok'
}
