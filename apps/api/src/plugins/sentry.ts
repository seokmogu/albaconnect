/**
 * AlbaConnect Sentry Plugin
 *
 * Initialises Sentry APM + error tracking for the API server.
 * No-ops gracefully when SENTRY_DSN is not set (dev / test environments).
 *
 * Usage: register before all route plugins in buildApp().
 */

import fp from "fastify-plugin"
import { FastifyInstance } from "fastify"

// Lazy import so missing package doesn't crash the server at startup
let Sentry: typeof import("@sentry/node") | null = null
let SentryProfiling: typeof import("@sentry/profiling-node") | null = null

async function loadSentry() {
  if (!process.env.SENTRY_DSN) return
  try {
    Sentry = await import("@sentry/node")
    SentryProfiling = await import("@sentry/profiling-node")
  } catch {
    console.warn("[Sentry] Package not available — skipping initialisation")
  }
}

async function sentryPlugin(fastify: FastifyInstance) {
  await loadSentry()

  if (!Sentry || !process.env.SENTRY_DSN) {
    fastify.log.info("[Sentry] SENTRY_DSN not set — error tracking disabled")
    return
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? "0.1"),
    integrations: SentryProfiling
      ? [SentryProfiling.nodeProfilingIntegration()]
      : [],
  })

  fastify.log.info("[Sentry] Initialised")

  // Capture unhandled rejections not caught by Fastify
  process.on("unhandledRejection", (reason) => {
    Sentry!.captureException(reason)
  })
}

export default fp(sentryPlugin, { name: "sentry" })
export { Sentry }
