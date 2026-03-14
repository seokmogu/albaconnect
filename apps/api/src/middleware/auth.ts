import { FastifyRequest, FastifyReply } from "fastify"

export interface AuthUser {
  id: string
  email?: string
  role?: "employer" | "worker"
  type?: "refresh"
}

// @fastify/jwt v9 requires augmenting @fastify/jwt module, not fastify module
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthUser
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

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    return reply.status(401).send({ error: "Unauthorized" })
  }
  // Admin access: either ADMIN_KEY env bypass or role=admin (not in normal user enum — dashboard use only)
  const adminKey = process.env["ADMIN_KEY"]
  const providedKey = request.headers["x-admin-key"]
  if (adminKey && providedKey === adminKey) return
  return reply.status(403).send({ error: "Admin access required" })
}
