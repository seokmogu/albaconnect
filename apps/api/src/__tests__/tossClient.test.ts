import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createTossClient,
  isMockTossClientMode,
  isTossClientConfigured,
  resolveTossClientMode,
} from "../services/tossClient"

const savedEnv = { ...process.env }

function restoreEnv() {
  process.env = { ...savedEnv }
}

describe("tossClient", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    restoreEnv()
  })

  it("uses REST mode by default and calls Toss payment lookup API", async () => {
    process.env.TOSS_SECRET_KEY = "test_sk_abc"
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ paymentKey: "pay_key_1", orderId: "order-1", status: "DONE" }),
    } as Response)

    const payment = await createTossClient().retrievePayment("pay_key_1")

    expect(payment).toMatchObject({ paymentKey: "pay_key_1", orderId: "order-1", status: "DONE" })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tosspayments.com/v1/payments/pay_key_1",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining("Basic ") }) })
    )
  })

  it("returns deterministic mock payments when TOSS_CLIENT_MODE=mock", async () => {
    process.env.TOSS_CLIENT_MODE = "mock"
    process.env.TOSS_MOCK_PAYMENT_STATUS = "DONE"
    process.env.TOSS_MOCK_ORDER_ID = "mock-order-1"
    process.env.TOSS_MOCK_TOTAL_AMOUNT = "55000"

    const payment = await createTossClient().retrievePayment("pay_mock_1")

    expect(payment).toMatchObject({
      paymentKey: "pay_mock_1",
      orderId: "mock-order-1",
      status: "DONE",
      totalAmount: 55000,
      provider: "mock",
    })
  })

  it("maps TOSS_CLIENT_MODE=mcp to mcp-mock while no runtime MCP tool is attached", async () => {
    process.env.TOSS_CLIENT_MODE = "mcp"

    expect(resolveTossClientMode()).toBe("mcp-mock")
    expect(isTossClientConfigured()).toBe(true)
    expect(isMockTossClientMode()).toBe(true)
    await expect(createTossClient().retrievePaymentByOrderId("order-1")).resolves.toMatchObject({
      orderId: "order-1",
      status: "DONE",
      provider: "mcp-mock",
    })
  })

  it("blocks mock modes in production unless explicitly allowed", () => {
    process.env.NODE_ENV = "production"
    process.env.TOSS_CLIENT_MODE = "mock"

    expect(() => createTossClient()).toThrow(/Mock Toss client/)

    process.env.TOSS_ALLOW_MOCK_CLIENT = "true"
    expect(() => createTossClient()).not.toThrow()
  })
})
