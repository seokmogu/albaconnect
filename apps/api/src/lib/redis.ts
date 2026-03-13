/**
 * Redis client singleton with graceful degradation.
 * When REDIS_URL is not set, all operations are no-ops and the app
 * falls back to the in-memory TTLCache in services/cache.ts.
 */
import Redis from "ioredis"

let client: Redis | null = null
let connectionFailed = false

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL || process.env.VITEST) return null
  if (connectionFailed) return null
  if (client) return client

  client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    lazyConnect: true,
  })

  client.on("error", (err: Error) => {
    console.warn("[Redis] Connection error:", err.message)
    connectionFailed = true
    client = null
  })

  return client
}

export async function checkRedisHealth(): Promise<"ok" | "unavailable" | "error"> {
  if (!process.env.REDIS_URL) return "unavailable"
  const redis = getRedisClient()
  if (!redis) return "error"
  try {
    const result = await Promise.race<string>([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 1000)
      ),
    ])
    return result === "PONG" ? "ok" : "error"
  } catch {
    return "error"
  }
}

export async function redisGet<T>(key: string): Promise<T | undefined> {
  const redis = getRedisClient()
  if (!redis) return undefined
  try {
    const raw = await redis.get(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

export async function redisSet(
  key: string,
  value: unknown,
  ttlMs: number
): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  try {
    await redis.set(key, JSON.stringify(value), "PX", ttlMs)
  } catch {
    // Graceful failure — in-memory cache serves as fallback
  }
}

export async function redisDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const redis = getRedisClient()
  if (!redis) return
  try {
    await redis.del(...keys)
  } catch {
    // Ignore
  }
}

export async function redisDelPattern(pattern: string): Promise<void> {
  const redis = getRedisClient()
  if (!redis) return
  try {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) await redis.del(...keys)
  } catch {
    // Ignore
  }
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => {})
    client = null
  }
}
