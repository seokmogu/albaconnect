#!/usr/bin/env node
/**
 * run-dispatch.mjs — 매칭 디스패치 시뮬레이터.
 *
 * Input: ../data/employers.json, postings.json, workers.json
 * Output: ../data/dispatches.json, ../data/matches.json
 *
 * Args:
 *   --postings N     처음 N개 공고만 (default: all)
 *   --topN N         각 공고당 알림 보낼 top 워커 수 (default: 5)
 *   --decide N       LLM 결정 받을 top 워커 수 (default: 2) — 비용 절약
 *   --radius M       매칭 반경 m (default: 5000)
 *
 * 매칭 흐름:
 *   1. 공고 1개 선택
 *   2. 모든 워커 대상 6요소 스코어링 (서비스/scoring.ts 동일 로직)
 *   3. Top-N 워커 ranking
 *   4. Top-decide개에게 haiku 호출 (수락/거절 결정)
 *   5. 첫 수락자 → match 확정, dispatch 종료
 *   6. 결과 누적 JSON
 *
 * Run:
 *   node sim/runner/run-dispatch.mjs --postings 20 --decide 2
 *   node sim/runner/run-dispatch.mjs                            # all
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = resolve(__dirname, "../data")
const CLAUDE_BIN = `${process.env.HOME}/.local/bin/claude-oauth-run`
const MODEL = "claude-haiku-4-5"

const args = process.argv.slice(2)
function arg(name, def) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const POSTINGS_LIMIT = arg("--postings", null) ? Number(arg("--postings", "0")) : null
const TOP_N = Number(arg("--topN", "5"))
const DECIDE_N = Number(arg("--decide", "2"))
const RADIUS = Number(arg("--radius", "5000"))
const CONCURRENCY = 5

// ── claude wrapper ───────────────────────────────────────────────────────────
function claude(prompt, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, ["-p", prompt, "--output-format", "text", "--model", MODEL], { stdio: ["ignore", "pipe", "pipe"] })
    let out = "", err = ""
    const t = setTimeout(() => { proc.kill("SIGTERM"); reject(new Error(`timeout`)) }, timeoutMs)
    proc.stdout.on("data", (d) => (out += d.toString()))
    proc.stderr.on("data", (d) => (err += d.toString()))
    proc.on("close", (code) => { clearTimeout(t); code !== 0 ? reject(new Error(`exit ${code}: ${err.slice(0, 150)}`)) : resolve(out.trim()) })
  })
}

async function claudeJson(prompt) {
  const out = await claude(prompt)
  const c = out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  return JSON.parse(c)
}

// ── Distance + scoring (mirror of services/scoring.ts + sim/run.mjs v1) ──────
function distanceMeters(a, b) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ── 가용성 판정 (US-10 예약 스케줄 + US-11 라이브 위치) ──────────────────────
// spec/Technical_Spec.md §2.5. availability 없는 워커는 available 불리언으로 폴백.
function isAvailable(worker, jobLoc, jobStartAtIso) {
  const av = worker.availability
  const hasAvailability = av && ((av.schedule?.length ?? 0) > 0 || av.live?.enabled)
  if (!hasAvailability) return worker.available

  const start = jobStartAtIso ? new Date(jobStartAtIso) : null

  // US-10: 예약 스케줄 부합
  let scheduleHit = false
  if (start && av.schedule?.length) {
    const weekday = start.getDay() // 0=일 ~ 6=토
    const minOfDay = start.getHours() * 60 + start.getMinutes()
    scheduleHit = av.schedule.some(
      (r) =>
        r.days.includes(weekday) &&
        minOfDay >= r.startMin &&
        minOfDay < r.endMin &&
        distanceMeters(jobLoc, r.center) <= r.radiusMeters,
    )
  }

  // US-11: 라이브 위치 부합
  let liveHit = false
  if (av.live?.enabled && av.live.currentLocation) {
    liveHit = distanceMeters(jobLoc, av.live.currentLocation) <= av.live.radiusMeters
  }

  return scheduleHit || liveHit
}

// 고용형태 적합: 워커 선호에 공고 고용형태가 포함되는가.
// preferredEmploymentTypes 없는 워커는 하위호환(필터링 안 함).
function employmentFits(worker, jobEmploymentType) {
  const pref = worker.preferredEmploymentTypes
  if (!pref || pref.length === 0 || !jobEmploymentType) return true
  return pref.includes(jobEmploymentType)
}

function scoreMatch(jobLoc, jobCategory, worker, radius, jobStartAtIso, jobEmploymentType) {
  const dist = distanceMeters(jobLoc, worker.location)
  if (dist > radius) return null
  // 고용형태 불일치 워커는 후보에서 제외 (워커가 원하는 형태만 매칭).
  if (!employmentFits(worker, jobEmploymentType)) return null
  const distance = Math.max(0, 1 - dist / radius) * 32
  // 평점: ratingCount>0이면 (1~5 평점을 5~23점에 매핑), 신규 워커는 중간값 11.5.
  // 신규(평점 없음)를 평점 1점대 워커보다 유리하게 둬 cold-start 워커 진입을 보호.
  const rating = worker.ratingCount > 0 ? ((worker.avgRating - 1) / 4) * 18 + 5 : 11.5
  const category = worker.categories.includes(jobCategory) ? 18 : 0
  const trust = (worker.completionRate * 0.7 + (worker.verified ? 1 : 0) * 0.3) * 13
  const hoursSeen = (Date.now() - worker.lastSeenAt) / 3_600_000
  const activity = hoursSeen < 1 ? 6 : hoursSeen < 24 ? 4 : hoursSeen < 168 ? 2 : 0
  // 가용성: 스케줄·라이브(US-10/11) 통합 판정. 미가용 워커는 후보에서 제외.
  if (!isAvailable(worker, jobLoc, jobStartAtIso)) return null
  const availability = 8
  return { total: Math.round((distance + rating + category + trust + activity + availability) * 10) / 10, dist }
}

// ── Worker decision prompt ───────────────────────────────────────────────────
async function workerDecides(worker, posting, score) {
  const d = posting.draft
  const prompt = `당신은 한국 알바 워커. 페르소나 따라 수락/거절 결정. JSON 한 객체만.

[페르소나] ${worker.persona ?? `${worker.hub} 거주`}
[조건] 평점 ${worker.avgRating}/${worker.ratingCount}건, 신뢰도 ${(worker.completionRate * 100).toFixed(0)}%

[공고]
- 제목: ${d.title}
- 카테고리: ${d.category}
- 시급: ${(d.hourlyRate ?? 0).toLocaleString()}원
- 시간: ${d.durationHours ?? 0}h
- 거리: ${score.dist.toFixed(0)}m
- 매칭 점수: ${score.total}/100

{"decision":"accept|reject","reason":"한 줄","secondsToDecide":5-30}`
  try {
    return await claudeJson(prompt)
  } catch {
    // fallback: 점수 기반 결정 (LLM 실패 시)
    const accept = score.total > 80 && worker.available
    return { decision: accept ? "accept" : "reject", reason: "(LLM 실패, 점수 기반)", secondsToDecide: 15 }
  }
}

// ── Pool ─────────────────────────────────────────────────────────────────────
async function runPool(items, fn, concurrency) {
  const results = []
  let i = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++
      try { results[idx] = { ok: true, value: await fn(items[idx], idx) } }
      catch (e) { results[idx] = { ok: false, error: e.message } }
    }
  }))
  return results
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { postings } = JSON.parse(readFileSync(`${DATA}/postings.json`, "utf8"))
  const { workers } = JSON.parse(readFileSync(`${DATA}/workers.json`, "utf8"))
  const targets = POSTINGS_LIMIT ? postings.slice(0, POSTINGS_LIMIT) : postings

  console.log(`⚡ dispatch 시뮬 — 공고 ${targets.length}개 × 워커 ${workers.length}명`)
  console.log(`반경 ${RADIUS}m, top ${TOP_N} 알림 → top ${DECIDE_N} LLM 결정, 동시 ${CONCURRENCY}\n`)

  const t0 = Date.now()
  const results = await runPool(targets, async (posting) => {
    const job = {
      location: posting.employerLocation ?? posting.location,
      category: posting.draft.category,
      startAtIso: posting.draft.startAtIso ?? null,
      employmentType: posting.employmentType ?? null,
    }
    if (!job.location) return { posting: posting.id, error: "no location" }

    // 1) 스코어링
    const ranked = workers
      .map((w) => ({ worker: w, score: scoreMatch(job.location, job.category, w, RADIUS, job.startAtIso, job.employmentType) }))
      .filter((r) => r.score != null)
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, TOP_N)

    if (ranked.length === 0) {
      return { postingId: posting.id, employerName: posting.employerName, rankedCount: 0, acceptedBy: null, reason: "반경 내 워커 없음", rankedWorkerIds: [], scores: {} }
    }

    // 2) Top-DECIDE_N 워커에게 LLM 결정 요청 (sequential, 첫 수락 시 종료)
    const decisions = []
    let acceptedBy = null
    let acceptedReason = null
    let acceptedAt = null
    let acceptedSecs = null
    for (const r of ranked.slice(0, DECIDE_N)) {
      const d = await workerDecides(r.worker, posting, r.score)
      decisions.push({ workerId: r.worker.id, decision: d.decision, reason: d.reason, secondsToDecide: d.secondsToDecide, score: r.score.total })
      if (d.decision === "accept") {
        acceptedBy = r.worker.id
        acceptedReason = d.reason
        acceptedAt = new Date().toISOString()
        acceptedSecs = d.secondsToDecide
        break
      }
    }

    process.stdout.write(`  ${acceptedBy ? "✅" : "❌"} ${posting.id} (${posting.employerName}) → ${acceptedBy ?? "미매칭"} [top ${ranked.length}]\n`)

    return {
      postingId: posting.id,
      employerName: posting.employerName,
      employerLocation: posting.employerLocation,
      jobCategory: job.category,
      rankedWorkerIds: ranked.map((r) => r.worker.id),
      scores: Object.fromEntries(ranked.map((r) => [r.worker.id, r.score.total])),
      decisions,
      acceptedBy,
      acceptedReason,
      acceptedAt,
      acceptedSecondsToDecide: acceptedSecs,
      notifiedAt: new Date().toISOString(),
    }
  }, CONCURRENCY)

  const ok = results.filter((r) => r.ok).map((r) => r.value)
  const matched = ok.filter((d) => d.acceptedBy).length
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  mkdirSync(DATA, { recursive: true })
  writeFileSync(`${DATA}/dispatches.json`, JSON.stringify({
    generatedAt: new Date().toISOString(),
    model: MODEL,
    radius: RADIUS,
    topN: TOP_N,
    decideN: DECIDE_N,
    count: ok.length,
    matchedCount: matched,
    matchRate: ok.length > 0 ? matched / ok.length : 0,
    dispatches: ok,
  }, null, 2), "utf8")

  console.log(`\n✓ ${ok.length}건 dispatch, ${matched}건 매칭 (${Math.round((matched / ok.length) * 100)}%) — ${elapsed}s`)
  console.log(`평균 매칭 시간: ${(ok.filter((d) => d.acceptedSecondsToDecide).reduce((s, d) => s + d.acceptedSecondsToDecide, 0) / Math.max(matched, 1)).toFixed(1)}초`)
  console.log(`→ ${DATA}/dispatches.json`)
}

main().catch((e) => { console.error("\n❌ Fatal:", e.message); process.exit(1) })
