"use client"

import { useEffect, useRef } from "react"
import { io, Socket } from "socket.io-client"
import { useAuthStore } from "@/store/auth"
import type { JobOfferEvent } from "@albaconnect/shared"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

let globalSocket: Socket | null = null

export function useSocket() {
  const { accessToken, user } = useAuthStore()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!accessToken || !user) return

    if (!globalSocket || !globalSocket.connected) {
      globalSocket = io(API_URL, {
        auth: { token: accessToken },
        transports: ["websocket"],
      })

      globalSocket.on("connect", () => console.log("[Socket] Connected"))
      globalSocket.on("disconnect", () => console.log("[Socket] Disconnected"))
      globalSocket.on("connect_error", (err) => console.error("[Socket] Error:", err.message))
    }

    socketRef.current = globalSocket

    return () => {
      // Don't disconnect on unmount - keep global connection alive
    }
  }, [accessToken, user])

  return socketRef.current
}

export function useJobOfferListener(
  onOffer: (offer: JobOfferEvent) => void,
  onCancelled?: (data: { jobId: string }) => void
) {
  const socket = useSocket()

  useEffect(() => {
    if (!socket) return

    socket.on("job_offer", onOffer)
    if (onCancelled) socket.on("job_offer_cancelled", onCancelled)

    return () => {
      socket.off("job_offer", onOffer)
      if (onCancelled) socket.off("job_offer_cancelled", onCancelled)
    }
  }, [socket, onOffer, onCancelled])
}

export function sendLocationUpdate(lat: number, lng: number) {
  globalSocket?.emit("update_location", { lat, lng })
}
