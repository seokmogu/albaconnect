/**
 * Simple in-memory TTL cache for hot read paths
 * Uses Map with expiry — no external dependency needed for MVP
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

class TTLCache<T = unknown> {
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

export const workerProfileCache = new TTLCache<unknown>(500)
export const recommendedJobsCache = new TTLCache<unknown>(500)

export const CACHE_TTL = {
  WORKER_PROFILE: 60_000,      // 1 minute
  RECOMMENDED_JOBS: 120_000,   // 2 minutes
}
