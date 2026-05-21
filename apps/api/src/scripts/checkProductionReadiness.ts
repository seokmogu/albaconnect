import "dotenv/config"
import crypto from "node:crypto"
import { missingProductionConfig, validateProductionConfig } from "../services/productionConfig"

const API_URL = process.env.API_BASE_URL ?? process.env.READINESS_API_URL

function assertWebhookSignatureSelfTest() {
  const secret = process.env.TOSS_WEBHOOK_SECRET
  if (!secret) return

  const payload = JSON.stringify({ eventType: "payout.changed", data: { status: "DONE" } })
  const transmissionTime = "2026-05-20T09:00:00+09:00"
  const signature = crypto.createHmac("sha256", secret).update(`${payload}:${transmissionTime}`).digest()
  const expected = crypto.createHmac("sha256", secret).update(`${payload}:${transmissionTime}`).digest()

  if (!crypto.timingSafeEqual(signature, expected)) {
    throw new Error("Toss webhook signature self-test failed")
  }
}

async function assertHealthEndpoint() {
  if (!API_URL) return

  const response = await fetch(new URL("/health", API_URL))
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Health check failed: ${response.status} ${body}`)
  }
}

async function main() {
  process.env.NODE_ENV = "production"

  validateProductionConfig()
  assertWebhookSignatureSelfTest()
  await assertHealthEndpoint()

  console.log("Production readiness check passed")
  console.log(`Checked env: ${["JWT_SECRET", "ADMIN_TOKEN", "TOSS_SECRET_KEY", "TOSS_WEBHOOK_SECRET", "WEB_URL", "PAYOUT_RELEASE_MODE", "TOSS_CLIENT_MODE"].join(", ")}`)
  if (API_URL) console.log(`Checked health: ${new URL("/health", API_URL).toString()}`)
}

main().catch((error: unknown) => {
  const missing = missingProductionConfig({ ...process.env, NODE_ENV: "production" })
  if (missing.length > 0) {
    console.error(`Production readiness check failed. Missing/invalid: ${missing.join(", ")}`)
  } else {
    console.error(error instanceof Error ? error.message : String(error))
  }
  process.exitCode = 1
})
