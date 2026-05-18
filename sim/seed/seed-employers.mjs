#!/usr/bin/env node
/**
 * seed-employers.mjs — 강남구 100개 사업장 시드.
 *
 * Output: ../data/employers.json
 *
 * No LLM call. Pure deterministic generation with seeded RNG so reruns are
 * stable. Coordinates use 강남구 대표 지하철역 중심 + 반경 500m jitter.
 *
 * Run: `node sim/seed/seed-employers.mjs`
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, "../data/employers.json")

// ── Seeded RNG (mulberry32) ──────────────────────────────────────────────────
function rngFactory(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = rngFactory(20260515)
const pick = (arr) => arr[Math.floor(rng() * arr.length)]
const range = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))
const jitter = (val, deltaDeg) => val + (rng() - 0.5) * 2 * deltaDeg

// ── 강남구 22개 지하철역/동 중심 좌표 ─────────────────────────────────────────
const GANGNAM_HUBS = [
  { name: "강남역",   dong: "역삼1동",   lat: 37.4979, lng: 127.0276, density: 0.18 },
  { name: "역삼역",   dong: "역삼1동",   lat: 37.5008, lng: 127.0365, density: 0.06 },
  { name: "선릉역",   dong: "역삼2동",   lat: 37.5045, lng: 127.0492, density: 0.06 },
  { name: "삼성역",   dong: "삼성1동",   lat: 37.5085, lng: 127.0631, density: 0.06 },
  { name: "신사역",   dong: "신사동",    lat: 37.5172, lng: 127.0203, density: 0.05 },
  { name: "압구정역", dong: "압구정동",  lat: 37.5273, lng: 127.0288, density: 0.04 },
  { name: "청담역",   dong: "청담동",    lat: 37.5191, lng: 127.0500, density: 0.04 },
  { name: "학동역",   dong: "논현2동",   lat: 37.5141, lng: 127.0327, density: 0.04 },
  { name: "논현역",   dong: "논현1동",   lat: 37.5119, lng: 127.0218, density: 0.05 },
  { name: "신논현역", dong: "역삼1동",   lat: 37.5045, lng: 127.0252, density: 0.10 },
  { name: "양재역",   dong: "도곡2동",   lat: 37.4843, lng: 127.0341, density: 0.04 },
  { name: "대치역",   dong: "대치1동",   lat: 37.4998, lng: 127.0581, density: 0.04 },
  { name: "도곡역",   dong: "도곡1동",   lat: 37.4910, lng: 127.0445, density: 0.03 },
  { name: "한티역",   dong: "대치2동",   lat: 37.4960, lng: 127.0531, density: 0.03 },
  { name: "개포동역", dong: "개포1동",   lat: 37.4801, lng: 127.0666, density: 0.02 },
  { name: "수서역",   dong: "수서동",    lat: 37.4870, lng: 127.1015, density: 0.02 },
  { name: "압구정로데오", dong: "청담동", lat: 37.5273, lng: 127.0408, density: 0.04 },
  { name: "구룡역",   dong: "개포4동",   lat: 37.4870, lng: 127.0598, density: 0.02 },
  { name: "일원역",   dong: "일원본동",  lat: 37.4854, lng: 127.0857, density: 0.02 },
  { name: "대모산입구", dong: "개포2동", lat: 37.4815, lng: 127.0721, density: 0.02 },
  { name: "선정릉",   dong: "삼성2동",   lat: 37.5104, lng: 127.0440, density: 0.02 },
  { name: "강남구청", dong: "신사동",    lat: 37.5172, lng: 127.0410, density: 0.02 },
]
// densities sum should be ~1.0 — normalize just in case
const totalDensity = GANGNAM_HUBS.reduce((s, h) => s + h.density, 0)
GANGNAM_HUBS.forEach((h) => (h.density = h.density / totalDensity))

function weightedHub() {
  const r = rng()
  let cum = 0
  for (const h of GANGNAM_HUBS) {
    cum += h.density
    if (r <= cum) return h
  }
  return GANGNAM_HUBS[GANGNAM_HUBS.length - 1]
}

// ── 카테고리 분포 (강남구 자영업 추정) ────────────────────────────────────────
const CATEGORY_DIST = [
  { category: "cafe",          weight: 0.28 },
  { category: "restaurant",    weight: 0.36 },
  { category: "retail",        weight: 0.16 },
  { category: "event",         weight: 0.06 },
  { category: "cleaning",      weight: 0.05 },
  { category: "delivery",      weight: 0.04 },
  { category: "manufacturing", weight: 0.02 },
  { category: "other",         weight: 0.03 },
]
function weightedCategory() {
  const r = rng()
  let cum = 0
  for (const c of CATEGORY_DIST) {
    cum += c.weight
    if (r <= cum) return c.category
  }
  return "other"
}

// ── 상호명 생성기 (카테고리별 단어 풀) ────────────────────────────────────────
const NAME_TEMPLATES = {
  cafe: {
    suffix: ["커피", "카페", "에스프레소바", "로스터스", "베이크앤커피", "브런치"],
    prefix: ["블루보틀", "리얼", "어반", "데일리", "에이트", "노블", "테라", "그란데", "포레", "모먼트"],
  },
  restaurant: {
    suffix: ["식당", "이자카야", "키친", "다이닝", "비스트로", "포차", "분식", "한식당", "스시바"],
    prefix: ["고깃집", "옛맛", "참숯", "장터", "오늘", "골목", "산", "도쿄", "오사카", "한가람"],
  },
  retail: {
    suffix: ["편의점", "마트", "스토어", "샵", "굿즈"],
    prefix: ["GS25", "CU", "세븐일레븐", "이마트24", "미니스톱"],
  },
  event: {
    suffix: ["이벤트", "프로모션", "런칭"],
    prefix: ["코엑스", "강남", "삼성", "역삼", "선릉"],
  },
  cleaning: {
    suffix: ["청소", "케어서비스", "클리닝"],
    prefix: ["깔끔", "스피드", "오피스", "원룸", "강남"],
  },
  delivery: {
    suffix: ["배달", "퀵", "라이더센터"],
    prefix: ["바로", "한방", "강남", "도곡", "역삼"],
  },
  manufacturing: {
    suffix: ["공방", "스튜디오", "팩토리"],
    prefix: ["메이커", "리프트", "헤리티지", "워크샵"],
  },
  other: {
    suffix: ["서비스", "센터", "샵"],
    prefix: ["올웨이즈", "에브리", "강남", "선릉", "도곡"],
  },
}
function generateName(category, hubName) {
  const t = NAME_TEMPLATES[category] ?? NAME_TEMPLATES.other
  const prefix = pick(t.prefix)
  const suffix = pick(t.suffix)
  // 30% chance: prefix+hub+suffix, 70%: prefix+suffix
  return rng() < 0.3 ? `${prefix} ${hubName} ${suffix}` : `${prefix} ${suffix}`
}

// ── 페르소나 (LLM 시뮬용) — 카테고리별 짧은 1-2줄 ────────────────────────────
const PERSONA_TEMPLATES = {
  cafe:          "강남 스페셜티 카페. 피크타임 음료 제조 + 손님 응대. 노쇼 시 매출 직격타.",
  restaurant:    "강남 식당/이자카야. 홀서빙 또는 주방보조. 회식 시즌 단체 예약 잦음.",
  retail:        "강남 편의점. 야간 카운터 + 정리 + 발주. 24시 교대.",
  event:         "강남 코엑스/팝업 이벤트 운영. 단기 부스 운영 인력 필요.",
  cleaning:      "강남 오피스/원룸 정기 청소. 시간당 일감.",
  delivery:      "강남 도심 배달/퀵. 자가 오토바이 또는 도보 배달.",
  manufacturing: "강남 소형 공방/제조. 제품 포장·검수 단기 알바.",
  other:         "강남 매장 임시 인력 — 카테고리 외 단기 일감.",
}

// ── 사업장 312개 생성 (강남구 실 사업주 18,740개 vs 시뮬 1만 워커 비율 유지) ──
const TOTAL = Number(process.argv.find((a, i) => process.argv[i - 1] === "--count") ?? 312)
const EMPLOYERS = []
for (let i = 0; i < TOTAL; i++) {
  const hub = weightedHub()
  const category = weightedCategory()
  // ±0.0045도 ≈ 500m jitter (위도 1도 ≈ 111km)
  const lat = jitter(hub.lat, 0.0045)
  const lng = jitter(hub.lng, 0.0055)
  const employer = {
    id: `emp-${String(i + 1).padStart(3, "0")}`,
    name: generateName(category, hub.name.replace("역", "").trim()),
    category,
    dong: hub.dong,
    nearestHub: hub.name,
    location: { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) },
    persona: PERSONA_TEMPLATES[category],
    avgRating: Number((3.8 + rng() * 1.1).toFixed(2)),  // 3.8 ~ 4.9
    reviewCount: range(0, 250),
    monthlyJobBudget: range(800_000, 6_000_000),  // 추정 월 알바 인건비
    createdAt: "2026-05-15T00:00:00+09:00",
  }
  EMPLOYERS.push(employer)
}

// ── 카테고리 분포 검증 출력 ───────────────────────────────────────────────────
const catCount = EMPLOYERS.reduce((acc, e) => {
  acc[e.category] = (acc[e.category] ?? 0) + 1
  return acc
}, {})
const hubCount = EMPLOYERS.reduce((acc, e) => {
  acc[e.nearestHub] = (acc[e.nearestHub] ?? 0) + 1
  return acc
}, {})

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: EMPLOYERS.length, employers: EMPLOYERS }, null, 2), "utf8")

console.log(`✓ ${EMPLOYERS.length}개 사업장 시드 → ${OUT}`)
console.log(`\n카테고리 분포:`)
Object.entries(catCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${String(v).padStart(3)} (${(v * 100 / EMPLOYERS.length).toFixed(0)}%)`))
console.log(`\n허브별 분포 (상위 10):`)
Object.entries(hubCount).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${String(v).padStart(3)}`))
console.log("")
