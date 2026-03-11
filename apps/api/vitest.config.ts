import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    setupFiles: ["src/__tests__/setup.ts"],
    testTimeout: 10000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost/test",
      JWT_SECRET: "test-secret-minimum-32-chars-here!!",
      COOKIE_SECRET: "test-cookie-secret-32-chars-min!!",
      PORT: "3002",
    },
  },
})
