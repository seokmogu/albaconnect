import "dotenv/config"
import { createRestTossClient, type TossPaymentLookup } from "../services/tossClient"

const paymentKey = process.env.TOSS_SMOKE_PAYMENT_KEY
const secretKey = process.env.TOSS_SECRET_KEY
const expectedStatus = process.env.TOSS_SMOKE_EXPECTED_STATUS ?? "DONE"
const expectedAmount = process.env.TOSS_SMOKE_EXPECTED_AMOUNT

function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function main() {
  const key = requireEnv("TOSS_SMOKE_PAYMENT_KEY", paymentKey)
  const secret = requireEnv("TOSS_SECRET_KEY", secretKey)

  const payment: TossPaymentLookup = await createRestTossClient(secret).retrievePayment(key)

  if (payment.status !== expectedStatus) {
    throw new Error(`Unexpected Toss payment status: ${payment.status ?? "unknown"} (expected ${expectedStatus})`)
  }

  if (expectedAmount && payment.totalAmount !== Number(expectedAmount)) {
    throw new Error(`Unexpected Toss payment amount: ${payment.totalAmount ?? "unknown"} (expected ${expectedAmount})`)
  }

  console.log("Toss payment smoke check passed")
  console.log(`paymentKey=${payment.paymentKey ?? key}`)
  console.log(`orderId=${payment.orderId ?? "unknown"}`)
  console.log(`status=${payment.status}`)
  if (typeof payment.totalAmount === "number") console.log(`totalAmount=${payment.totalAmount}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
