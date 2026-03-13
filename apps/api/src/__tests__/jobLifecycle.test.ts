import { describe, it, expect } from "vitest"
import { validateTransition, getValidTransitions } from "../services/jobLifecycle"
import type { JobStatus, ActorRole } from "../services/jobLifecycle"

// ── validateTransition ────────────────────────────────────────────────────────

describe("validateTransition — same status", () => {
  it("returns error when transitioning to same status", () => {
    const r = validateTransition("open", "open", "employer")
    expect(r.ok).toBe(false)
    expect(r.error).toContain("already in status")
  })
})

describe("validateTransition — employer role", () => {
  it("employer can cancel an open job", () => {
    const r = validateTransition("open", "cancelled", "employer")
    expect(r.ok).toBe(true)
    expect(r.triggersPayment).toBeFalsy()
  })

  it("employer can mark in_progress job as completed", () => {
    const r = validateTransition("in_progress", "completed", "employer")
    expect(r.ok).toBe(true)
    expect(r.triggersPayment).toBe(true)
  })

  it("employer can cancel in_progress job", () => {
    const r = validateTransition("in_progress", "cancelled", "employer")
    expect(r.ok).toBe(true)
  })

  it("employer cannot directly set matched from open", () => {
    const r = validateTransition("open", "matched", "employer")
    expect(r.ok).toBe(false)
  })

  it("employer cannot transition draft → open (no transition defined)", () => {
    const r = validateTransition("draft", "open", "employer")
    expect(r.ok).toBe(false)
  })

  it("employer cannot cancel a completed job", () => {
    const r = validateTransition("completed", "cancelled", "employer")
    expect(r.ok).toBe(false)
  })
})

describe("validateTransition — worker role", () => {
  it("worker can complete an in_progress job", () => {
    const r = validateTransition("in_progress", "completed", "worker")
    expect(r.ok).toBe(true)
    expect(r.triggersPayment).toBe(true)
  })

  it("worker cannot cancel an open job", () => {
    const r = validateTransition("open", "cancelled", "worker")
    expect(r.ok).toBe(false)
    expect(r.error).toContain("cannot perform transition")
  })

  it("worker cannot set job to matched", () => {
    const r = validateTransition("open", "matched", "worker")
    expect(r.ok).toBe(false)
  })

  it("worker cannot cancel in_progress job", () => {
    const r = validateTransition("in_progress", "cancelled", "worker")
    expect(r.ok).toBe(false)
  })

  it("worker cannot reopen a cancelled job", () => {
    const r = validateTransition("cancelled", "open", "worker")
    expect(r.ok).toBe(false)
  })
})

describe("validateTransition — system role", () => {
  it("system can set open → matched", () => {
    const r = validateTransition("open", "matched", "system")
    expect(r.ok).toBe(true)
  })

  it("system can set matched → in_progress", () => {
    const r = validateTransition("matched", "in_progress", "system")
    expect(r.ok).toBe(true)
  })

  it("system can complete an in_progress job", () => {
    const r = validateTransition("in_progress", "completed", "system")
    expect(r.ok).toBe(true)
    expect(r.triggersPayment).toBe(true)
  })

  it("system can cancel an open job", () => {
    const r = validateTransition("open", "cancelled", "system")
    expect(r.ok).toBe(true)
  })

  it("system cannot transition from completed → cancelled", () => {
    const r = validateTransition("completed", "cancelled", "system")
    expect(r.ok).toBe(false)
  })
})

describe("validateTransition — triggersPayment flag", () => {
  it("only COMPLETED transition triggers payment", () => {
    const completions: [JobStatus, ActorRole][] = [
      ["in_progress", "worker"],
      ["in_progress", "employer"],
      ["in_progress", "system"],
    ]
    for (const [from, role] of completions) {
      const r = validateTransition(from, "completed", role)
      expect(r.triggersPayment).toBe(true)
    }
  })

  it("non-completion transitions do not trigger payment", () => {
    expect(validateTransition("open", "cancelled", "employer").triggersPayment).toBeFalsy()
    expect(validateTransition("open", "matched", "system").triggersPayment).toBeFalsy()
    expect(validateTransition("matched", "in_progress", "system").triggersPayment).toBeFalsy()
  })
})

// ── getValidTransitions ───────────────────────────────────────────────────────

describe("getValidTransitions", () => {
  it("employer from open can cancel", () => {
    const valid = getValidTransitions("open", "employer")
    expect(valid).toContain("cancelled")
    expect(valid).not.toContain("matched")
    expect(valid).not.toContain("in_progress")
  })

  it("worker from in_progress can complete", () => {
    const valid = getValidTransitions("in_progress", "worker")
    expect(valid).toContain("completed")
    expect(valid).not.toContain("cancelled")
  })

  it("system from open can go to matched or cancelled", () => {
    const valid = getValidTransitions("open", "system")
    expect(valid).toContain("matched")
    expect(valid).toContain("cancelled")
  })

  it("no valid transitions from completed for employer", () => {
    const valid = getValidTransitions("completed", "employer")
    expect(valid).toHaveLength(0)
  })

  it("no valid transitions from cancelled for any role", () => {
    for (const role of ["worker", "employer", "system"] as ActorRole[]) {
      expect(getValidTransitions("cancelled", role)).toHaveLength(0)
    }
  })
})
