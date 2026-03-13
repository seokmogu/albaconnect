/**
 * AlbaConnect Job Lifecycle — Status State Machine
 *
 * Valid transitions:
 *   employer: open → cancelled
 *   system:   open → matched (via matching engine)
 *   system:   matched → in_progress (when job start time passes)
 *   worker:   in_progress → completed
 *   employer: in_progress → completed
 *   system:   completed → paid (via payment trigger)
 *
 * Role-based guards:
 *   - worker:   can advance in_progress → completed
 *   - employer: can advance in_progress → completed, open → cancelled
 *   - system:   any transition
 */

export type JobStatus = "draft" | "open" | "matched" | "in_progress" | "completed" | "cancelled"
export type ActorRole = "worker" | "employer" | "system"

interface Transition {
  from: JobStatus[]
  to: JobStatus
  allowedRoles: ActorRole[]
}

const TRANSITIONS: Transition[] = [
  { from: ["open"],        to: "cancelled",   allowedRoles: ["employer", "system"] },
  { from: ["open"],        to: "matched",     allowedRoles: ["system"] },
  { from: ["matched"],     to: "in_progress", allowedRoles: ["system"] },
  { from: ["in_progress"], to: "completed",   allowedRoles: ["worker", "employer", "system"] },
  { from: ["in_progress"], to: "cancelled",   allowedRoles: ["employer", "system"] },
  { from: ["completed"],   to: "cancelled",   allowedRoles: [] }, // disallowed after complete
]

export interface TransitionResult {
  ok: boolean
  error?: string
  triggersPayment?: boolean
}

export function validateTransition(
  currentStatus: JobStatus,
  targetStatus: JobStatus,
  role: ActorRole
): TransitionResult {
  if (currentStatus === targetStatus) {
    return { ok: false, error: `Job is already in status '${targetStatus}'` }
  }

  const transition = TRANSITIONS.find(
    (t) => t.from.includes(currentStatus) && t.to === targetStatus
  )

  if (!transition) {
    return {
      ok: false,
      error: `Transition from '${currentStatus}' to '${targetStatus}' is not allowed`,
    }
  }

  if (!transition.allowedRoles.includes(role)) {
    return {
      ok: false,
      error: `Role '${role}' cannot perform transition from '${currentStatus}' to '${targetStatus}'`,
    }
  }

  return {
    ok: true,
    triggersPayment: targetStatus === "completed",
  }
}

/**
 * Returns all valid next statuses for a given current status and role.
 */
export function getValidTransitions(currentStatus: JobStatus, role: ActorRole): JobStatus[] {
  return TRANSITIONS
    .filter((t) => t.from.includes(currentStatus) && t.allowedRoles.includes(role))
    .map((t) => t.to)
}
