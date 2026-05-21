const PRODUCTION_RELEASE_MODES = new Set(["manual", "external"])

export function payoutReleaseMode(env: NodeJS.ProcessEnv = process.env): string {
  return env.PAYOUT_RELEASE_MODE ?? "stub"
}

export function canReleaseEscrowPayments(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production") return true

  return PRODUCTION_RELEASE_MODES.has(payoutReleaseMode(env))
}

export function payoutReleaseUnavailableResponse() {
  return {
    error: "Payout release is not configured for production",
    code: "PAYOUT_RELEASE_NOT_CONFIGURED",
    requiredEnv: "PAYOUT_RELEASE_MODE=manual or PAYOUT_RELEASE_MODE=external",
  }
}
