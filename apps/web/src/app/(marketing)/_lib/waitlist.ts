// @MX:NOTE: Waitlist submit stub — resolves OK after 600ms. Replace with real API call in Phase 1.5.
// @MX:TODO: Wire up POST /api/waitlist with real Fastify endpoint before beta launch.

export type WaitlistRole = "employer" | "worker"

export interface WaitlistPayload {
  role: WaitlistRole
  email: string
  phone?: string
  region: string
  consent: boolean
}

export interface WaitlistResult {
  ok: boolean
  message?: string
}

export async function submitWaitlist(payload: WaitlistPayload): Promise<WaitlistResult> {
  // Stub: simulates a 600ms network round-trip
  await new Promise<void>((resolve) => setTimeout(resolve, 600))

  // In production, replace with:
  // const res = await fetch("/api/waitlist", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(payload),
  // })
  // if (!res.ok) throw new Error("API error")
  // return res.json()

  void payload // suppress unused-variable lint until real impl
  return { ok: true }
}
