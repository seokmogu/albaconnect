#!/usr/bin/env node
/**
 * seed-service-requests.mjs — 개인 용역 의뢰 120건 시드.
 *
 * Output: ../data/service-requests.json
 *
 * No LLM call. Pure deterministic generation with seeded RNG.
 * 강남구 허브 좌표 분포 재사용 (seed-employers.mjs의 GANGNAM_HUBS 동일 소스).
 *
 * Run: `node sim/seed/seed-service-requests.mjs`
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, "../data/service-requests.json")

// ── Seeded RNG (mulberry32) — seed-employers.mjs와 동일 패턴 ─────────────────
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
const jitter = (val, deltaDeg) => val + (rng() - 0.5) * 2 * deltaDeg

// ── 강남구 허브 좌표 (seed-employers.mjs GANGNAM_HUBS 동일) ───────────────────
const GANGNAM_HUBS = [
  { name: "강남역",     lat: 37.4979, lng: 127.0276, density: 0.18 },
  { name: "역삼역",     lat: 37.5008, lng: 127.0365, density: 0.06 },
  { name: "선릉역",     lat: 37.5045, lng: 127.0492, density: 0.06 },
  { name: "삼성역",     lat: 37.5085, lng: 127.0631, density: 0.06 },
  { name: "신사역",     lat: 37.5172, lng: 127.0203, density: 0.05 },
  { name: "압구정역",   lat: 37.5273, lng: 127.0288, density: 0.04 },
  { name: "청담역",     lat: 37.5191, lng: 127.0500, density: 0.04 },
  { name: "학동역",     lat: 37.5141, lng: 127.0327, density: 0.04 },
  { name: "논현역",     lat: 37.5119, lng: 127.0218, density: 0.05 },
  { name: "신논현역",   lat: 37.5045, lng: 127.0252, density: 0.10 },
  { name: "양재역",     lat: 37.4843, lng: 127.0341, density: 0.04 },
  { name: "대치역",     lat: 37.4998, lng: 127.0581, density: 0.04 },
  { name: "도곡역",     lat: 37.4910, lng: 127.0445, density: 0.03 },
  { name: "한티역",     lat: 37.4960, lng: 127.0531, density: 0.03 },
  { name: "개포동역",   lat: 37.4801, lng: 127.0666, density: 0.02 },
  { name: "수서역",     lat: 37.4870, lng: 127.1015, density: 0.02 },
  { name: "압구정로데오", lat: 37.5273, lng: 127.0408, density: 0.04 },
  { name: "구룡역",     lat: 37.4870, lng: 127.0598, density: 0.02 },
  { name: "일원역",     lat: 37.4854, lng: 127.0857, density: 0.02 },
  { name: "대모산입구", lat: 37.4815, lng: 127.0721, density: 0.02 },
  { name: "선정릉",     lat: 37.5104, lng: 127.0440, density: 0.02 },
  { name: "강남구청",   lat: 37.5172, lng: 127.0410, density: 0.02 },
]
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

// ── 카테고리 정의 ─────────────────────────────────────────────────────────────
// 7개 카테고리, 균등 분포 (120건 / 7 ≈ 17.1건씩)
const CATEGORIES = [
  "errand",
  "homecleaning",
  "assembly",
  "moving",
  "pet",
  "queue",
  "walkdelivery",
]

// ── 카테고리별 제목 풀 + 기준 보수 ───────────────────────────────────────────
const CATEGORY_CONFIG = {
  errand: {
    baseFee: 8_000,
    estimatedHours: 0.5,
    titles: [
      "편의점 다녀와 주세요",
      "약국 심부름 부탁드려요",
      "서류 수령 대신 해주세요",
    ],
    descriptions: [
      "근처 편의점에서 지정 상품 구매 후 전달해 주세요.",
      "처방전 지참 후 약국 방문, 약 수령 부탁드립니다.",
      "지정 장소에서 서류 수령 후 전달해 주세요.",
    ],
  },
  homecleaning: {
    baseFee: 30_000,
    estimatedHours: 2,
    titles: [
      "원룸 청소 2시간",
      "이사 후 입주 청소 부탁해요",
      "주방·화장실 집중 청소",
    ],
    descriptions: [
      "원룸 전체 청소, 청소도구 지참 불필요(비치돼 있음).",
      "이사 후 새로 입주 전 전체 청소입니다.",
      "주방과 화장실 집중 청소, 2시간 예상.",
    ],
  },
  assembly: {
    baseFee: 25_000,
    estimatedHours: 1.5,
    titles: [
      "책장 조립 도와주세요",
      "침대 프레임 조립 부탁",
      "책상·의자 조립 2세트",
    ],
    descriptions: [
      "5단 책장 조립, 설명서 있음. 드라이버 지참 부탁드려요.",
      "퀸 사이즈 침대 프레임 조립, 약 1.5시간 예상.",
      "일반 사무용 책상+의자 2세트 조립.",
    ],
  },
  moving: {
    baseFee: 20_000,
    estimatedHours: 1,
    titles: [
      "이삿짐 거들기 1시간",
      "원룸 짐 나르기 도움",
      "짐 차에서 집까지 옮겨주세요",
    ],
    descriptions: [
      "원룸 이사, 엘리베이터 있음. 무거운 짐 위주 1시간.",
      "원룸 짐 3층 → 1층 이동 후 용달 싣기 보조.",
      "차에서 4층(엘리베이터 없음)까지 짐 옮기기.",
    ],
  },
  pet: {
    baseFee: 15_000,
    estimatedHours: 0.5,
    titles: [
      "강아지 산책 30분",
      "고양이 밥·화장실 관리",
      "반려견 목욕 후 드라이",
    ],
    descriptions: [
      "중형견 1마리 산책 30분, 리드줄·배변봉투 제공.",
      "출장 중 하루 2회 방문, 밥 주기+화장실 청소.",
      "소형견 목욕 및 드라이, 샴푸 비치돼 있어요.",
    ],
  },
  queue: {
    baseFee: 30_000,
    estimatedHours: 2,
    titles: [
      "한정판 스니커즈 줄서기 2시간",
      "팝업 입장 대기 부탁드려요",
      "음식점 오픈런 줄서기",
    ],
    descriptions: [
      "강남 스토어 한정판 릴리즈 당일 오픈 2시간 전부터 대기.",
      "팝업 스토어 입장권 선착순 배포 대기.",
      "유명 맛집 오픈 전 대기, 연락 후 교대 가능.",
    ],
  },
  walkdelivery: {
    baseFee: 12_000,
    estimatedHours: 0.5,
    titles: [
      "서류 지하철로 전달해 주세요",
      "소포 도보 배달 부탁드려요",
      "같은 건물 내 물건 전달",
    ],
    descriptions: [
      "강남역 → 역삼역 서류 봉투 1개 지하철 이동 전달.",
      "근거리 소포(2kg 이하) 도보·대중교통 배달.",
      "같은 빌딩 다른 층 물품 전달, 10분 내외.",
    ],
  },
}

// ── 개인 의뢰자 이름 풀 ────────────────────────────────────────────────────────
const REQUESTER_NAMES = [
  "김민준", "이서연", "박지호", "최수아", "정도현",
  "강예린", "윤재원", "임나영", "한승현", "오지우",
  "신하은", "류준혁", "문서윤", "배태양", "노아름",
  "고민재", "전다희", "황성민", "안유진", "남도영",
]

// ── 120건 생성 ────────────────────────────────────────────────────────────────
const TOTAL = 120
const REQUESTS = []

for (let i = 0; i < TOTAL; i++) {
  const category = CATEGORIES[i % CATEGORIES.length]
  const cfg = CATEGORY_CONFIG[category]
  const hub = weightedHub()
  const lat = jitter(hub.lat, 0.0045)
  const lng = jitter(hub.lng, 0.0055)

  // 제목과 설명을 같은 인덱스로 선택
  const titleIdx = Math.floor(rng() * cfg.titles.length)
  const title = cfg.titles[titleIdx]
  const description = cfg.descriptions[titleIdx]

  // 보수 ±20% jitter
  const feeJitter = 0.8 + rng() * 0.4  // 0.8 ~ 1.2
  const fee = Math.round(cfg.baseFee * feeJitter / 1000) * 1000  // 천원 단위 반올림

  REQUESTS.push({
    id: `svc-${String(i + 1).padStart(3, "0")}`,
    requesterName: pick(REQUESTER_NAMES),
    requesterType: "individual",
    contractType: "service",
    serviceCategory: category,
    title,
    description,
    location: { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) },
    hubName: hub.name,
    fee,
    estimatedHours: cfg.estimatedHours,
    legalGrade: "A",  // 비전문·도보 용역 전부 A (Job_Category_Legal_Matrix §4.1)
    createdAt: "2026-05-18T00:00:00+09:00",
  })
}

// ── 카테고리 분포 출력 ─────────────────────────────────────────────────────────
const catCount = REQUESTS.reduce((acc, r) => {
  acc[r.serviceCategory] = (acc[r.serviceCategory] ?? 0) + 1
  return acc
}, {})

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), count: REQUESTS.length, requests: REQUESTS }, null, 2),
  "utf8"
)

console.log(`✓ ${REQUESTS.length}건 용역 의뢰 시드 → ${OUT}`)
console.log("\n카테고리 분포:")
Object.entries(catCount).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
  console.log(`  ${k.padEnd(14)} ${String(v).padStart(3)}건 (${(v * 100 / REQUESTS.length).toFixed(0)}%)`)
)
console.log("")
