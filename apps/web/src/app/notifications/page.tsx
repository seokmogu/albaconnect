"use client"

import { useState, useEffect } from "react"
import api from "@/lib/api"
import Link from "next/link"
import { useAuthStore } from "@/store/auth"

interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  created_at: string
}

const TYPE_ICON: Record<string, string> = {
  job_matched: "🎉",
  job_offer: "⚡",
  job_cancelled: "❌",
  payment: "💰",
  penalty: "⚠️",
  review: "⭐",
  default: "🔔",
}

export default function NotificationsPage() {
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get("/notifications").then(({ data }) => {
      setNotifications(data.notifications ?? [])
      // Mark all as read
      if (data.unreadCount > 0) {
        api.put("/notifications/read-all").catch(() => {})
      }
    }).finally(() => setLoading(false))
  }, [])

  const backHref = user?.role === "employer" ? "/employer/dashboard" : "/worker/home"

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10 flex items-center gap-3">
        <Link href={backHref} className="text-gray-500">←</Link>
        <h1 className="font-bold text-xl">알림</h1>
      </div>

      <div className="px-4 py-4 space-y-2">
        {loading ? (
          <div className="text-center py-12 text-gray-400">불러오는 중...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔔</div>
            <div className="text-gray-500">알림이 없습니다</div>
          </div>
        ) : (
          notifications.map(n => (
            <div key={n.id} className={`card flex items-start gap-3 ${!n.read ? "bg-blue-50 border border-blue-100" : ""}`}>
              <span className="text-2xl mt-0.5">{TYPE_ICON[n.type] ?? TYPE_ICON.default}</span>
              <div className="flex-1">
                <div className="font-medium text-gray-900">{n.title}</div>
                <div className="text-sm text-gray-600 mt-0.5">{n.body}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(n.created_at).toLocaleString("ko-KR", {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                  })}
                </div>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
