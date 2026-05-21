import { canReleaseEscrowPayments } from "./payoutSafety"
import { isMockTossClientMode } from "./tossClient"

const REQUIRED_PRODUCTION_ENV = [
  "JWT_SECRET",
  "ADMIN_TOKEN",
  "TOSS_SECRET_KEY",
  "TOSS_WEBHOOK_SECRET",
  "WEB_URL",
] as const

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production"
}

export function missingProductionConfig(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!isProduction(env)) return []

  const missing: string[] = REQUIRED_PRODUCTION_ENV.filter((key) => !env[key])

  if (!canReleaseEscrowPayments(env)) {
    missing.push("PAYOUT_RELEASE_MODE")
  }

  if (env.TOSS_SECRET_KEY?.startsWith("test_") && env.TOSS_ALLOW_TEST_KEYS !== "true") {
    missing.push("TOSS_SECRET_KEY(live key or TOSS_ALLOW_TEST_KEYS=true)")
  }

  if (isMockTossClientMode(env) && env.TOSS_ALLOW_MOCK_CLIENT !== "true") {
    missing.push("TOSS_CLIENT_MODE(rest in production or TOSS_ALLOW_MOCK_CLIENT=true)")
  }

  return missing
}

export function validateProductionConfig(env: NodeJS.ProcessEnv = process.env): void {
  const missing = missingProductionConfig(env)

  if (missing.length > 0) {
    throw new Error(`Missing production configuration: ${missing.join(", ")}`)
  }
}
