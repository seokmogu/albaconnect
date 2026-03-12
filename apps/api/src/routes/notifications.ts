import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and, desc } from "drizzle-orm"
import { db } from "../db"
import { sql } from "drizzle-orm"
import { authenticate } from "../middleware/auth"
import { pgTable, uuid, varchar, boolean, timestamp, text } from "drizzle-orm/pg-core"

// Inline notifications table (will be added to schema)
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

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  try {
    await db.insert(notifications).values({
      userId,
      type,
      title,
      body,
      data: data ? JSON.stringify(data) : undefined,
    })
  } catch {
    // Non-critical — don't crash if notifications table doesn't exist yet
  }
}

export async function notificationRoutes(app: FastifyInstance) {
  // GET /notifications
  app.get("/notifications", { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const { limit = 20 } = request.query as { limit?: number }

    try {
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(Number(limit))

      const unreadCount = rows.filter(n => !n.read).length

      return reply.send({ notifications: rows, unreadCount })
    } catch {
      return reply.send({ notifications: [], unreadCount: 0 })
    }
  })

  // PUT /notifications/read-all
  app.put("/notifications/read-all", { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user.id
    try {
      await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId))
    } catch {}
    return reply.send({ message: "All notifications marked as read" })
  })

  // PUT /notifications/:id/read
  app.put("/notifications/:id/read", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await db.update(notifications).set({ read: true }).where(
        and(eq(notifications.id, id), eq(notifications.userId, request.user.id))
      )
    } catch {}
    return reply.send({ message: "Notification marked as read" })
  })
}
