#!/usr/bin/env node
/**
 * add-availability.mjs — 기존 workers.json에 가용성(US-10/US-11) 필드 주입.
 *
 * LLM 호출 없음. 시드 RNG로 결정론적 생성.
 * 분포: 35% 예약 스케줄 보유, 20% 라이브 ON, 나머지는 기존 available 불리언만.
 *
 * Run: node sim/seed/add-availability.mjs
 */

import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(__dirname, "../data/workers.json")

function rngFactory(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = rngFactory(20260518)
const pick = (arr) => arr[Math.floor(rng() * arr.length)]
const range = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))

const HUBS = [
  { name: "강남역", lat: 37.4979, lng: 127.0276 },
  { name: "삼성역", lat: 37.5085, lng: 127.0631 },
  { name: "역삼역", lat: 37.5008, lng: 127.0365 },
  { name: "신논현역", lat: 37.5045, lng: 127.0252 },
  { name: "선릉역", lat: 37.5045, lng: 127.0492 },
  { name: "부산역", lat: 35.1151, lng: 129.0413 },
]

// 흔한 시간대 (시작분, 종료분)
const TIME_SLOTS = [
  [720, 900],   // 12:00~15:00 점심
  [1080, 1320], // 18:00~22:00 저녁
  [540, 900],   // 09:00~15:00 오전
  [720, 1080],  // 12:00~18:00 낮
  [1020, 1380], // 17:00~23:00 저녁~밤
]

function makeScheduleRule(idx) {
  // 1~3개 요일
  const dayCount = range(1, 3)
  const days = []
  while (days.length < dayCount) {
    const d = range(0, 6)
    if (!days.includes(d)) days.push(d)
  }
  const [startMin, endMin] = pick(TIME_SLOTS)
  const hub = pick(HUBS)
  return {
    id: `r-${idx}`,
    days: days.sort(),
    startMin,
    endMin,
    hubName: hub.name,
    center: { lat: hub.lat, lng: hub.lng },
    radiusMeters: 3000,
  }
}

function main() {
  const data = JSON.parse(readFileSync(FILE, "utf8"))
  let scheduled = 0
  let live = 0

  for (const w of data.workers) {
    const r = rng()
    const schedule = []
    const liveEnabled = rng() < 0.2

    if (r < 0.35) {
      // 1~3개 스케줄 규칙
      const ruleCount = range(1, 3)
      for (let i = 0; i < ruleCount; i++) schedule.push(makeScheduleRule(i))
      scheduled++
    }
    if (liveEnabled) live++

    const liveHub = pick(HUBS)
    w.availability = {
      schedule,
      live: {
        enabled: liveEnabled,
        currentLocation: liveEnabled ? { lat: liveHub.lat, lng: liveHub.lng } : null,
        radiusMeters: 3000,
      },
    }
  }

  data.availabilityAddedAt = new Date().toISOString()
  writeFileSync(FILE, JSON.stringify(data, null, 2), "utf8")

  console.log(`✓ ${data.workers.length}명에 availability 주입`)
  console.log(`  예약 스케줄 보유: ${scheduled}명 (${Math.round(scheduled / data.workers.length * 100)}%)`)
  console.log(`  라이브 매칭 ON: ${live}명 (${Math.round(live / data.workers.length * 100)}%)`)
  console.log(`  나머지: available 불리언 폴백`)
}

main()
