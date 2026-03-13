import { FastifyInstance } from "fastify"
import { Server } from "socket.io"
import { createServer } from "http"
import { db, workerProfiles } from "../db"
import { eq } from "drizzle-orm"
import { workerSockets, setSocketServer, handleAcceptOffer, handleRejectOffer } from "../services/matching"
import { sql } from "drizzle-orm"

export async function setupSocketIO(app: FastifyInstance, httpServer: ReturnType<typeof createServer>) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.WEB_URL ?? "http://localhost:3000",
      credentials: true,
    },
  })

  setSocketServer(io)

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token ?? socket.handshake.headers.authorization?.replace("Bearer ", "")
      if (!token) return next(new Error("Authentication required"))

      const payload = app.jwt.verify<{ id: string; role: string }>(token)
      socket.data.userId = payload.id
      socket.data.role = payload.role
      next()
    } catch {
      next(new Error("Invalid token"))
    }
  })

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string
    const role = socket.data.role as string

    console.log(`[Socket] Connected: ${userId} (${role})`)

    // Register socket
    workerSockets.set(userId, socket.id)

    // Worker: update location in real-time
    socket.on("update_location", async ({ lat, lng }: { lat: number; lng: number }) => {
      if (role !== "worker") return

      await db.execute(sql`
        UPDATE worker_profiles 
        SET 
          location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          last_seen_at = NOW()
        WHERE user_id = ${userId}
      `)
    })

    // Worker: accept job offer
    socket.on("accept_offer", async ({ applicationId }: { applicationId: string }) => {
      if (role !== "worker") return

      const result = await handleAcceptOffer(applicationId, userId)
      socket.emit("offer_response", result)
    })

    // Worker: reject job offer
    socket.on("reject_offer", async ({ applicationId }: { applicationId: string }) => {
      if (role !== "worker") return

      await handleRejectOffer(applicationId, userId)
      socket.emit("offer_response", { success: true, message: "Offer rejected" })
    })

    // Ping/pong keepalive — detect stale connections
    let isAlive = true
    socket.on("pong", () => { isAlive = true })
    const keepAlive = setInterval(() => {
      if (!isAlive) {
        console.log(`[Socket] Stale connection detected for ${userId}, disconnecting`)
        workerSockets.delete(userId)
        clearInterval(keepAlive)
        socket.disconnect(true)
        return
      }
      isAlive = false
      socket.emit("ping")
    }, 30_000)

    // Consolidated disconnect handler — clears interval and map entry
    socket.on("disconnect", () => {
      clearInterval(keepAlive)
      workerSockets.delete(userId)
      console.log(`[Socket] Disconnected: ${userId}`)
    })
  })

  return io
}
