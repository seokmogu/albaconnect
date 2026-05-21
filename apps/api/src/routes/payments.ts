import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { db, payments, jobPostings, users, jobApplications } from "../db"
import { authenticate, requireEmployer } from "../middleware/auth"
import { PLATFORM_FEE_RATE } from "@albaconnect/shared"
import { paymentCompleteAlimTalk } from "../services/kakaoAlimTalk"
import { canReleaseEscrowPayments, payoutReleaseUnavailableResponse } from "../services/payoutSafety"
import { createTossClient, isTossClientConfigured } from "../services/tossClient"
import {
  verifyTossSignature,
  requiresTossSignature,
  verifyPaymentWebhookData,
  recordWebhookEvent,
  handlePaymentStatusChanged,
  handleVirtualAccountDeposit,
  runPaymentReconciliation,
  incrementWebhookCounter,
} from "../services/tossWebhook"

const escrowSchema = z.object({
  jobId: z.string().uuid(),
  // Toss Payments key after client-side payment
  tossPaymentKey: z.string().optional(),
})

const payoutSchema = z.object({
  jobId: z.string().uuid(),
})

const webhookSchema = z.object({
  eventType: z.string().optional(),
  data: z.object({
    paymentKey: z.string().optional(),
    orderId: z.string().optional(),
    status: z.string().optional(),
  }).passthrough().optional(),
  entityBody: z.record(z.string(), z.unknown()).optional(),
  paymentKey: z.string().optional(),
  orderId: z.string().optional(),
  status: z.string().optional(),
  transactionKey: z.string().optional(),
  secret: z.string().optional(),
}).passthrough()

type WebhookData = NonNullable<z.infer<typeof webhookSchema>["data"]>

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.join(",")
  return value
}

function normalizeWebhookPayload(body: unknown): { eventType: string; data: WebhookData } | null {
  const parsed = webhookSchema.safeParse(body)
  if (!parsed.success) return null

  const payload = parsed.data
  const eventType = payload.eventType ?? (payload.orderId && payload.status ? "DEPOSIT_CALLBACK" : undefined)
  if (!eventType) return null

  const topLevelData: WebhookData = {
    paymentKey: payload.paymentKey,
    orderId: payload.orderId,
    status: payload.status,
    transactionKey: payload.transactionKey,
    secret: payload.secret,
  }

  const data = payload.data ?? payload.entityBody ?? topLevelData
  return { eventType, data }
}

export async function paymentRoutes(app: FastifyInstance) {
  // GET /payments - list user's payments
  app.get("/payments", { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user.id

    const userPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.payerId, userId))

    return reply.send({ payments: userPayments })
  })

  // POST /payments/escrow - escrow wages for a job (Toss Payments integration)
  app.post("/payments/escrow", { preHandler: [requireEmployer] }, async (request, reply) => {
    const body = escrowSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed" })
    }

    const { jobId, tossPaymentKey } = body.data
    const employerId = request.user.id

    const [job] = await db
      .select()
      .from(jobPostings)
      .where(and(eq(jobPostings.id, jobId), eq(jobPostings.employerId, employerId)))
      .limit(1)

    if (!job) {
      return reply.status(404).send({ error: "Job not found" })
    }

    if (job.escrowStatus !== "pending") {
      return reply.status(400).send({ error: "Job is already escrowed or payment completed" })
    }

    let tossOrderId: string | undefined
    let tossStatus: string | undefined

    const canVerifyPayment = isTossClientConfigured()
    if (process.env.NODE_ENV === "production" && (!canVerifyPayment || !tossPaymentKey)) {
      return reply.status(503).send({ error: "Toss payment verification is required in production" })
    }

    if (canVerifyPayment && tossPaymentKey) {
      let tossData: { status?: string; orderId?: string }
      try {
        tossData = await createTossClient().retrievePayment(tossPaymentKey)
      } catch {
        return reply.status(402).send({ error: "Payment verification failed" })
      }

      if (tossData.status !== "DONE") {
        return reply.status(402).send({ error: "Payment not confirmed by Toss", tossStatus: tossData.status })
      }

      tossOrderId = tossData.orderId
      tossStatus = tossData.status
    } else {
      console.log("[Payments:dev] Toss verify skipped")
    }

    const platformFee = Math.round(job.totalAmount * PLATFORM_FEE_RATE)
    const totalWithFee = job.totalAmount + platformFee

    const [payment] = await db
      .insert(payments)
      .values({
        jobId,
        payerId: employerId,
        amount: totalWithFee,
        platformFee,
        status: "completed",
        tossPaymentKey: tossPaymentKey ?? `stub_${Date.now()}`,
        tossOrderId,
        tossStatus,
      })
      .returning()

    await db.update(jobPostings).set({ escrowStatus: "escrowed", updatedAt: new Date() }).where(eq(jobPostings.id, jobId))

    return reply.status(201).send({
      payment,
      message: "Wages escrowed successfully",
      breakdown: {
        wages: job.totalAmount,
        platformFee,
        total: totalWithFee,
      },
    })
  })

  // POST /payments/payout - trigger payout to worker
  app.post("/payments/payout", { preHandler: [requireEmployer] }, async (request, reply) => {
    const body = payoutSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed" })
    }

    const { jobId } = body.data
    const employerId = request.user.id

    const [job] = await db
      .select()
      .from(jobPostings)
      .where(and(eq(jobPostings.id, jobId), eq(jobPostings.employerId, employerId)))
      .limit(1)

    if (!job) {
      return reply.status(404).send({ error: "Job not found" })
    }

    // Block payout if an open NOSHOW dispute has placed a hold
    if (job.disputeHold) {
      return reply.status(402).send({
        error: "Payout blocked: an open dispute is under review",
        code: "DISPUTE_HOLD",
      })
    }

    if (!canReleaseEscrowPayments()) {
      return reply.status(503).send(payoutReleaseUnavailableResponse())
    }

    // TODO: Integrate Toss Payments payout API when bank account setup is available
    return reply.status(202).send({
      message: "Payout queued (bank account setup required)",
      jobId,
    })
  })

  // POST /payments/webhook - Toss Payments webhook handler (verification + idempotency)
  app.post(
    "/payments/webhook",
    { config: { rawBody: true } },
    async (request, reply) => {
      // 1. Parse and normalize Toss' wrapped and direct webhook payload shapes.
      const normalized = normalizeWebhookPayload(request.body)
      if (!normalized) {
        return reply.status(400).send({ error: "Invalid webhook payload" })
      }

      const { eventType } = normalized
      let data = normalized.data

      // 2. Signature verification only applies to payout/seller webhooks.
      if (requiresTossSignature(eventType)) {
        const signature = headerValue(request.headers["tosspayments-webhook-signature"])
          ?? headerValue(request.headers["tosssignature"])
          ?? headerValue(request.headers["toss-signature"])
        const transmissionTime = headerValue(request.headers["tosspayments-webhook-transmission-time"])
        const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody
          ?? Buffer.from(JSON.stringify(request.body))

        if (!verifyTossSignature(rawBody, signature, transmissionTime)) {
          incrementWebhookCounter(eventType, "error")
          return reply.status(401).send({ error: "Invalid webhook signature" })
        }
      }

      // 3. General payment webhooks have no signature; verify through Toss API in production.
      try {
        data = await verifyPaymentWebhookData(eventType, data)
      } catch (err: unknown) {
        incrementWebhookCounter(eventType, "error")
        const message = err instanceof Error ? err.message : String(err)
        const statusCode = message.includes("requires paymentKey or orderId") ? 400 : 502
        return reply.status(statusCode).send({ error: "Payment webhook verification failed" })
      }

      // 4. Idempotency: deduplicate by orderKey = eventType + orderId/paymentKey
      const orderKey = `${eventType}:${data.orderId ?? data.paymentKey ?? headerValue(request.headers["tosspayments-webhook-transmission-id"]) ?? Date.now()}`
      const isNew = await recordWebhookEvent(orderKey, eventType, { eventType, data })
      if (!isNew) {
        // Duplicate — already processed
        incrementWebhookCounter(eventType, "skipped")
        return reply.status(200).send({ received: true, duplicate: true })
      }

      // 5. Process event
      try {
        if (eventType === "PAYMENT_STATUS_CHANGED") {
          await handlePaymentStatusChanged(data)
          incrementWebhookCounter(eventType, "processed")
        } else if (eventType === "VIRTUAL_ACCOUNT_DEPOSIT" || eventType === "DEPOSIT_CALLBACK") {
          await handleVirtualAccountDeposit(data)
          incrementWebhookCounter(eventType, "processed")
        } else if (eventType === "PAYOUT_DONE" && data.paymentKey) {
          // Legacy PAYOUT_DONE handler — send KakaoTalk notification
          const [updatedPayment] = await db
            .update(payments)
            .set({ payoutAt: new Date(), tossStatus: "PAYOUT_DONE" })
            .where(eq(payments.tossPaymentKey, data.paymentKey!))
            .returning({ jobId: payments.jobId, amount: payments.amount })

          if (updatedPayment) {
            void (async () => {
              try {
                const [application] = await db
                  .select({ workerId: jobApplications.workerId })
                  .from(jobApplications)
                  .where(and(eq(jobApplications.jobId, updatedPayment.jobId), eq(jobApplications.status, "accepted")))
                  .limit(1)
                const [jobRow] = await db.select({ title: jobPostings.title }).from(jobPostings)
                  .where(eq(jobPostings.id, updatedPayment.jobId)).limit(1)
                const [workerUser] = await db.select({ phone: users.phone }).from(users)
                  .where(eq(users.id, application?.workerId ?? "")).limit(1)
                if (workerUser?.phone && jobRow) {
                  await paymentCompleteAlimTalk({ phone: workerUser.phone, jobTitle: jobRow.title, amount: updatedPayment.amount })
                }
              } catch (e: unknown) {
                console.error("[KakaoAlimTalk] Payment complete notification failed:", (e as Error).message)
              }
            })()
          }
          incrementWebhookCounter(eventType, "processed")
        } else {
          incrementWebhookCounter(eventType, "skipped")
        }
      } catch (err: unknown) {
        incrementWebhookCounter(eventType, "error")
        throw err
      }

      return reply.status(200).send({ received: true })
    }
  )

  // PATCH /payments/admin/reconcile/:id — manual reconcile a specific pending payment
  app.patch("/payments/admin/reconcile/:id", async (request, reply) => {
    const adminKey = request.headers["x-admin-key"] as string | undefined
    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
      return reply.status(401).send({ error: "Unauthorized" })
    }

    const { id } = request.params as { id: string }
    const result = await runPaymentReconciliation(false)
    return reply.send({ id, reconciliation: result })
  })
}
