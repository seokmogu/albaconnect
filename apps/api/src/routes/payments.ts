import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and } from "drizzle-orm"
import { db, payments, jobPostings } from "../db"
import { authenticate, requireEmployer } from "../middleware/auth"
import { PLATFORM_FEE_RATE } from "@albaconnect/shared"

const escrowSchema = z.object({
  jobId: z.string().uuid(),
  // In production: Toss Payments key after client-side payment
  tossPaymentKey: z.string().optional(),
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

  // POST /payments/escrow - escrow wages for a job (stub for Toss Payments)
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

    const platformFee = Math.round(job.totalAmount * PLATFORM_FEE_RATE)
    const totalWithFee = job.totalAmount + platformFee

    // In production: verify payment with Toss Payments API
    // const tossResponse = await fetch(`https://api.tosspayments.com/v1/payments/${tossPaymentKey}`, {
    //   headers: { Authorization: `Basic ${Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString("base64")}` }
    // })

    // Stub: mark as escrowed
    const [payment] = await db
      .insert(payments)
      .values({
        jobId,
        payerId: employerId,
        amount: totalWithFee,
        platformFee,
        status: "completed",
        tossPaymentKey: tossPaymentKey ?? `stub_${Date.now()}`,
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
}
