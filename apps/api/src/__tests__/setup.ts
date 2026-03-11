import { vi } from "vitest"

// Mock pg Pool at module level so drizzle-orm uses the mock driver
export const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })

vi.mock("pg", () => {
  class MockPool {
    query = mockQuery
    end = vi.fn().mockResolvedValue(undefined)
    connect = vi.fn().mockResolvedValue({
      query: mockQuery,
      release: vi.fn(),
    })
  }
  return { Pool: MockPool, default: { Pool: MockPool } }
})

// Reset mock between tests to avoid state bleed
beforeEach(() => {
  mockQuery.mockClear()
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 })
})
