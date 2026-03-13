import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { workerSockets } from "../services/matching.js"

describe("Socket lifecycle — ping/pong keepalive", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    workerSockets.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    workerSockets.clear()
  })

  function createMockSocket(userId: string) {
    const handlers: Record<string, (...args: unknown[]) => void> = {}
    const socket = {
      data: { userId, role: "worker" },
      emit: vi.fn(),
      disconnect: vi.fn(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler
      }),
      _trigger: (event: string, ...args: unknown[]) => {
        if (handlers[event]) handlers[event](...args)
      },
    }
    return socket
  }

  function simulateConnection(userId: string) {
    const socket = createMockSocket(userId)
    workerSockets.set(userId, "socket-id-" + userId)

    let isAlive = true
    socket.on("pong", () => { isAlive = true })
    const keepAlive = setInterval(() => {
      if (!isAlive) {
        workerSockets.delete(userId)
        clearInterval(keepAlive)
        socket.disconnect(true)
        return
      }
      isAlive = false
      socket.emit("ping")
    }, 30_000)

    socket.on("disconnect", () => {
      clearInterval(keepAlive)
      workerSockets.delete(userId)
    })

    return { socket, keepAlive }
  }

  it("disconnect handler removes worker from workerSockets", () => {
    const { socket } = simulateConnection("user-1")
    expect(workerSockets.has("user-1")).toBe(true)
    socket._trigger("disconnect")
    expect(workerSockets.has("user-1")).toBe(false)
  })

  it("emits ping after 30 seconds", () => {
    const { socket } = simulateConnection("user-2")
    vi.advanceTimersByTime(30_001)
    expect(socket.emit).toHaveBeenCalledWith("ping")
  })

  it("no disconnect when pong is received within interval", () => {
    const { socket } = simulateConnection("user-3")
    // Advance to just before 30s, trigger pong
    vi.advanceTimersByTime(25_000)
    socket._trigger("pong")
    // Advance past 30s — pong was received, isAlive=true, no disconnect
    vi.advanceTimersByTime(10_000)
    expect(socket.disconnect).not.toHaveBeenCalled()
    expect(workerSockets.has("user-3")).toBe(true)
  })

  it("disconnects stale socket after 30s with no pong", () => {
    const { socket } = simulateConnection("user-4")
    // First interval: emit ping, isAlive set to false
    vi.advanceTimersByTime(30_001)
    expect(socket.emit).toHaveBeenCalledWith("ping")
    // Second interval: no pong received → stale → disconnect
    vi.advanceTimersByTime(30_001)
    expect(socket.disconnect).toHaveBeenCalledWith(true)
    expect(workerSockets.has("user-4")).toBe(false)
  })

  it("disconnect clears keepAlive interval (no further pings after disconnect)", () => {
    const { socket } = simulateConnection("user-5")
    socket._trigger("disconnect")
    // Advance well past multiple intervals
    vi.advanceTimersByTime(120_000)
    expect(socket.emit).not.toHaveBeenCalled()
  })
})
