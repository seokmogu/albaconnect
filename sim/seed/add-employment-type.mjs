#!/usr/bin/env node
/**
 * add-employment-type.mjs — 공고·워커에 고용형태(employmentType) 주입.
 *
 * LLM 호출 없음. 공고는 키워드+근무시간으로 추론, 워커는 시드 RNG로 선호형태 부여.
 *
 * 고용형태 4종:
 *   gig    긱 — 건 단위 초단기 (1회성, 몇 시간)
 *   daily  일일 — 하루 단위
 *   short  단기 — 며칠~4주
 *   long   장기 — 1개월+ 정기
 *
 * Run: node sim/seed/add-employment-type.mjs
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const POSTINGS = resolve(__dirname, "../data/postings.json")
const WORKERS = resolve(__dirname, "../data/workers.json")

function rngFactory(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = rngFactory(20260519)

// ── 공고 고용형태 추론 ────────────────────────────────────────────────────────
// 키워드 우선, 없으면 근무시간으로 추론.
function inferEmploymentType(posting) {
  const d = posting.draft
  const text = `${d.title ?? ""} ${d.description ?? ""} ${(d.tags ?? []).join(" ")}`
  const dur = d.durationHours ?? 4

  // 키워드 기반 (명확할 때만, 우선순위: long > short > daily > gig)
  if (/정규|정직원|장기|고정|상시|주\s?[2-7]회|월급|오래/.test(text)) return "long"
  if (/2주|3주|한\s?달|성수기|시즌|단기\s?알바/.test(text)) return "short"
  if (/하루|일일|당일\s?하루/.test(text)) return "daily"
  if (/단발|초단기|건당|행사\s?보조|이벤트\s?보조/.test(text)) return "gig"

  // 키워드 불명확 시: 근무시간 + 시드 RNG로 4종 현실 분포 부여
  // (LLM 공고가 대부분 "급구" 톤이라 키워드만으로는 long/short가 과소)
  const r = rng()
  if (dur <= 4) {
    // 짧은 근무: gig 우세하되 daily/long(정기 파트)도 일부
    return r < 0.5 ? "gig" : r < 0.72 ? "daily" : r < 0.88 ? "short" : "long"
  }
  if (dur <= 8) {
    // 중간 근무: daily/short 우세
    return r < 0.18 ? "gig" : r < 0.5 ? "daily" : r < 0.78 ? "short" : "long"
  }
  // 긴 근무: short/long 우세
  return r < 0.1 ? "daily" : r < 0.5 ? "short" : "long"
}

// ── 워커 선호 고용형태 ────────────────────────────────────────────────────────
// 워커는 1~3개 선호 형태를 가진다. 평점 클래스에 따라 경향 차등.
const ALL_TYPES = ["gig", "daily", "short", "long"]
function workerPreferredTypes(worker) {
  const set = new Set()
  // 평점 높은(경력 많은) 워커는 long/short 선호 경향, 신규/저평점은 gig/daily 경향
  const cls = worker.ratingClass ?? "mid"
  const bias =
    cls === "high" ? ["long", "short", "short", "daily"] :
    cls === "mid" ? ["short", "daily", "gig", "long"] :
    ["gig", "daily", "gig", "short"]
  const count = 1 + Math.floor(rng() * 3) // 1~3개
  while (set.size < count) {
    set.add(rng() < 0.6 ? bias[Math.floor(rng() * bias.length)] : ALL_TYPES[Math.floor(rng() * 4)])
  }
  return [...set]
}

function main() {
  // 공고
  const pData = JSON.parse(readFileSync(POSTINGS, "utf8"))
  const pCount = {}
  for (const p of pData.postings) {
    p.employmentType = inferEmploymentType(p)
    pCount[p.employmentType] = (pCount[p.employmentType] ?? 0) + 1
  }
  pData.employmentTypeAddedAt = new Date().toISOString()
  writeFileSync(POSTINGS, JSON.stringify(pData, null, 2), "utf8")

  // 워커
  const wData = JSON.parse(readFileSync(WORKERS, "utf8"))
  const wCount = {}
  for (const w of wData.workers) {
    w.preferredEmploymentTypes = workerPreferredTypes(w)
    for (const t of w.preferredEmploymentTypes) wCount[t] = (wCount[t] ?? 0) + 1
  }
  wData.employmentTypeAddedAt = new Date().toISOString()
  writeFileSync(WORKERS, JSON.stringify(wData, null, 2), "utf8")

  const LABEL = { gig: "긱", daily: "일일", short: "단기", long: "장기" }
  console.log(`✓ 공고 ${pData.postings.length}건 employmentType 주입`)
  for (const t of ALL_TYPES) console.log(`  ${LABEL[t]}(${t}): ${pCount[t] ?? 0}건 (${Math.round((pCount[t] ?? 0) / pData.postings.length * 100)}%)`)
  console.log(`\n✓ 워커 ${wData.workers.length}명 preferredEmploymentTypes 주입`)
  for (const t of ALL_TYPES) console.log(`  ${LABEL[t]}(${t}) 선호: ${wCount[t] ?? 0}명`)
}

main()
