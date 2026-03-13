/**
 * Sentry client-side initialisation for Next.js (browser bundle).
 * Loaded automatically by @sentry/nextjs instrumentation.
 * No-ops when NEXT_PUBLIC_SENTRY_DSN is not set.
 */
import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.01,
    integrations: [Sentry.replayIntegration()],
  })
}
