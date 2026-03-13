import fp from "fastify-plugin"
import type { FastifyPluginAsync } from "fastify"

// Augment FastifyRequest with startTime for duration tracking
declare module "fastify" {
  interface FastifyRequest {
    startTime: number
  }
}

const loggerPlugin: FastifyPluginAsync = async (fastify) => {
  // Track request start time
  fastify.addHook("onRequest", async (req) => {
    req.startTime = Date.now()
  })

  // Echo request ID in every response
  fastify.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id)
  })

  // Log completed requests with duration
  fastify.addHook("onResponse", async (req, reply) => {
    req.log.info(
      {
        reqId: req.id,
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        durationMs: Date.now() - req.startTime,
      },
      "request completed"
    )
  })

  // Log errors — never log request body (may contain passwords/tokens)
  fastify.addHook("onError", async (req, _reply, error) => {
    req.log.error(
      {
        reqId: req.id,
        err: {
          message: error.message,
          stack: error.stack,
          code: (error as NodeJS.ErrnoException).code ?? null,
          statusCode: (error as any).statusCode ?? null,
        },
        userId: (req as any).user?.id ?? null,
      },
      "request error"
    )
  })
}

export default fp(loggerPlugin, {
  fastify: "5",
  name: "logger-plugin",
})
