/**
 * agents/runtime.ts — Common LLM agent runtime for AlbaConnect.
 *
 * Goals:
 *  - Provider abstraction (Anthropic default, swappable to internal gateway later)
 *  - Zod-enforced structured output via tool_use
 *  - Cost tracking + daily budget guard
 *  - Optional Redis caching by content hash
 *  - Audit trail to `agent_decisions` table
 *
 * NOT a public API. Wrapped by per-agent modules in this directory.
 *
 * Related SPEC: .agency/research/spec-agent-001-listing-normalizer.md
 */

import crypto from "node:crypto"
import {
  ZodArray,
  ZodBoolean,
  ZodDefault,
  ZodEnum,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodString,
  type ZodRawShape,
  type ZodSchema,
  type ZodTypeAny,
} from "zod"
import { db } from "../db"
import { sql } from "drizzle-orm"
import { getRedisClient } from "../lib/redis"

// Redis is optional (graceful fallback when REDIS_URL is unset).
function redisClient() {
  return getRedisClient()
}

// ── Provider config ──────────────────────────────────────────────────────────

export type ModelTier = "haiku" | "sonnet" | "opus"

const MODEL_IDS: Record<ModelTier, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
}

// KRW per million tokens — update when pricing changes.
// Source: anthropic public pricing as of 2026-05; FX ~ 1 USD = 1,360 KRW.
const COST_KRW_PER_MTOK: Record<ModelTier, { in: number; out: number }> = {
  haiku: { in: 1_360, out: 6_800 },   // $1 / $5 per Mtok
  sonnet: { in: 4_080, out: 20_400 }, // $3 / $15
  opus: { in: 20_400, out: 102_000 }, // $15 / $75
}

// ── Daily budget guard ───────────────────────────────────────────────────────

const DAILY_BUDGET_KRW = Number(process.env.AGENT_DAILY_BUDGET_KRW ?? 50_000)

async function getTodayCostKrw(): Promise<number> {
  const key = `agent:cost:${new Date().toISOString().slice(0, 10)}`
  const c = redisClient()
  if (!c) return 0
  const v = await c.get(key)
  return v ? Number(v) : 0
}

async function addTodayCostKrw(amount: number): Promise<void> {
  const c = redisClient()
  if (!c) return
  const key = `agent:cost:${new Date().toISOString().slice(0, 10)}`
  await c.incrbyfloat(key, amount)
  await c.expire(key, 60 * 60 * 36) // 36h TTL
}

// ── Public agent definition ──────────────────────────────────────────────────

export interface AgentDefinition<I, O> {
  agentName: string
  model: ModelTier
  outputSchema: ZodSchema<O>
  outputName: string // tool name shown to the model, e.g. "submit_listing_draft"
  outputDescription: string
  systemPrompt: string
  buildUserPrompt: (input: I) => string
  /** Optional cache key fn. If returned, identical inputs return cached output for `cacheTtlSec`. */
  cacheKey?: (input: I) => string
  cacheTtlSec?: number
  temperature?: number
  maxTokens?: number
  /** Hard wall-clock timeout in ms. Anthropic SDK will be aborted. */
  timeoutMs?: number
}

export interface AgentCallContext {
  userId: string
}

export interface AgentRunResult<O> {
  output: O
  cost: { tokensIn: number; tokensOut: number; krw: number }
  latencyMs: number
  cached: boolean
  traceId: string
}

export class AgentBudgetExceededError extends Error {
  constructor(public budget: number, public spent: number) {
    super(`Daily agent budget exceeded: ${spent.toFixed(2)} / ${budget} KRW`)
    this.name = "AgentBudgetExceededError"
  }
}

export class AgentValidationError extends Error {
  constructor(public agentName: string, public rawOutput: unknown, public zodIssues: unknown) {
    super(`Agent ${agentName} produced output that failed schema validation`)
    this.name = "AgentValidationError"
  }
}

// ── Core runner ──────────────────────────────────────────────────────────────

export async function runAgent<I, O>(
  def: AgentDefinition<I, O>,
  input: I,
  ctx: AgentCallContext,
): Promise<AgentRunResult<O>> {
  const traceId = crypto.randomUUID()
  const startedAt = Date.now()

  // ── Cache hit?
  let cacheKey: string | null = null
  if (def.cacheKey && def.cacheTtlSec) {
    const raw = def.cacheKey(input)
    cacheKey = `agent:cache:${def.agentName}:${crypto.createHash("sha256").update(raw).digest("hex")}`
    const cacheClient = redisClient()
    const hit = cacheClient ? await cacheClient.get(cacheKey) : null
    if (hit) {
      try {
        const parsed = JSON.parse(hit) as O
        return {
          output: parsed,
          cost: { tokensIn: 0, tokensOut: 0, krw: 0 },
          latencyMs: Date.now() - startedAt,
          cached: true,
          traceId,
        }
      } catch {
        // fall through on cache parse failure
      }
    }
  }

  // ── Budget check
  const spent = await getTodayCostKrw()
  if (spent >= DAILY_BUDGET_KRW) {
    throw new AgentBudgetExceededError(DAILY_BUDGET_KRW, spent)
  }

  // ── Build tool schema (forces structured output)
  // Anthropic tool_use is used as a structured-output mechanism.
  const tool = {
    name: def.outputName,
    description: def.outputDescription,
    input_schema: zodToJsonSchema(def.outputSchema),
  }

  const userPrompt = def.buildUserPrompt(input)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), def.timeoutMs ?? 3_000)

  let response: AnthropicMessage
  try {
    response = await createAnthropicMessage({
      model: MODEL_IDS[def.model],
      max_tokens: def.maxTokens ?? 1500,
      temperature: def.temperature ?? 0.1,
      system: def.systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [tool],
      tool_choice: { type: "tool", name: def.outputName },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  // ── Extract tool_use block
  const toolUse = response.content.find((b) => b.type === "tool_use") as
    | { type: "tool_use"; input: unknown }
    | undefined

  if (!toolUse) {
    await persistDecision({
      agentName: def.agentName,
      userId: ctx.userId,
      model: MODEL_IDS[def.model],
      inputText: userPrompt,
      outputJson: response,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      costKrw: 0,
      latencyMs: Date.now() - startedAt,
      traceId,
      status: "error",
    })
    throw new Error(`Agent ${def.agentName} did not return a tool_use block`)
  }

  // ── Validate via zod
  const parsed = def.outputSchema.safeParse(toolUse.input)
  if (!parsed.success) {
    await persistDecision({
      agentName: def.agentName,
      userId: ctx.userId,
      model: MODEL_IDS[def.model],
      inputText: userPrompt,
      outputJson: toolUse.input,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      costKrw: 0,
      latencyMs: Date.now() - startedAt,
      traceId,
      status: "error",
    })
    throw new AgentValidationError(def.agentName, toolUse.input, parsed.error.issues)
  }

  // ── Cost accounting
  const price = COST_KRW_PER_MTOK[def.model]
  const tokensIn = response.usage.input_tokens
  const tokensOut = response.usage.output_tokens
  const costKrw = (tokensIn / 1_000_000) * price.in + (tokensOut / 1_000_000) * price.out
  await addTodayCostKrw(costKrw)

  // ── Cache write
  if (cacheKey && def.cacheTtlSec) {
    const writeClient = redisClient()
    if (writeClient) {
      await writeClient.set(cacheKey, JSON.stringify(parsed.data), "EX", def.cacheTtlSec)
    }
  }

  // ── Audit trail
  await persistDecision({
    agentName: def.agentName,
    userId: ctx.userId,
    model: MODEL_IDS[def.model],
    inputText: userPrompt,
    outputJson: parsed.data,
    tokensIn,
    tokensOut,
    costKrw,
    latencyMs: Date.now() - startedAt,
    traceId,
    status: "success",
  })

  return {
    output: parsed.data,
    cost: { tokensIn, tokensOut, krw: costKrw },
    latencyMs: Date.now() - startedAt,
    cached: false,
    traceId,
  }
}

// ── Persistence ──────────────────────────────────────────────────────────────

interface DecisionRow {
  agentName: string
  userId: string
  model: string
  inputText: string
  outputJson: unknown
  tokensIn: number
  tokensOut: number
  costKrw: number
  latencyMs: number
  traceId: string
  status: "success" | "partial" | "fallback" | "error"
}

async function persistDecision(row: DecisionRow): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO agent_decisions (
        agent_name, user_id, model, input_text, output_json,
        tokens_in, tokens_out, cost_krw, latency_ms, trace_id, status
      ) VALUES (
        ${row.agentName}, ${row.userId}::uuid, ${row.model},
        ${row.inputText}, ${JSON.stringify(row.outputJson)}::jsonb,
        ${row.tokensIn}, ${row.tokensOut}, ${row.costKrw},
        ${row.latencyMs}, ${row.traceId}, ${row.status}
      )
    `)
  } catch (err) {
    // Audit table write failure must not break the agent response.
    // Log via Sentry/console and continue.
    console.error("[agent.runtime] persistDecision failed", err)
  }
}

// ── Zod → JSON Schema (subset sufficient for tool_use) ───────────────────────
// Avoid extra dep; cover the shapes used by our agents.
function zodToJsonSchema(schema: ZodSchema<unknown>): Record<string, unknown> {
  return zodTypeToJsonSchema(schema as ZodTypeAny)
}

function zodTypeToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  if (schema instanceof ZodObject) {
    const shape = schema.shape as ZodRawShape
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, childSchema] of Object.entries(shape)) {
      properties[key] = zodTypeToJsonSchema(childSchema)
      if (!(childSchema instanceof ZodOptional) && !(childSchema instanceof ZodDefault)) {
        required.push(key)
      }
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    }
  }

  if (schema instanceof ZodString) return { type: "string" }
  if (schema instanceof ZodNumber) return { type: "number" }
  if (schema instanceof ZodBoolean) return { type: "boolean" }
  if (schema instanceof ZodEnum) return { type: "string", enum: schema.options }

  if (schema instanceof ZodArray) {
    return { type: "array", items: zodTypeToJsonSchema(schema.element) }
  }

  if (schema instanceof ZodNullable) {
    return { anyOf: [zodTypeToJsonSchema(schema.unwrap()), { type: "null" }] }
  }

  if (schema instanceof ZodOptional) return zodTypeToJsonSchema(schema.unwrap())
  if (schema instanceof ZodDefault) return zodTypeToJsonSchema(schema.removeDefault())

  return {}
}

interface AnthropicMessage {
  content: Array<{ type: string; input?: unknown }>
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

interface AnthropicMessageRequest {
  model: string
  max_tokens: number
  temperature: number
  system: string
  messages: Array<{ role: "user"; content: string }>
  tools: Array<Record<string, unknown>>
  tool_choice: { type: "tool"; name: string }
  signal: AbortSignal
}

async function createAnthropicMessage(request: AnthropicMessageRequest): Promise<AnthropicMessage> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required to run AlbaConnect agents")
  }

  const { signal, ...body } = request
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Anthropic Messages API failed with ${response.status}: ${errorBody}`)
  }

  return await response.json() as AnthropicMessage
}
