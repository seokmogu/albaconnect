import "dotenv/config"
import Fastify from "fastify"
import cors from "@fastify/cors"
import jwt from "@fastify/jwt"
import cookie from "@fastify/cookie"
import { createServer } from "http"
import { runMigrations, runNotificationsMigration } from "./db/migrate"
import { authRoutes } from "./routes/auth"
import { jobRoutes } from "./routes/jobs"
import { workerRoutes } from "./routes/workers"
import { applicationRoutes } from "./routes/applications"
import { reviewRoutes } from "./routes/reviews"
import { adminRoutes } from './routes/admin'
import { employerRoutes } from './routes/employer'
import { notificationRoutes } from './routes/notifications'
import { paymentRoutes } from "./routes/payments"
import { setupSocketIO } from "./plugins/socket"

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
  })

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
  await app.register(notificationRoutes)
  await app.register(paymentRoutes)

  app.get("/health", async () => ({ status: "ok", uptime: process.uptime() }))

  const httpServer = createServer(app.server)
  await setupSocketIO(app, httpServer as any)

  return app
}

export async function start() {
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
}

if (!process.env.VITEST) {
  void start()
}
