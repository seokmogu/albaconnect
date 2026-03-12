import { FastifyInstance } from "fastify"
import rateLimit from "@fastify/rate-limit"

export async function setupRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) => ({
      error: "Too Many Requests",
      message: `요청이 너무 많습니다. ${context.after} 후 다시 시도해주세요.`,
      statusCode: 429,
    }),
    keyGenerator: (request) => {
      return request.headers["x-forwarded-for"] as string ?? request.ip
    },
  })

  // Stricter limits for auth endpoints
  app.addHook("onRoute", (routeOptions) => {
    if (routeOptions.url?.startsWith("/auth/")) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      }
    }
  })
}
