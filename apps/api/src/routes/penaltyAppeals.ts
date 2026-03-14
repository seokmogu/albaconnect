/**
 * penaltyAppeals.ts — Worker penalty appeal flow
 *
 * Worker routes:
 *   POST  /workers/penalties/:id/appeal   — submit appeal
 *   GET   /workers/penalties              — list own penalties
 *
 * Admin routes:
 *   GET   /admin/penalties                — list penalties (filter by appeal_status)
 *   PATCH /admin/penalties/:id/appeal     — resolve appeal
 */

import type { FastifyInstance } from "fastify"
import { eq, desc } from "drizzle-orm"
import { z } from "zod"
import { db, penalties, jobApplications, jobPostings } from "../db"
import { requireWorker } from "../middleware/auth"

// ── Admin auth helper (reuses x-admin-token pattern from admin.ts) ─────────────
function requireAdminToken(adminToken: string) {
  return async (request: any, reply: any) => {
    const token = request.headers["x-admin-token"]
    if (!token || token !== adminToken) {
      return reply.status(401).send({ error: "Admin access required" })
    }
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────

const appealSchema = z.object({
  appealNote: z.string().min(10).max(2000),
})

const resolveAppealSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  adminNote: z.string().min(5).max(2000).optional(),
})

// ── Route plugin ───────────────────────────────────────────────────────────────

export async function penaltyAppealRoutes(app: FastifyInstance): Promise<void> {
  const adminToken = process.env.ADMIN_TOKEN ?? "dev-admin-token"
  const adminPreHandler = [requireAdminToken(adminToken)]

  // ─── WORKER: GET /workers/penalties — list own penalties ───────────────────
  app.get(
    "/workers/penalties",
    { preHandler: [requireWorker] },
    async (request, reply) => {
      const workerId = request.user.id

      const rows = await db
        .select({
          id: penalties.id,
          jobId: penalties.jobId,
          type: penalties.type,
          amount: penalties.amount,
          reason: penalties.reason,
          status: penalties.status,
          appealStatus: penalties.appealStatus,
          appealNote: penalties.appealNote,
          appealSubmittedAt: penalties.appealSubmittedAt,
          adminAppealNote: penalties.adminAppealNote,
          createdAt: penalties.createdAt,
        })
        .from(penalties)
        .where(eq(penalties.toUserId, workerId))
        .orderBy(desc(penalties.createdAt))

      return reply.send({ penalties: rows })
    },
  )

  // ─── WORKER: POST /workers/penalties/:id/appeal — submit appeal ────────────
  app.post<{ Params: { id: string } }>(
    "/workers/penalties/:id/appeal",
    { preHandler: [requireWorker] },
    async (request, reply) => {
      const workerId = request.user.id
      const { id } = request.params

      const body = appealSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: "Validation failed", details: body.error.issues })
      }
      const { appealNote } = body.data

      // Find penalty and verify worker is the target
      const [penalty] = await db
        .select()
        .from(penalties)
        .where(eq(penalties.id, id))
        .limit(1)

      if (!penalty) {
        return reply.status(404).send({ error: "Penalty not found" })
      }

      if (penalty.toUserId !== workerId) {
        return reply.status(403).send({ error: "You can only appeal your own penalties" })
      }

      // Duplicate appeal check
      if (penalty.appealStatus !== "none") {
        return reply.status(409).send({
          error: "Appeal already submitted",
          appealStatus: penalty.appealStatus,
        })
      }

      const [updated] = await db
        .update(penalties)
        .set({
          appealStatus: "pending",
          appealNote,
          appealSubmittedAt: new Date(),
        })
        .where(eq(penalties.id, id))
        .returning()

      return reply.status(200).send({ penalty: updated })
    },
  )

  // ─── ADMIN: PATCH /admin/penalties/:id/appeal — resolve appeal ─────────────
  app.patch<{ Params: { id: string } }>(
    "/admin/penalties/:id/appeal",
    { preHandler: adminPreHandler },
    async (request, reply) => {
      const { id } = request.params

      const body = resolveAppealSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: "Validation failed", details: body.error.issues })
      }
      const { decision, adminNote } = body.data

      const [existing] = await db
        .select()
        .from(penalties)
        .where(eq(penalties.id, id))
        .limit(1)

      if (!existing) {
        return reply.status(404).send({ error: "Penalty not found" })
      }

      if (existing.appealStatus !== "pending") {
        return reply.status(409).send({
          error: "No pending appeal for this penalty",
          appealStatus: existing.appealStatus,
        })
      }

      // Build update — if approved, soft-delete by setting amount to 0 and status to refunded
      const updateValues: Partial<typeof existing> = {
        appealStatus: decision,
        adminAppealNote: adminNote ?? null,
      }

      if (decision === "approved") {
        // Soft-delete: zero out penalty amount and mark as refunded
        Object.assign(updateValues, {
          amount: 0,
          status: "refunded" as const,
        })
      }

      const [updated] = await db
        .update(penalties)
        .set(updateValues)
        .where(eq(penalties.id, id))
        .returning()

      return reply.send({ penalty: updated })
    },
  )
}
