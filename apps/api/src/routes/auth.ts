import { FastifyInstance } from "fastify"
import bcrypt from "bcrypt"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db, users, employerProfiles, workerProfiles } from "../db"

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["employer", "worker"]),
  name: z.string().min(1).max(100),
  phone: z.string().min(10).max(20),
  companyName: z.string().optional(), // required for employer
  categories: z.array(z.string()).optional(), // for worker
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/signup", async (request, reply) => {
    const body = signupSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    const { email, password, role, name, phone, companyName, categories } = body.data

    if (role === "employer" && !companyName) {
      return reply.status(400).send({ error: "companyName is required for employers" })
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (existing.length > 0) {
      return reply.status(409).send({ error: "Email already registered" })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const [user] = await db.insert(users).values({ email, passwordHash, role, name, phone }).returning()

    if (role === "employer") {
      await db.insert(employerProfiles).values({
        userId: user.id,
        companyName: companyName!,
      })
    } else {
      await db.insert(workerProfiles).values({
        userId: user.id,
        categories: categories ?? [],
      })
    }

    const accessToken = app.jwt.sign({ id: user.id, email: user.email, role: user.role }, { expiresIn: "1h" })
    const refreshToken = app.jwt.sign({ id: user.id, type: "refresh" }, { expiresIn: "30d" })

    return reply.status(201).send({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    })
  })

  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed" })
    }

    const { email, password } = body.data

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials" })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" })
    }

    const accessToken = app.jwt.sign({ id: user.id, email: user.email, role: user.role }, { expiresIn: "1h" })
    const refreshToken = app.jwt.sign({ id: user.id, type: "refresh" }, { expiresIn: "30d" })

    return reply.send({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    })
  })

  app.post("/auth/refresh", async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string }
    if (!refreshToken) {
      return reply.status(400).send({ error: "refreshToken required" })
    }

    try {
      const payload = app.jwt.verify<{ id: string; type: string }>(refreshToken)
      if (payload.type !== "refresh") throw new Error("Invalid token type")

      const [user] = await db.select().from(users).where(eq(users.id, payload.id)).limit(1)
      if (!user) return reply.status(401).send({ error: "User not found" })

      const accessToken = app.jwt.sign({ id: user.id, email: user.email, role: user.role }, { expiresIn: "1h" })
      return reply.send({ accessToken })
    } catch {
      return reply.status(401).send({ error: "Invalid refresh token" })
    }
  })
}
