import { defineConfig } from "drizzle-kit"

// Drizzle config for local schema sync. Not committed by AlbaConnect originally;
// we add it to enable `drizzle-kit push` against the local sim database.
export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/albaconnect",
  },
  strict: false,
  verbose: false,
})
