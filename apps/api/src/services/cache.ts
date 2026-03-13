/**
 * Two-layer cache:
 *   L1 — in-memory TTLCache (always available, per-instance)
 *   L2 — Redis via ioredis (optional, shared across instances)
 *
 * Read path:  L1 → L2 → DB (callers handle DB)
 * Write path: L1 + L2 simultaneously
 * Invalidate: L1 + L2 simultaneously
 */
import { redisGet, redisSet, redisDel, redisDelPattern } from "../lib/redis"

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class TTLCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>()
  private maxSize: number

  constructor(maxSize = 1000) {
    this.maxSize = maxSize
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T, ttlMs: number): void {
    // Evict oldest entry when at capacity
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey) this.store.delete(oldestKey)
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key)
    }
  }

  clear(): void {
    this.store.clear()
  }

  size(): number {
    return this.store.size
  }
}

// ─── L1 in-memory singletons ────────────────────────────────────────────────

export const workerProfileCache = new TTLCache<unknown>(500)
export const recommendedJobsCache = new TTLCache<unknown>(500)
/** Caches findNearbyWorkers results keyed by jobId */
export const nearbyWorkersCache = new TTLCache<unknown>(200)

export const CACHE_TTL = {
  WORKER_PROFILE: 60_000,      // 60 s
  RECOMMENDED_JOBS: 120_000,   // 2 min
  NEARBY_WORKERS: 30_000,      // 30 s — geospatial results
  NEARBY_JOBS: 30_000,         // 30 s
}

// ─── Two-layer helpers ───────────────────────────────────────────────────────

/**
 * Get from L1 (in-memory) then L2 (Redis).
 * Populates L1 on L2 hit so subsequent reads are local.
 */
export async function cacheGetL2<T>(
  l1: TTLCache<T>,
  key: string,
  ttlMs: number
): Promise<T | undefined> {
  const hit = l1.get(key)
  if (hit !== undefined) return hit

  const redisHit = await redisGet<T>(key)
  if (redisHit !== undefined) {
    // Populate L1 with remaining TTL (approximate with full TTL; acceptable for short TTLs)
    l1.set(key, redisHit, ttlMs)
    return redisHit
  }
  return undefined
}

/**
 * Write to both L1 (in-memory) and L2 (Redis).
 */
export async function cacheSetL2<T>(
  l1: TTLCache<T>,
  key: string,
  value: T,
  ttlMs: number
): Promise<void> {
  l1.set(key, value, ttlMs)
  await redisSet(key, value, ttlMs)
}

/**
 * Invalidate key in both L1 and L2.
 */
export async function cacheDelL2(l1: TTLCache, key: string): Promise<void> {
  l1.delete(key)
  await redisDel(key)
}

/**
 * Invalidate all keys matching a prefix in both L1 and L2.
 */
export async function cacheInvalidatePrefixL2(
  l1: TTLCache,
  prefix: string
): Promise<void> {
  l1.invalidatePrefix(prefix)
  await redisDelPattern(`${prefix}*`)
}
