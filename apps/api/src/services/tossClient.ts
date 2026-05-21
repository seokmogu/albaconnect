export type TossClientMode = "rest" | "mock" | "mcp-mock"

export interface TossPaymentLookup {
  paymentKey?: string
  orderId?: string
  status?: string
  totalAmount?: number
  cancels?: Array<{ cancelAmount?: number; cancelReason?: string }>
  [key: string]: unknown
}

export interface TossClient {
  readonly mode: TossClientMode
  retrievePayment(paymentKey: string): Promise<TossPaymentLookup>
  retrievePaymentByOrderId(orderId: string): Promise<TossPaymentLookup>
}

interface TossClientOptions {
  env?: NodeJS.ProcessEnv
  secretKey?: string
}

const MOCK_MODES = new Set(["mock", "mcp", "mcp-mock"])

export function resolveTossClientMode(env: NodeJS.ProcessEnv = process.env): TossClientMode {
  const mode = (env.TOSS_CLIENT_MODE ?? "rest").toLowerCase()
  if (mode === "mock") return "mock"
  if (mode === "mcp" || mode === "mcp-mock") return "mcp-mock"
  return "rest"
}

export function isMockTossClientMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return MOCK_MODES.has((env.TOSS_CLIENT_MODE ?? "").toLowerCase())
}

export function isTossClientConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveTossClientMode(env) !== "rest" || Boolean(env.TOSS_SECRET_KEY)
}

export class RestTossClient implements TossClient {
  readonly mode = "rest" as const

  constructor(private readonly secretKey = process.env.TOSS_SECRET_KEY) {}

  async retrievePayment(paymentKey: string): Promise<TossPaymentLookup> {
    return this.fetchPayment(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`)
  }

  async retrievePaymentByOrderId(orderId: string): Promise<TossPaymentLookup> {
    return this.fetchPayment(`https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent(orderId)}`)
  }

  private async fetchPayment(url: string): Promise<TossPaymentLookup> {
    if (!this.secretKey) {
      throw new Error("TOSS_SECRET_KEY is required for Toss REST client")
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString("base64")}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Toss payment lookup failed: ${response.status}`)
    }

    return await response.json() as TossPaymentLookup
  }
}

export class MockTossClient implements TossClient {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    readonly mode: TossClientMode = "mock"
  ) {
    this.assertAllowed()
  }

  async retrievePayment(paymentKey: string): Promise<TossPaymentLookup> {
    return this.mockPayment({ paymentKey })
  }

  async retrievePaymentByOrderId(orderId: string): Promise<TossPaymentLookup> {
    return this.mockPayment({ orderId })
  }

  private assertAllowed(): void {
    if (this.env.NODE_ENV === "production" && this.env.TOSS_ALLOW_MOCK_CLIENT !== "true") {
      throw new Error("Mock Toss client is not allowed in production")
    }
  }

  private mockPayment(input: { paymentKey?: string; orderId?: string }): TossPaymentLookup {
    if (this.env.TOSS_MOCK_PAYMENT_FAIL === "true") {
      throw new Error("Mock Toss payment lookup failed")
    }

    if (this.env.TOSS_MOCK_PAYMENT_JSON) {
      return JSON.parse(this.env.TOSS_MOCK_PAYMENT_JSON) as TossPaymentLookup
    }

    const orderSeed = input.orderId ?? input.paymentKey ?? "payment"
    const paymentSeed = input.paymentKey ?? input.orderId ?? "payment"
    const amount = this.env.TOSS_MOCK_TOTAL_AMOUNT ? Number(this.env.TOSS_MOCK_TOTAL_AMOUNT) : undefined

    return {
      paymentKey: this.env.TOSS_MOCK_PAYMENT_KEY ?? (input.paymentKey ?? `mock_payment_${paymentSeed}`),
      orderId: this.env.TOSS_MOCK_ORDER_ID ?? (input.orderId ?? `mock_order_${orderSeed}`),
      status: this.env.TOSS_MOCK_PAYMENT_STATUS ?? "DONE",
      totalAmount: Number.isFinite(amount) ? amount : undefined,
      provider: this.mode,
    }
  }
}

export function createTossClient(options: TossClientOptions = {}): TossClient {
  const env = options.env ?? process.env
  const mode = resolveTossClientMode(env)
  if (mode === "mock" || mode === "mcp-mock") {
    return new MockTossClient(env, mode)
  }
  return new RestTossClient(options.secretKey ?? env.TOSS_SECRET_KEY)
}

export function createRestTossClient(secretKey = process.env.TOSS_SECRET_KEY): TossClient {
  return new RestTossClient(secretKey)
}
