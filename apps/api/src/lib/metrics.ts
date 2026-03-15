/**
 * Prometheus metrics for AlbaConnect API.
 * Uses prom-client for counter tracking.
 */
import { Counter, Registry } from "prom-client"

export const metricsRegistry = new Registry()

/** Tracks number of reviews submitted, labeled by reviewer_role (employer | worker). */
export const reviewSubmittedCounter = new Counter({
  name: "review_submitted_total",
  help: "Total number of reviews submitted, by reviewer role",
  labelNames: ["reviewer_role"] as const,
  registers: [metricsRegistry],
})
