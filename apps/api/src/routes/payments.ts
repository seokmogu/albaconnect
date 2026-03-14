import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { db, payments, jobPostings } from "../db"
import { authenticate, requireEmployer } from "../middleware/auth"
import { PLATFORM_FEE_RATE } from "@albaconnect/shared"

const escrowSchema = z.object({
  jobId: z.string().uuid(),
  // Toss Payments key after client-side payment
  tossPaymentKey: z.string().optional(),
})

const payoutSchema = z.object({
  jobId: z.string().uuid(),
})

const webhookSchema = z.object({
  eventType: z.string(),
  data: z.object({
    paymentKey: z.string().optional(),
    orderId: z.string().optional(),
    status: z.string().optional(),
  }),
})

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

    if (process.env.TOSS_SECRET_KEY && tossPaymentKey) {
      // Verify payment with Toss Payments API
      const authHeader = "Basic " + Buffer.from(process.env.TOSS_SECRET_KEY + ":").toString("base64")
      const tossResponse = await fetch(`https://api.tosspayments.com/v1/payments/${tossPaymentKey}`, {
        headers: { Authorization: authHeader },
      })
      const tossData = await tossResponse.json() as { status?: string; orderId?: string }

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

    // Block payout if a NOSHOW_DISPUTE hold is active
    if (job.disputeHold) {
      return reply.status(409).send({
        error: "Payout blocked: active dispute hold. Resolve the dispute first.",
        code: "DISPUTE_HOLD_ACTIVE",
      })
    }

    // TODO: Integrate Toss Payments payout API when bank account setup is available
    return reply.status(202).send({
      message: "Payout queued (bank account setup required)",
      jobId,
    })
  })

  // POST /payments/webhook - Toss Payments webhook handler
  app.post("/payments/webhook", async (request, reply) => {
    // Validate Basic auth from Toss webhook
    const authHeader = request.headers["authorization"] as string | undefined
    const expected = "Basic " + Buffer.from((process.env.TOSS_WEBHOOK_SECRET ?? "") + ":").toString("base64")

    if (process.env.TOSS_WEBHOOK_SECRET && authHeader !== expected) {
      return reply.status(401).send({ error: "Unauthorized webhook" })
    }

    const body = webhookSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid webhook payload" })
    }

    const { eventType, data } = body.data

    try {
      if (data.status === "DONE" && data.paymentKey) {
        // Update payment: escrowStatus=escrowed, tossStatus=DONE
        await db
          .update(payments)
          .set({ tossStatus: "DONE" })
          .where(eq(payments.tossPaymentKey, data.paymentKey))

        // Update job escrow status
        const [existingPayment] = await db
          .select()
          .from(payments)
          .where(eq(payments.tossPaymentKey, data.paymentKey))
          .limit(1)

        if (existingPayment) {
          await db
            .update(jobPostings)
            .set({ escrowStatus: "escrowed", updatedAt: new Date() })
            .where(eq(jobPostings.id, existingPayment.jobId))
        }
      } else if (eventType === "PAYOUT_DONE" && data.paymentKey) {
        // Update payment: payoutAt=now, tossStatus=PAYOUT_DONE
        await db
          .update(payments)
          .set({ payoutAt: new Date(), tossStatus: "PAYOUT_DONE" })
          .where(eq(payments.tossPaymentKey, data.paymentKey))
      }
    } catch (err: unknown) {
      // Handle idempotency: ignore unique constraint violations (duplicate webhook)
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
        // Duplicate - idempotent, return 200
        return reply.status(200).send({ received: true })
      }
      throw err
    }

    return reply.status(200).send({ received: true })
  })
}
