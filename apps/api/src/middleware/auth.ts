import { FastifyRequest, FastifyReply } from "fastify"

export interface AuthUser {
  id: string
  email: string
  role: "employer" | "worker"
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ error: "Unauthorized" })
  }
}

export async function requireEmployer(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply)
  if (request.user?.role !== "employer") {
    reply.status(403).send({ error: "Employer access required" })
  }
}

export async function requireWorker(request: FastifyRequest, reply: FastifyReply) {
  await authenticate(request, reply)
  if (request.user?.role !== "worker") {
    reply.status(403).send({ error: "Worker access required" })
  }
}
