import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

export const db = drizzle(pool, { schema })
export { pool }
export * from "./schema"

// Re-export employerFavorites explicitly for route imports
export { employerFavorites } from "./schema"
