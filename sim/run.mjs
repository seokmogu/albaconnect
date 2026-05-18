#!/usr/bin/env node
/**
 * AlbaConnect stand-alone two-sided simulator.
 *
 * No API key — uses `claude -p` headless mode (OAuth profile).
 * No DB — runs entirely in memory, prints to console.
 *
 * Flow per round:
 *   1. Each employer persona generates a free-form Korean job posting via LLM
 *   2. ListingNormalizer (LLM) converts free text → structured job draft
 *   3. Dispatcher scores all workers against the job (6-factor algorithm)
 *   4. Top-3 workers receive a "should I accept?" prompt (LLM as worker persona)
 *   5. Results printed
 */

import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

// ── claude CLI wrapper ───────────────────────────────────────────────────────

// `claude` is a zsh alias; spawn needs the underlying script directly.
const CLAUDE_BIN = `${process.env.HOME}/.local/bin/claude-oauth-run`

function claude(prompt, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, ["-p", prompt, "--output-format", "text", "--model", "claude-sonnet-4-6"], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    const killer = setTimeout(() => {
      proc.kill("SIGTERM")
      reject(new Error(`claude timeout after ${timeoutMs}ms`))
    }, timeoutMs)
    proc.stdout.on("data", (d) => (stdout += d.toString()))
    proc.stderr.on("data", (d) => (stderr += d.toString()))
    proc.on("close", (code) => {
      clearTimeout(killer)
      if (code !== 0) reject(new Error(`claude exit ${code}: ${stderr}`))
      else resolve(stdout.trim())
    })
  })
}

async function claudeJson(prompt) {
  const out = await claude(prompt)
  // Strip code fences if model wrapped JSON in them
  const cleaned = out
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    throw new Error(`JSON parse failed:\n---raw---\n${out}\n---end---\n${e.message}`)
  }
}

// ── Distance (Haversine, meters) ─────────────────────────────────────────────

function distanceMeters(a, b) {
  const R = 6_371_000
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ── 6-factor matching score (mirror of services/scoring.ts) ──────────────────

function scoreMatch(job, worker, radiusMeters = 5_000) {
  const dist = distanceMeters(job.location, worker.location)
  if (dist > radiusMeters) return { total: 0, breakdown: { distance: 0, rating: 0, category: 0, trust: 0, activity: 0, availability: 0 }, dist }

  const distance = Math.max(0, 1 - dist / radiusMeters) * 32
  const rating =
    worker.ratingCount > 0
      ? ((worker.avgRating - 1) / 4) * 18 + 5
      : 11.5
  const category = worker.categories.includes(job.category) ? 18 : 0
  const trust = (worker.completionRate * 0.7 + (worker.verified ? 1 : 0) * 0.3) * 13
  const hoursSinceSeen = (Date.now() - worker.lastSeenAt) / 3_600_000
  const activity = hoursSinceSeen < 1 ? 6 : hoursSinceSeen < 24 ? 4 : hoursSinceSeen < 168 ? 2 : 0
  const availability = worker.available ? 8 : 0
  const total = distance + rating + category + trust + activity + availability
  return { total: Math.round(total * 10) / 10, breakdown: { distance, rating, category, trust, activity, availability }, dist }
}

// ── Seed data ────────────────────────────────────────────────────────────────

const EMPLOYERS = [
  {
    id: "emp-1",
    name: "김 사장님 (강남 카페)",
    persona: "강남역 5번 출구 앞 1평 스페셜티 카페 운영. 갑자기 알바가 노쇼했고 오늘 저녁 피크타임 음료 만들 사람 1명이 당장 필요. 시급은 시세보다 높게 줄 의향 있음.",
    location: { lat: 37.4979, lng: 127.0276 },
  },
  {
    id: "emp-2",
    name: "박 사장님 (역삼 이자카야)",
    persona: "역삼역 근처 이자카야. 이번 주말 단체 예약 50명 들어와서 홀 서빙 2명 단기 모집. 외국인 응대 가능자 우대. 1시간 후 시작.",
    location: { lat: 37.5008, lng: 127.0365 },
  },
  {
    id: "emp-3",
    name: "이 사장님 (신논현 편의점)",
    persona: "신논현역 근처 24시 편의점 점장. 야간 알바 한 명이 못 나온다고 연락 옴. 오늘 밤 10시부터 새벽 6시까지 8시간 야간 카운터 알바 1명 급구. 야간 수당 포함.",
    location: { lat: 37.5045, lng: 127.0252 },
  },
]

const WORKERS = [
  {
    id: "wk-1", name: "워커A (카페 경력 3년)",
    persona: "강남역 거주. 카페 바리스타 경력 3년. 평점 4.8. 오늘 저녁 약속 없음, 시급 13000원 이상이면 수락 의향.",
    location: { lat: 37.4985, lng: 127.0280 }, // ~70m from 강남
    categories: ["cafe", "restaurant"],
    avgRating: 4.8, ratingCount: 47, completionRate: 0.98, verified: true,
    lastSeenAt: Date.now() - 10 * 60_000, available: true,
  },
  {
    id: "wk-2", name: "워커B (편의점 야간 전문)",
    persona: "신논현 근처 자취. 편의점 야간 알바만 1년째. 평점 4.6. 야간 수당 챙겨주는 매장 선호. 카페는 안 함.",
    location: { lat: 37.5050, lng: 127.0260 }, // ~80m from 신논현
    categories: ["retail"],
    avgRating: 4.6, ratingCount: 32, completionRate: 0.95, verified: true,
    lastSeenAt: Date.now() - 30 * 60_000, available: true,
  },
  {
    id: "wk-3", name: "워커C (이자카야 홀 경력)",
    persona: "역삼동 거주. 이자카야/술집 홀서빙 2년. 일본어 가능. 평점 4.9. 주말 단기 알바 환영.",
    location: { lat: 37.5005, lng: 127.0360 }, // ~50m from 역삼
    categories: ["restaurant", "event"],
    avgRating: 4.9, ratingCount: 61, completionRate: 0.99, verified: true,
    lastSeenAt: Date.now() - 5 * 60_000, available: true,
  },
  {
    id: "wk-4", name: "워커D (신규 가입, 평점 없음)",
    persona: "최근 가입. 알바 경험 없음. 강남 거주. 단순 업무 위주 선호.",
    location: { lat: 37.4990, lng: 127.0290 }, // ~150m from 강남
    categories: ["cafe", "retail"],
    avgRating: 0, ratingCount: 0, completionRate: 1.0, verified: false,
    lastSeenAt: Date.now() - 60 * 60_000, available: true,
  },
  {
    id: "wk-5", name: "워커E (강남 카페, but 오늘 다른 일정)",
    persona: "강남 카페 경력 1년, 평점 4.5. 단 오늘 저녁은 이미 다른 알바 잡혀있음 — 거절할 가능성 높음.",
    location: { lat: 37.4982, lng: 127.0278 },
    categories: ["cafe"],
    avgRating: 4.5, ratingCount: 18, completionRate: 0.93, verified: true,
    lastSeenAt: Date.now() - 2 * 60_000, available: false,
  },
  {
    id: "wk-6", name: "워커F (잠실 거주, 거리 멀음)",
    persona: "잠실 거주, 카페 경력 2년 평점 4.7. 거리가 멀면 거절.",
    location: { lat: 37.5133, lng: 127.1000 }, // 강남에서 ~6km
    categories: ["cafe", "restaurant"],
    avgRating: 4.7, ratingCount: 25, completionRate: 0.96, verified: true,
    lastSeenAt: Date.now() - 15 * 60_000, available: true,
  },
]

// ── Phase 1: employer LLM writes free-form posting ───────────────────────────

async function employerWritesPost(employer) {
  const prompt = `당신은 한국 자영업 사장님입니다. 아래 페르소나로 알바 공고 한 줄을 자연어로 적으세요. 30초 안에 적는 것처럼 짧고 직설적으로. 마크다운/JSON 없이 한국어 자연어 한두 문장만.\n\n[페르소나]\n${employer.persona}\n\n공고 한 줄:`
  return await claude(prompt)
}

// ── Phase 2: LLM normalizes free text → structured draft ─────────────────────

async function normalizeListing(rawText, nowIso) {
  const prompt = `다음 한국어 알바 공고 자유 텍스트를 구조화 JSON으로 변환하세요. JSON 한 객체만 반환, 다른 텍스트 금지.

[입력] ${rawText}
[현재 시각 KST] ${nowIso}

[스키마]
{
  "title": "60자 이내 공고 제목",
  "category": "cafe | restaurant | retail | event | delivery | cleaning | other",
  "hourlyRate": 정수,
  "headcount": 정수,
  "durationHours": 정수,
  "address": "지역명",
  "description": "100자 이내, 욕설/전화번호 제거",
  "confidence": 0.0-1.0,
  "tags": ["키워드","최대 5개"]
}`
  return await claudeJson(prompt)
}

// ── Phase 3: worker LLM decides to accept ────────────────────────────────────

async function workerDecides(worker, draft, score) {
  const prompt = `당신은 한국 알바 워커입니다. 아래 페르소나로 매칭 알림을 받았습니다. 수락할지 거절할지 결정하세요.

[페르소나]
${worker.persona}

[매칭된 공고]
- 제목: ${draft.title}
- 카테고리: ${draft.category}
- 시급: ${draft.hourlyRate.toLocaleString()}원
- 시간: ${draft.durationHours}시간
- 거리: ${(score.dist).toFixed(0)}m
- 매칭 점수: ${score.total}/100

JSON 한 객체만 반환:
{
  "decision": "accept" | "reject",
  "reason": "한국어 한 문장",
  "secondsToDecide": 정수 (5-30)
}`
  return await claudeJson(prompt)
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

function logHeader(text) {
  const bar = "═".repeat(70)
  console.log(`\n${bar}\n${text}\n${bar}`)
}

function logSub(text) {
  console.log(`\n${"─".repeat(70)}\n${text}\n${"─".repeat(70)}`)
}

async function runSimulation() {
  const nowIso = new Date().toISOString()
  console.log("\n🟧 AlbaConnect Stand-Alone Two-Sided Simulator")
  console.log(`Now (KST): ${nowIso}`)
  console.log(`Employers: ${EMPLOYERS.length}, Workers: ${WORKERS.length}`)
  console.log(`Model: claude-sonnet-4-6 (via OAuth, no API key)`)

  const results = []

  for (const employer of EMPLOYERS) {
    logHeader(`📝 ${employer.name}`)

    // Phase 1
    console.log("\n[1/3] 사장님이 자연어로 공고 작성 중...")
    const rawPost = await employerWritesPost(employer)
    console.log(`  > "${rawPost.split("\n").join(" ")}"`)

    // Phase 2
    console.log("\n[2/3] ListingNormalizer (LLM) — 11필드 JSON 변환 중...")
    let draft
    try {
      draft = await normalizeListing(rawPost, nowIso)
    } catch (e) {
      console.log(`  ❌ normalize failed: ${e.message.split("\n")[0]}`)
      continue
    }
    console.log(`  ✓ ${draft.title}`)
    console.log(`    카테고리: ${draft.category} | 시급: ${draft.hourlyRate?.toLocaleString()}원 | 인원: ${draft.headcount}명 | ${draft.durationHours}시간`)
    console.log(`    주소: ${draft.address} | confidence: ${draft.confidence}`)
    console.log(`    tags: ${(draft.tags ?? []).join(", ")}`)

    // Phase 3 — dispatcher scores all workers
    const job = { category: draft.category, location: employer.location, hourlyRate: draft.hourlyRate }
    const ranked = WORKERS
      .map((w) => ({ worker: w, score: scoreMatch(job, w) }))
      .filter((r) => r.score.total > 0)
      .sort((a, b) => b.score.total - a.score.total)

    logSub(`[3/3] Dispatcher — 6요소 매칭 알고리즘 결과 (반경 5km, 매장 위치 기준)`)
    if (ranked.length === 0) {
      console.log("  ⚠️ 반경 내 매칭 가능 워커 없음")
      results.push({ employer: employer.name, post: rawPost, draft, accepted: null })
      continue
    }
    console.log("\n  순위 | 워커               | 점수  | 거리      | 거리/평점/직종/신뢰/활동/가용")
    console.log("  ─────┼───────────────────┼───────┼──────────┼─────────────────────────────")
    ranked.forEach((r, i) => {
      const b = r.score.breakdown
      console.log(
        `  ${String(i + 1).padStart(2)}   | ${r.worker.name.padEnd(18)}| ${String(r.score.total).padStart(5)} | ${(r.score.dist).toFixed(0).padStart(4)}m    | ${b.distance.toFixed(1).padStart(4)}/${b.rating.toFixed(1).padStart(4)}/${String(b.category).padStart(2)}/${b.trust.toFixed(1).padStart(4)}/${b.activity}/${b.availability}`
      )
    })

    // Top-2 워커에게 LLM 수락 결정 요청
    const topN = ranked.slice(0, 2)
    console.log(`\n  Top-${topN.length}에게 LLM 수락 결정 요청 중...`)
    let acceptedBy = null
    for (const r of topN) {
      try {
        const decision = await workerDecides(r.worker, draft, r.score)
        const tag = decision.decision === "accept" ? "✅ 수락" : "❌ 거절"
        console.log(`  ${tag} (${decision.secondsToDecide}초) — ${r.worker.name}: ${decision.reason}`)
        if (decision.decision === "accept" && !acceptedBy) {
          acceptedBy = { worker: r.worker.name, secondsToDecide: decision.secondsToDecide, reason: decision.reason }
          // 첫 수락 발생 시 dispatch 종료 (실제 albaconnect와 동일)
          break
        }
      } catch (e) {
        console.log(`  ⚠️ ${r.worker.name} LLM 응답 실패: ${e.message.split("\n")[0]}`)
      }
      // rate-friendly
      await sleep(500)
    }

    if (acceptedBy) {
      console.log(`\n  🎉 매칭 확정! ${acceptedBy.worker} (수락까지 ${acceptedBy.secondsToDecide}초)`)
    } else {
      console.log(`\n  ⚠️ Top-${topN.length} 모두 거절 — 차순위로 재디스패치 필요`)
    }

    results.push({ employer: employer.name, rawPost, draft, ranked: ranked.length, accepted: acceptedBy })
  }

  // Summary
  logHeader("📊 시뮬레이션 요약")
  console.log("")
  results.forEach((r, i) => {
    const status = r.accepted
      ? `✅ ${r.accepted.worker} (${r.accepted.secondsToDecide}s)`
      : "❌ 미매칭"
    console.log(`  ${i + 1}. ${r.employer.padEnd(30)} → ${r.draft?.title?.slice(0, 30).padEnd(32) ?? "(normalize fail)"} ${status}`)
  })

  const matched = results.filter((r) => r.accepted).length
  console.log(`\n  매칭 성공률: ${matched}/${results.length} (${Math.round((matched / results.length) * 100)}%)`)
  console.log("")
}

runSimulation().catch((e) => {
  console.error("\n❌ Simulation failed:", e)
  process.exit(1)
})
