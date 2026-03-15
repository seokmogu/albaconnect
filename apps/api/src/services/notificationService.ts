/**
 * notificationService.ts
 * Creates employer notifications, persists to DB, emits via socket.io,
 * and sends KakaoTalk AlimTalk for critical events.
 */

import { Server } from "socket.io"
import { db } from "../db/index.js"
import { notifications, notificationTypeEnum, users } from "../db/schema.js"
import { sql } from "drizzle-orm"
import { sendAlimTalk } from "./kakaoAlimTalk.js"

// Notification type alias
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number]

// In-memory map: userId -> socket.id (employers)
export const employerSockets = new Map<string, string>()

// Socket.io server reference (set by socket plugin)
let _io: Server | null = null

export function setNotificationSocketServer(io: Server) {
  _io = io
}

/** Critical types that also trigger KakaoTalk AlimTalk */
const KAKAO_CRITICAL: Set<NotificationType> = new Set([
  "payment_completed",
  "noshow_penalty",
])

/**
 * Create a notification for a user, persist to DB,
 * push via socket.io if connected, and optionally send KakaoTalk.
 */
export async function createNotification(params: {
  userId: string
  type: NotificationType
  message: string
  jobId?: string
}): Promise<void> {
  const { userId, type, message, jobId } = params

  // 1. Persist to DB
  await db.execute(sql`
    INSERT INTO notifications (id, user_id, type, job_id, message, is_read, created_at)
    VALUES (
      gen_random_uuid(),
      ${userId},
      ${type}::notification_type,
      ${jobId ?? null},
      ${message},
      false,
      now()
    )
  `)

  // 2. Emit via socket.io if employer is connected
  if (_io) {
    const socketId = employerSockets.get(userId)
    if (socketId) {
      _io.to(socketId).emit("notification", {
        type,
        message,
        jobId: jobId ?? null,
        createdAt: new Date().toISOString(),
      })
    }
  }

  // 3. KakaoTalk AlimTalk for critical events
  if (KAKAO_CRITICAL.has(type)) {
    try {
      // Look up employer phone
      const rows = await db.execute<{ phone: string | null }>(sql`
        SELECT phone FROM users WHERE id = ${userId} LIMIT 1
      `)
      const phone = rows.rows?.[0]?.phone
      if (phone) {
        await sendAlimTalk(phone, "employer_alert", {
          message,
          event_type: type,
        })
      }
    } catch (err) {
      // Non-blocking — don't fail the notification on KakaoTalk error
      console.warn("[Notification] KakaoTalk send failed:", err)
    }
  }
}

/**
 * Count unread notifications for a user.
 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const rows = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) AS count
    FROM notifications
    WHERE user_id = ${userId} AND is_read = false
  `)
  return parseInt(rows.rows?.[0]?.count ?? "0", 10)
}
