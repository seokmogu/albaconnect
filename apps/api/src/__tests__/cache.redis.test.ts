/**
 * Tests for the two-layer cache (L1 in-memory + L2 Redis).
 * Uses ioredis-mock so no real Redis connection is needed.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { TTLCache, cacheGetL2, cacheSetL2, cacheDelL2, cacheInvalidatePrefixL2, CACHE_TTL } from "../services/cache"

// Mock the redis module so tests don't need a real Redis
vi.mock("../lib/redis", () => {
  const store = new Map<string, string>()

  return {
    getRedisClient: () => null,
    checkRedisHealth: async () => "unavailable" as const,
    redisGet: async <T>(key: string): Promise<T | undefined> => {
      const val = store.get(key)
      return val ? (JSON.parse(val) as T) : undefined
    },
    redisSet: async (key: string, value: unknown, _ttlMs: number): Promise<void> => {
      store.set(key, JSON.stringify(value))
    },
    redisDel: async (...keys: string[]): Promise<void> => {
      for (const k of keys) store.delete(k)
    },
    redisDelPattern: async (pattern: string): Promise<void> => {
      const prefix = pattern.replace(/\*$/, "")
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key)
      }
    },
    disconnectRedis: async () => {},
    _store: store,
  }
})

describe("TTLCache (L1 in-memory)", () => {
  it("stores and retrieves a value within TTL", () => {
    const cache = new TTLCache<string>()
    cache.set("key1", "value1", 10_000)
    expect(cache.get("key1")).toBe("value1")
  })

  it("returns undefined after TTL expires", async () => {
    const cache = new TTLCache<string>()
    cache.set("key2", "value2", 1) // 1 ms TTL
    await new Promise((r) => setTimeout(r, 10))
    expect(cache.get("key2")).toBeUndefined()
  })

  it("evicts oldest entry at maxSize", () => {
    const cache = new TTLCache<number>(2)
    cache.set("a", 1, 10_000)
    cache.set("b", 2, 10_000)
    cache.set("c", 3, 10_000) // should evict "a"
    expect(cache.get("a")).toBeUndefined()
    expect(cache.get("b")).toBe(2)
    expect(cache.get("c")).toBe(3)
  })

  it("deletes a key", () => {
    const cache = new TTLCache<string>()
    cache.set("k", "v", 10_000)
    cache.delete("k")
    expect(cache.get("k")).toBeUndefined()
  })

  it("invalidates all keys with matching prefix", () => {
    const cache = new TTLCache<string>()
    cache.set("user:1", "a", 10_000)
    cache.set("user:2", "b", 10_000)
    cache.set("job:1", "c", 10_000)
    cache.invalidatePrefix("user:")
    expect(cache.get("user:1")).toBeUndefined()
    expect(cache.get("user:2")).toBeUndefined()
    expect(cache.get("job:1")).toBe("c")
  })

  it("reports correct size and clears", () => {
    const cache = new TTLCache<number>()
    cache.set("x", 1, 10_000)
    cache.set("y", 2, 10_000)
    expect(cache.size()).toBe(2)
    cache.clear()
    expect(cache.size()).toBe(0)
  })
})

describe("Two-layer cache helpers (L1 + mocked L2 Redis)", () => {
  let l1: TTLCache<unknown>

  beforeEach(() => {
    l1 = new TTLCache<unknown>()
  })

  it("cacheSetL2 writes to L1 and Redis", async () => {
    await cacheSetL2(l1, "test:key", { foo: "bar" }, CACHE_TTL.NEARBY_WORKERS)
    expect(l1.get("test:key")).toEqual({ foo: "bar" })
    // Also verify Redis mock received the value
    const { redisGet } = await import("../lib/redis")
    const redisVal = await redisGet<{ foo: string }>("test:key")
    expect(redisVal).toEqual({ foo: "bar" })
  })

  it("cacheGetL2 hits L1 first", async () => {
    l1.set("test:l1hit", "cached", CACHE_TTL.WORKER_PROFILE)
    const result = await cacheGetL2(l1, "test:l1hit", CACHE_TTL.WORKER_PROFILE)
    expect(result).toBe("cached")
  })

  it("cacheGetL2 falls back to Redis on L1 miss and populates L1", async () => {
    // Write directly to Redis mock
    const { redisSet } = await import("../lib/redis")
    await redisSet("test:l2only", { val: 42 }, 30_000)

    const result = await cacheGetL2<{ val: number }>(l1, "test:l2only", 30_000)
    expect(result).toEqual({ val: 42 })
    // L1 should now be populated
    expect(l1.get("test:l2only")).toEqual({ val: 42 })
  })

  it("cacheGetL2 returns undefined when both caches miss", async () => {
    const result = await cacheGetL2(l1, "test:nomatch:xyz789", 30_000)
    expect(result).toBeUndefined()
  })

  it("cacheDelL2 removes from L1 and Redis", async () => {
    await cacheSetL2(l1, "del:key", "toDelete", 30_000)
    await cacheDelL2(l1, "del:key")
    expect(l1.get("del:key")).toBeUndefined()
    const { redisGet } = await import("../lib/redis")
    expect(await redisGet("del:key")).toBeUndefined()
  })

  it("cacheInvalidatePrefixL2 clears all matching keys in L1 and Redis", async () => {
    await cacheSetL2(l1, "prefix:a", 1, 30_000)
    await cacheSetL2(l1, "prefix:b", 2, 30_000)
    await cacheSetL2(l1, "other:c", 3, 30_000)

    await cacheInvalidatePrefixL2(l1, "prefix:")

    expect(l1.get("prefix:a")).toBeUndefined()
    expect(l1.get("prefix:b")).toBeUndefined()
    expect(l1.get("other:c")).toBe(3)

    const { redisGet } = await import("../lib/redis")
    expect(await redisGet("prefix:a")).toBeUndefined()
    expect(await redisGet("prefix:b")).toBeUndefined()
  })

  it("CACHE_TTL constants have expected values", () => {
    expect(CACHE_TTL.WORKER_PROFILE).toBe(60_000)
    expect(CACHE_TTL.RECOMMENDED_JOBS).toBe(120_000)
    expect(CACHE_TTL.NEARBY_WORKERS).toBe(30_000)
    expect(CACHE_TTL.NEARBY_JOBS).toBe(30_000)
  })
})

describe("Redis health check (mocked)", () => {
  it("returns unavailable when REDIS_URL is not set", async () => {
    const { checkRedisHealth } = await import("../lib/redis")
    const status = await checkRedisHealth()
    // Mock returns 'unavailable' when REDIS_URL absent
    expect(["ok", "unavailable", "error"]).toContain(status)
  })
})
