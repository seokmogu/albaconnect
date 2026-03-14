import "dotenv/config"
import crypto from "node:crypto"
import Fastify from "fastify"
import cors from "@fastify/cors"
import jwt from "@fastify/jwt"
import cookie from "@fastify/cookie"
import helmet from "@fastify/helmet"
import { createServer } from "http"
import { sql } from "drizzle-orm"
import { db } from "./db"
import { runMigrations, runNotificationsMigration } from "./db/migrate"
import { authRoutes } from "./routes/auth"
import { jobRoutes } from "./routes/jobs"
import { workerRoutes } from "./routes/workers"
import { applicationRoutes } from "./routes/applications"
import { reviewRoutes } from "./routes/reviews"
import { adminRoutes } from './routes/admin'
import { employerRoutes } from './routes/employer'
import { jobTemplateRoutes } from './routes/jobTemplates'
import { notificationRoutes } from './routes/notifications'
import { paymentRoutes } from "./routes/payments"
import { disputeRoutes } from "./routes/disputes"
import { setupSocketIO } from "./plugins/socket"
import { setupRateLimit } from "./plugins/rateLimit"
import sentryPlugin from "./plugins/sentry"
import loggerPlugin from "./plugins/logger"
import { processExpiredJobs, type EmitFn } from "./services/jobExpiry"
import { workerSockets } from "./services/matching"
import { checkRedisHealth } from "./lib/redis"
import { initKakaoAlimTalk } from './services/kakaoAlimTalk.js'

export async function buildApp() {
  const logLevel =
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug")

  const app = Fastify({
    logger: {
      level: logLevel,
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          hostname: req.hostname,
          remoteAddress: req.ip,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
    },
    requestIdHeader: "x-request-id",
    genReqId: (req) => {
      // Use incoming X-Request-ID if present and safe (alphanumeric + dashes, max 64 chars)
      const incoming = req.headers["x-request-id"]
      if (incoming && typeof incoming === "string" && /^[a-zA-Z0-9_\-]{1,64}$/.test(incoming)) {
        return incoming
      }
      return crypto.randomUUID()
    },
  })

  // Security
  await app.register(helmet, { contentSecurityPolicy: false })
  await setupRateLimit(app)

  // Structured logging + correlation IDs (fp-wrapped: applies globally to all routes)
  await app.register(sentryPlugin)
  await app.register(loggerPlugin)

  await app.register(cors, {
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
  })

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-please-change-in-production",
  })

  await app.register(cookie)

  await app.register(authRoutes)
  await app.register(jobRoutes)
  await app.register(workerRoutes)
  await app.register(applicationRoutes)
  await app.register(reviewRoutes)
  await app.register(adminRoutes)
  await app.register(employerRoutes)
  await app.register(jobTemplateRoutes)
  await app.register(notificationRoutes)
  await app.register(paymentRoutes)
  await app.register(disputeRoutes)

  // Enhanced health check: DB connectivity + Redis + uptime + version
  app.get("/health", async (_req, reply) => {
    let dbStatus: "ok" | "error" = "ok"
    try {
      await Promise.race([
        db.execute(sql`SELECT 1`),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("DB health check timeout")), 2000)
        ),
      ])
    } catch {
      dbStatus = "error"
    }

    const redisStatus = await checkRedisHealth()

    return reply.send({
      status: "ok",
      service: "albaconnect-api",
      version: process.env.npm_package_version ?? "0.1.0",
      uptime: Math.round(process.uptime()),
      db: dbStatus,
      redis: redisStatus,
      env: process.env.NODE_ENV ?? "development",
    })
  })

  const httpServer = createServer(app.server)
  const io = await setupSocketIO(app, httpServer as any)

  // Expose io for job expiry emitter
  ;(app as any)._io = io

  return app
}

export async function start() {
  // Initialize Web Push VAPID keys before accepting connections
  const { initWebPush } = await import("./services/webPush.js")
  initWebPush()
  initKakaoAlimTalk()

  // Initialize KakaoTalk Alim Talk alongside Web Push
  const { initKakaoAlimTalk } = await import("./services/kakaoAlimTalk.js")
  initKakaoAlimTalk()

  try {
    await runMigrations()
    await runNotificationsMigration()
  } catch (err) {
    console.error("Migration failed:", err)
    process.exit(1)
  }

  const app = await buildApp()
  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: "0.0.0.0" })
  console.log(`🚀 AlbaConnect API running on port ${port}`)

  // ── Job expiry background worker ──────────────────────────────────────────
  const ioRef = (app as any)._io
  const emitFn: EmitFn = (event, userIds, payload) => {
    if (!ioRef) return
    for (const uid of userIds) {
      const socketId = workerSockets.get(uid)
      if (socketId) ioRef.to(socketId).emit(event, payload)
    }
  }

  const expiryTimer: { ref: ReturnType<typeof setInterval> | null } = { ref: null }

  const runExpiry = async () => {
    try {
      const result = await processExpiredJobs(emitFn)
      if (result.expiredCount > 0) {
        console.log(`[Expiry] ${result.expiredCount} job(s) expired, ${result.noshowCount} no-show(s)`)
      }
    } catch (err) {
      console.error("[Expiry] Background runner error:", err)
    }
  }

  // Initial fire with random jitter (0–30s) to avoid thundering herd on multi-instance deploy
  const jitterMs = Math.floor(Math.random() * 30_000)
  const startupTimer = setTimeout(() => {
    void runExpiry()
    expiryTimer.ref = setInterval(() => void runExpiry(), 300_000) // every 5 minutes
  }, jitterMs)

  // Cleanup on server close
  app.addHook("onClose", async () => {
    clearTimeout(startupTimer)
    if (expiryTimer.ref) clearInterval(expiryTimer.ref)
  })
}

if (!process.env.VITEST) {
  void start()
}
