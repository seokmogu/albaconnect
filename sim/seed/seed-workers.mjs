#!/usr/bin/env node
/**
 * seed-workers.mjs — 강남구 구직자 시드 (haiku LLM 페르소나 + 이력서).
 *
 * Input:  ../data/employers.json, ../data/postings.json
 * Output: ../data/workers.json
 *
 * Args: --count N  (default: 1000)
 *
 * 전략:
 *  - 공고들의 카테고리 분포를 보고 그에 맞는 카테고리 분포로 워커 생성
 *  - 위치는 강남구 + 인접 (송파/서초/관악) 분포
 *  - 평점/신뢰도/활동성 분포는 albamon-ratios 참고
 *  - haiku는 페르소나(자기소개 1줄)만 생성 (이력서 본문이 아니라 의사결정용 요약)
 *  - 100명씩 batch, 10개 동시 호출
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const POSTINGS = resolve(__dirname, "../data/postings.json")
const OUTPUT = resolve(__dirname, "../data/workers.json")
const CLAUDE_BIN = `${process.env.HOME}/.local/bin/claude-oauth-run`
const MODEL = "claude-haiku-4-5"
const CONCURRENCY = 10
const BATCH_SIZE = 25  // haiku 한 호출당 N명 페르소나 생성 (배치 효율)

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const COUNT = Number(arg("--count", "1000"))

// ── Seeded RNG ───────────────────────────────────────────────────────────────
function rngFactory(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = rngFactory(20260516)
const pick = (arr) => arr[Math.floor(rng() * arr.length)]
const range = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))

// ── 강남구 + 인접 hub 좌표 ─────────────────────────────────────────────────
const HUBS = [
  { name: "강남역",    lat: 37.4979, lng: 127.0276, w: 0.16 },
  { name: "역삼",      lat: 37.5008, lng: 127.0365, w: 0.07 },
  { name: "선릉",      lat: 37.5045, lng: 127.0492, w: 0.06 },
  { name: "삼성",      lat: 37.5085, lng: 127.0631, w: 0.05 },
  { name: "신사",      lat: 37.5172, lng: 127.0203, w: 0.05 },
  { name: "압구정",    lat: 37.5273, lng: 127.0288, w: 0.04 },
  { name: "청담",      lat: 37.5191, lng: 127.0500, w: 0.04 },
  { name: "논현",      lat: 37.5119, lng: 127.0218, w: 0.06 },
  { name: "신논현",    lat: 37.5045, lng: 127.0252, w: 0.08 },
  { name: "양재",      lat: 37.4843, lng: 127.0341, w: 0.05 },
  { name: "대치",      lat: 37.4998, lng: 127.0581, w: 0.04 },
  { name: "도곡",      lat: 37.4910, lng: 127.0445, w: 0.04 },
  { name: "수서",      lat: 37.4870, lng: 127.1015, w: 0.03 },
  // 인접 (송파/서초/관악) — 구직자 일부는 다른 구 거주
  { name: "잠실",      lat: 37.5133, lng: 127.1000, w: 0.05 },
  { name: "교대",      lat: 37.4938, lng: 127.0142, w: 0.04 },
  { name: "사당",      lat: 37.4765, lng: 126.9817, w: 0.04 },
  { name: "방배",      lat: 37.4815, lng: 126.9974, w: 0.03 },
  { name: "서초",      lat: 37.4837, lng: 127.0324, w: 0.04 },
  { name: "선바위",    lat: 37.4675, lng: 127.0118, w: 0.03 },
]
const totalW = HUBS.reduce((s, h) => s + h.w, 0)
HUBS.forEach((h) => (h.w = h.w / totalW))
function weightedHub() {
  const r = rng()
  let cum = 0
  for (const h of HUBS) { cum += h.w; if (r <= cum) return h }
  return HUBS[HUBS.length - 1]
}

// ── 카테고리 분포: 공고 분포에서 유도 (없으면 사업장 기본) ──────────────────
function deriveCategoryDist() {
  try {
    const { postings } = JSON.parse(readFileSync(POSTINGS, "utf8"))
    const counts = {}
    for (const p of postings) {
      const c = p.draft?.category ?? "other"
      counts[c] = (counts[c] ?? 0) + 1
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    return Object.entries(counts).map(([category, n]) => ({ category, w: n / total }))
  } catch {
    return [
      { category: "cafe", w: 0.25 },
      { category: "restaurant", w: 0.35 },
      { category: "retail", w: 0.15 },
      { category: "event", w: 0.07 },
      { category: "cleaning", w: 0.06 },
      { category: "delivery", w: 0.05 },
      { category: "other", w: 0.07 },
    ]
  }
}
const CATEGORY_DIST = deriveCategoryDist()
function weightedCategory() {
  const r = rng()
  let cum = 0
  for (const c of CATEGORY_DIST) { cum += c.w; if (r <= cum) return c.category }
  return "other"
}

// ── 카테고리당 1-2개 categories (워커는 multi-category 가능) ──────────────────
function workerCategories(primary) {
  const cats = new Set([primary])
  if (rng() < 0.35) {
    const second = pick(CATEGORY_DIST.filter((c) => c.category !== primary)).category
    cats.add(second)
  }
  return [...cats]
}

// ── claude wrapper ───────────────────────────────────────────────────────────
function claude(prompt, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, ["-p", prompt, "--output-format", "text", "--model", MODEL], { stdio: ["ignore", "pipe", "pipe"] })
    let out = "", err = ""
    const t = setTimeout(() => { proc.kill("SIGTERM"); reject(new Error(`timeout ${timeoutMs}ms`)) }, timeoutMs)
    proc.stdout.on("data", (d) => (out += d.toString()))
    proc.stderr.on("data", (d) => (err += d.toString()))
    proc.on("close", (code) => {
      clearTimeout(t)
      if (code !== 0) reject(new Error(`claude exit ${code}: ${err.slice(0, 200)}`))
      else resolve(out.trim())
    })
  })
}

async function claudeJson(prompt) {
  const out = await claude(prompt)
  const cleaned = out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  try { return JSON.parse(cleaned) } catch (e) { throw new Error(`JSON parse: ${cleaned.slice(0, 100)}... (${e.message})`) }
}

// ── batch persona 생성 (한 LLM 호출에 N명) ───────────────────────────────────
async function generatePersonaBatch(seedItems) {
  const prompt = `당신은 한국 강남구 일대 알바 구직자 ${seedItems.length}명의 페르소나를 만듭니다. JSON array 한 개만 반환, 다른 텍스트 금지.

[각 워커 입력]
${seedItems.map((s, i) => `${i + 1}. id=${s.id} 카테고리=${s.primaryCategory} 거주=${s.hub} 평점타입=${s.ratingClass} 경력=${s.experienceYears}년`).join("\n")}

[출력 schema: 위와 같은 순서로 N개 객체]
[
  { "id": "w-001", "name": "본명 한국어 (2-3자, PII 회피 위해 가공)", "persona": "한 줄 자기소개: 거주지·경력·강점·시간 가능시간대 (60자 이내)" },
  ...
]`
  return await claudeJson(prompt)
}

// ── 병렬 dispatch ────────────────────────────────────────────────────────────
async function runPool(items, fn, concurrency) {
  const results = []
  let i = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++
      try { results[idx] = { ok: true, value: await fn(items[idx], idx) } }
      catch (e) { results[idx] = { ok: false, error: e.message } }
    }
  })
  await Promise.all(workers)
  return results
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`👤 워커 ${COUNT}명 시드 시작 — 모델 ${MODEL}, 동시 ${CONCURRENCY}, 배치 ${BATCH_SIZE}`)
  console.log(`카테고리 분포(공고 기반):`, CATEGORY_DIST.map((c) => `${c.category}=${(c.w * 100).toFixed(0)}%`).join(", "))

  // 1) 기본 속성 (위치, 평점, 신뢰도, 활동성) seed
  const seeds = []
  for (let i = 0; i < COUNT; i++) {
    const hub = weightedHub()
    const primary = weightedCategory()
    const ratingClass = pick(["new", "low", "mid", "high"])
    const experienceYears = ratingClass === "new" ? 0 : ratingClass === "low" ? range(0, 1) : ratingClass === "mid" ? range(1, 3) : range(3, 7)
    seeds.push({
      id: `w-${String(i + 1).padStart(4, "0")}`,
      hub: hub.name,
      hubLoc: { lat: hub.lat, lng: hub.lng },
      primaryCategory: primary,
      ratingClass,
      experienceYears,
    })
  }

  // 2) 배치별 persona 생성
  const batches = []
  for (let i = 0; i < seeds.length; i += BATCH_SIZE) batches.push(seeds.slice(i, i + BATCH_SIZE))
  console.log(`총 ${batches.length} 배치 (${BATCH_SIZE}명씩)`)

  const t0 = Date.now()
  let done = 0
  const personaResults = await runPool(batches, async (batch) => {
    const personas = await generatePersonaBatch(batch)
    done++
    process.stdout.write(`  ✓ batch ${done}/${batches.length} (${batch.length}명)\n`)
    return { batch, personas }
  }, CONCURRENCY)

  // 3) seed + persona 병합 → 워커 객체 완성
  const WORKERS = []
  for (const r of personaResults) {
    if (!r.ok) {
      console.warn(`  ⚠️ batch failed: ${r.error?.slice(0, 100)}`)
      continue
    }
    const { batch, personas } = r.value
    for (let i = 0; i < batch.length; i++) {
      const s = batch[i]
      const p = personas?.[i] ?? { name: `워커${s.id}`, persona: `${s.hub} 거주, ${s.primaryCategory} 경력 ${s.experienceYears}년` }
      // 위치 jitter
      const lat = s.hubLoc.lat + (rng() - 0.5) * 0.009
      const lng = s.hubLoc.lng + (rng() - 0.5) * 0.011
      // 평점/신뢰도/활동
      const avgRating = s.ratingClass === "new" ? 0 : s.ratingClass === "low" ? Number((3.0 + rng() * 0.8).toFixed(2)) : s.ratingClass === "mid" ? Number((3.8 + rng() * 0.6).toFixed(2)) : Number((4.4 + rng() * 0.6).toFixed(2))
      const ratingCount = s.ratingClass === "new" ? 0 : s.ratingClass === "low" ? range(1, 8) : s.ratingClass === "mid" ? range(8, 40) : range(40, 200)
      const completionRate = s.ratingClass === "new" ? 1.0 : 0.85 + rng() * 0.15
      const lastSeenAt = Date.now() - range(0, 7 * 24 * 60) * 60_000
      WORKERS.push({
        id: s.id,
        name: p.name ?? `워커${s.id}`,
        persona: p.persona ?? `${s.hub} 거주, ${s.primaryCategory} 경력 ${s.experienceYears}년`,
        location: { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) },
        hub: s.hub,
        categories: workerCategories(s.primaryCategory),
        avgRating,
        ratingCount,
        completionRate: Number(completionRate.toFixed(2)),
        verified: rng() < (s.ratingClass === "new" ? 0.3 : 0.85),
        lastSeenAt,
        available: rng() < 0.7,
        experienceYears: s.experienceYears,
        ratingClass: s.ratingClass,
      })
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  mkdirSync(dirname(OUTPUT), { recursive: true })
  writeFileSync(OUTPUT, JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, count: WORKERS.length, workers: WORKERS }, null, 2), "utf8")

  // 통계
  const byCat = WORKERS.reduce((acc, w) => { for (const c of w.categories) acc[c] = (acc[c] ?? 0) + 1; return acc }, {})
  const byHub = WORKERS.reduce((acc, w) => { acc[w.hub] = (acc[w.hub] ?? 0) + 1; return acc }, {})
  const byRating = WORKERS.reduce((acc, w) => { acc[w.ratingClass] = (acc[w.ratingClass] ?? 0) + 1; return acc }, {})

  console.log(`\n✓ ${WORKERS.length}명 생성 — ${elapsed}s`)
  console.log(`→ ${OUTPUT}\n`)
  console.log(`카테고리 (multi 가능): ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", ")}`)
  console.log(`평점 클래스: ${Object.entries(byRating).map(([k, v]) => `${k}=${v}`).join(", ")}`)
  console.log(`상위 허브: ${Object.entries(byHub).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(", ")}`)
}

main().catch((e) => { console.error("\n❌ Fatal:", e.message); process.exit(1) })
