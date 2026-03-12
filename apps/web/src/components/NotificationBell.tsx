"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import api from "@/lib/api"
import { useAuthStore } from "@/store/auth"

export default function NotificationBell() {
  const { user } = useAuthStore()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    const fetch = () =>
      api.get("/notifications", { params: { limit: 1 } })
        .then(({ data }) => setUnread(data.unreadCount ?? 0))
        .catch(() => {})

    fetch()
    const interval = setInterval(fetch, 30000) // poll every 30s
    return () => clearInterval(interval)
  }, [user])

  return (
    <Link href="/notifications" className="relative p-1">
      <span className="text-2xl">🔔</span>
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  )
}
