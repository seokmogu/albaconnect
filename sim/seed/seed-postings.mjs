#!/usr/bin/env node
/**
 * seed-postings.mjs — 사업장별 공고 생성 (haiku LLM).
 *
 * Input: ../data/employers.json
 * Output: ../data/postings.json
 *
 * Args: --limit N  (default: 10, 데모용)
 *       --per N    (employer당 공고 수, default: 1)
 *
 * Throttle: 5건 동시 호출. 각 공고는 (자연어 공고 작성) + (normalize) = 2 LLM 호출.
 *
 * Run:
 *   node sim/seed/seed-postings.mjs --limit 10
 *   node sim/seed/seed-postings.mjs --limit 100 --per 2  # 풀스케일
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const INPUT = resolve(__dirname, "../data/employers.json")
const OUTPUT = resolve(__dirname, "../data/postings.json")
const CLAUDE_BIN = `${process.env.HOME}/.local/bin/claude-oauth-run`
const MODEL = "claude-haiku-4-5"
const CONCURRENCY = 5

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}
const LIMIT = Number(arg("--limit", "10"))
const PER_EMPLOYER = Number(arg("--per", "1"))

// ── claude wrapper ───────────────────────────────────────────────────────────
function claude(prompt, { timeoutMs = 45_000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, ["-p", prompt, "--output-format", "text", "--model", MODEL], { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = "", stderr = ""
    const t = setTimeout(() => { proc.kill("SIGTERM"); reject(new Error(`timeout ${timeoutMs}ms`)) }, timeoutMs)
    proc.stdout.on("data", (d) => (stdout += d.toString()))
    proc.stderr.on("data", (d) => (stderr += d.toString()))
    proc.on("close", (code) => {
      clearTimeout(t)
      if (code !== 0) reject(new Error(`claude exit ${code}: ${stderr.slice(0, 200)}`))
      else resolve(stdout.trim())
    })
  })
}

async function claudeJson(prompt) {
  const out = await claude(prompt)
  const cleaned = out.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  try {
    return JSON.parse(cleaned)
  } catch (e) {
    throw new Error(`JSON parse fail: ${cleaned.slice(0, 120)}... (${e.message})`)
  }
}

// ── Prompts ──────────────────────────────────────────────────────────────────

function freeFormPrompt(employer, slotHint) {
  return `당신은 한국 자영업 사장님. 아래 매장에서 ${slotHint} 알바 공고를 자연어 한두 문장으로 적으세요. 마크다운/JSON 없이 짧게.

[매장] ${employer.name} (${employer.nearestHub} 근처, ${employer.dong})
[카테고리] ${employer.category}
[페르소나] ${employer.persona}

공고 한 줄:`
}

function normalizePrompt(rawText, nowIso) {
  return `다음 한국어 알바 공고 자유 텍스트를 JSON으로 변환. JSON 한 객체만, 다른 텍스트 금지.

[입력] ${rawText}
[현재 시각 KST] ${nowIso}

[스키마]
{
  "title": "60자 이내 제목",
  "category": "cafe|restaurant|retail|event|delivery|cleaning|manufacturing|other",
  "hourlyRate": 정수 (10030~50000 권장, 명시 없으면 12000),
  "headcount": 정수 (명시 없으면 1),
  "durationHours": 정수,
  "startAtIso": "ISO8601 +09:00 형식, 명시 없으면 다음 영업시간 추정",
  "address": "지역명",
  "description": "100자 이내",
  "tags": ["키워드","최대 5개"],
  "confidence": 0.0-1.0
}`
}

// ── Time slot rotation (현실감) ──────────────────────────────────────────────
const TIME_SLOTS = [
  "오늘 저녁 6시부터 4시간 (피크타임)",
  "내일 오전 9시부터 6시간 (오픈조)",
  "이번 주말 12시부터 8시간 (주말 부족)",
  "오늘 밤 10시부터 새벽 6시까지 (야간)",
  "내일 점심 11시~3시 (런치 4시간)",
  "이번 주 금/토 저녁 6시~11시 (단기 2일)",
  "다음 주 평일 3일 오후 2~7시",
]

// ── 병렬 dispatch with throttling ────────────────────────────────────────────

async function runPool(items, fn, concurrency) {
  const results = []
  let i = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++
      try {
        results[idx] = { ok: true, value: await fn(items[idx], idx) }
      } catch (e) {
        results[idx] = { ok: false, error: e.message }
      }
    }
  })
  await Promise.all(workers)
  return results
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { employers } = JSON.parse(readFileSync(INPUT, "utf8"))
  const targets = employers.slice(0, LIMIT)
  const nowIso = new Date().toISOString()

  console.log(`📋 공고 생성 시작 — 사업장 ${targets.length}개 × ${PER_EMPLOYER} = ${targets.length * PER_EMPLOYER}건`)
  console.log(`모델: ${MODEL}, 동시 호출: ${CONCURRENCY}\n`)

  const tasks = []
  for (const emp of targets) {
    for (let k = 0; k < PER_EMPLOYER; k++) {
      tasks.push({ emp, slotHint: TIME_SLOTS[(k + targets.indexOf(emp)) % TIME_SLOTS.length] })
    }
  }

  const t0 = Date.now()
  const results = await runPool(tasks, async ({ emp, slotHint }, idx) => {
    const raw = await claude(freeFormPrompt(emp, slotHint))
    const draft = await claudeJson(normalizePrompt(raw, nowIso))
    const posting = {
      id: `post-${String(idx + 1).padStart(4, "0")}`,
      employerId: emp.id,
      employerName: emp.name,
      employerLocation: emp.location,
      rawText: raw,
      draft,
      createdAt: new Date().toISOString(),
    }
    process.stdout.write(`  ✓ ${posting.id} (${emp.name}) → ${draft.title?.slice(0, 30) ?? "?"}\n`)
    return posting
  }, CONCURRENCY)

  const ok = results.filter((r) => r.ok).map((r) => r.value)
  const fail = results.filter((r) => !r.ok)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  mkdirSync(dirname(OUTPUT), { recursive: true })
  writeFileSync(OUTPUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    model: MODEL,
    count: ok.length,
    failed: fail.length,
    postings: ok,
  }, null, 2), "utf8")

  console.log(`\n✓ ${ok.length}건 성공, ${fail.length}건 실패 — ${elapsed}s`)
  console.log(`→ ${OUTPUT}`)
  if (fail.length > 0) {
    console.log("\n실패 사유 (상위 3):")
    fail.slice(0, 3).forEach((f, i) => console.log(`  ${i + 1}. ${f.error?.slice(0, 200)}`))
  }
}

main().catch((e) => {
  console.error("\n❌ Fatal:", e.message)
  process.exit(1)
})
