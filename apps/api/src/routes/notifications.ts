import { FastifyInstance } from "fastify"
import { eq, and, desc } from "drizzle-orm"
import { db } from "../db"
import { sql } from "drizzle-orm"
import { authenticate, requireEmployer } from "../middleware/auth"
import { pgTable, uuid, varchar, boolean, timestamp, text } from "drizzle-orm/pg-core"
import type { Server as SocketServer } from "socket.io"
import { sendAlimTalk } from "../services/kakaoAlimTalk"

// Inline notifications table — matches runNotificationsMigration() schema
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  read: boolean("read").default(false).notNull(),
  data: text("data"), // JSON string
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// ─── Socket-emit wiring ───────────────────────────────────────────────────────
// Called from socket.ts after io is ready. Avoids circular dep with matching.ts.
let _io: SocketServer | null = null
let _sockets: Map<string, string> | null = null

export function setNotificationEmitter(io: SocketServer, sockets: Map<string, string>): void {
  _io = io
  _sockets = sockets
}

// ─── Critical event types → also fire KakaoTalk to employer ─────────────────
const CRITICAL_TYPES = new Set(["payment_completed", "noshow_penalty", "noshow"])

// ─── Core create helper (used by matching.ts, applications.ts, jobs.ts) ──────
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(notifications).values({
      userId,
      type,
      title,
      body,
      data: data ? JSON.stringify(data) : undefined,
    })

    // Socket.io — push to connected client immediately
    if (_io && _sockets) {
      const socketId = _sockets.get(userId)
      if (socketId) {
        _io.to(socketId).emit("notification", {
          type,
          title,
          body,
          data: data ?? null,
          createdAt: new Date().toISOString(),
        })
      }
    }

    // KakaoTalk for critical events — look up employer phone
    if (CRITICAL_TYPES.has(type)) {
      void (async () => {
        try {
          const result = await db.execute<{ phone: string | null }>(
            sql`SELECT phone FROM users WHERE id = ${userId} LIMIT 1`
          )
          const phone = result.rows?.[0]?.phone
          if (phone) {
            await sendAlimTalk(phone, "EMPLOYER_ALERT", {
              title,
              body,
            })
          }
        } catch {
          // Non-critical — log but don't crash
          console.warn("[Notification] KakaoTalk employer alert failed")
        }
      })()
    }
  } catch (err) {
    // Non-critical — log but don't crash main flow
    console.warn("[Notification] Failed to create notification:", err)
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────
export async function notificationRoutes(app: FastifyInstance) {
  // GET /notifications — generic (own user)
  app.get("/notifications", { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { limit = 20, isRead } = request.query as {
      limit?: number
      isRead?: string
    }

    try {
      let query = db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .$dynamic()

      if (isRead === "true") {
        query = db
          .select()
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.read, true)))
          .$dynamic()
      } else if (isRead === "false") {
        query = db
          .select()
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
          .$dynamic()
      }

      const rows = await db
        .select()
        .from(notifications)
        .where(
          isRead === "true"
            ? and(eq(notifications.userId, userId), eq(notifications.read, true))
            : isRead === "false"
            ? and(eq(notifications.userId, userId), eq(notifications.read, false))
            : eq(notifications.userId, userId)
        )
        .orderBy(desc(notifications.createdAt))
        .limit(Math.min(Number(limit), 100))

      const unreadCount = isRead === "false"
        ? rows.length
        : (await db
            .select()
            .from(notifications)
            .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
            .then((r) => r.length))

      return reply.send({ notifications: rows, unreadCount })
    } catch {
      return reply.send({ notifications: [], unreadCount: 0 })
    }
  })

  // GET /employers/me/notifications — employer-specific with cursor pagination + isRead filter
  app.get(
    "/employers/me/notifications",
    { preHandler: [requireEmployer] },
    async (request, reply) => {
      const userId = request.user.id
      const {
        limit = 20,
        cursor,
        isRead,
      } = request.query as {
        limit?: number
        cursor?: string
        isRead?: string
      }

      try {
        const pageSize = Math.min(Number(limit), 100)
        const conditions: any[] = [eq(notifications.userId, userId)]

        if (isRead === "true") conditions.push(eq(notifications.read, true))
        else if (isRead === "false") conditions.push(eq(notifications.read, false))

        if (cursor) {
          const rows = await db.execute<{ id: string; created_at: Date }>(
            sql`SELECT id, created_at FROM notifications WHERE id = ${cursor} LIMIT 1`
          )
          const pivot = rows.rows?.[0]
          if (pivot) {
            const result = await db.execute(
              sql`
                SELECT * FROM notifications
                WHERE user_id = ${userId}
                  ${isRead === "true" ? sql`AND read = true` : isRead === "false" ? sql`AND read = false` : sql``}
                  AND created_at < ${pivot.created_at}
                ORDER BY created_at DESC
                LIMIT ${pageSize}
              `
            )
            const notifRows = result.rows ?? []
            const nextCursor = notifRows.length === pageSize
              ? (notifRows[notifRows.length - 1] as any).id
              : null
            return reply.send({ notifications: notifRows, nextCursor })
          }
        }

        const rows = await db
          .select()
          .from(notifications)
          .where(and(...conditions))
          .orderBy(desc(notifications.createdAt))
          .limit(pageSize)

        const unreadResult = await db.execute<{ count: string }>(
          sql`SELECT COUNT(*) as count FROM notifications WHERE user_id = ${userId} AND read = false`
        )
        const unreadCount = parseInt(
          (unreadResult as any)?.rows?.[0]?.count ?? "0",
          10
        )

        const nextCursor =
          rows.length === pageSize ? rows[rows.length - 1].id : null

        return reply.send({ notifications: rows, unreadCount, nextCursor })
      } catch (err) {
        console.warn("[Notification] GET /employers/me/notifications failed:", err)
        return reply.send({ notifications: [], unreadCount: 0, nextCursor: null })
      }
    }
  )

  // PUT /notifications/read-all (legacy)
  app.put("/notifications/read-all", { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user.id
    try {
      await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId))
    } catch {}
    return reply.send({ message: "All notifications marked as read" })
  })

  // PATCH /notifications/read-all
  app.patch(
    "/notifications/read-all",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user.id
      try {
        await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId))
      } catch {}
      return reply.send({ message: "All notifications marked as read" })
    }
  )

  // PUT /notifications/:id/read (legacy)
  app.put("/notifications/:id/read", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await db.update(notifications).set({ read: true }).where(
        and(eq(notifications.id, id), eq(notifications.userId, request.user.id))
      )
    } catch {}
    return reply.send({ message: "Notification marked as read" })
  })

  // PATCH /notifications/:id/read
  app.patch(
    "/notifications/:id/read",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      try {
        await db
          .update(notifications)
          .set({ read: true })
          .where(and(eq(notifications.id, id), eq(notifications.userId, request.user.id)))
      } catch {}
      return reply.send({ message: "Notification marked as read" })
    }
  )
}
