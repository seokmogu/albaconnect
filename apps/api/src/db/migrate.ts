import { sql } from "drizzle-orm"
import { db, pool } from "./index"

export async function runMigrations() {
  console.log("Running database migrations...")

  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`)

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('employer', 'worker');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `)

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE job_status AS ENUM ('draft', 'open', 'matched', 'in_progress', 'completed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `)

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE escrow_status AS ENUM ('pending', 'escrowed', 'released', 'refunded');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `)

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE application_status AS ENUM ('offered', 'accepted', 'rejected', 'timeout', 'completed', 'noshow');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `)

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE penalty_type AS ENUM ('worker_noshow', 'employer_noshow', 'employer_cancel_late');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `)

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role user_role NOT NULL,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS employer_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id),
      company_name VARCHAR(200) NOT NULL,
      business_number VARCHAR(20),
      rating_avg DECIMAL(3,2) DEFAULT 0 NOT NULL,
      rating_count INTEGER DEFAULT 0 NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS worker_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id),
      categories TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL,
      bio TEXT,
      rating_avg DECIMAL(3,2) DEFAULT 0 NOT NULL,
      rating_count INTEGER DEFAULT 0 NOT NULL,
      is_available BOOLEAN DEFAULT FALSE NOT NULL,
      location GEOMETRY(Point, 4326),
      last_seen_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `)

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_worker_location ON worker_profiles USING GIST(location)`)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_worker_available ON worker_profiles(is_available) WHERE is_available = TRUE`)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_postings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employer_id UUID REFERENCES users(id) NOT NULL,
      title VARCHAR(200) NOT NULL,
      category VARCHAR(100) NOT NULL,
      start_at TIMESTAMP NOT NULL,
      end_at TIMESTAMP NOT NULL,
      hourly_rate INTEGER NOT NULL,
      total_amount INTEGER NOT NULL,
      headcount INTEGER DEFAULT 1 NOT NULL,
      matched_count INTEGER DEFAULT 0 NOT NULL,
      location GEOMETRY(Point, 4326) NOT NULL,
      address VARCHAR(500) NOT NULL,
      description TEXT NOT NULL,
      status job_status DEFAULT 'open' NOT NULL,
      escrow_status escrow_status DEFAULT 'pending' NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `)

  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_location ON job_postings USING GIST(location)`)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_status ON job_postings(status)`)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID REFERENCES job_postings(id) NOT NULL,
      worker_id UUID REFERENCES users(id) NOT NULL,
      status application_status DEFAULT 'offered' NOT NULL,
      offered_at TIMESTAMP DEFAULT NOW() NOT NULL,
      responded_at TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID REFERENCES job_postings(id) NOT NULL,
      payer_id UUID REFERENCES users(id) NOT NULL,
      amount INTEGER NOT NULL,
      platform_fee INTEGER NOT NULL,
      status payment_status DEFAULT 'pending' NOT NULL,
      toss_payment_key VARCHAR(200),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS penalties (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID REFERENCES job_postings(id) NOT NULL,
      from_user_id UUID REFERENCES users(id) NOT NULL,
      to_user_id UUID REFERENCES users(id) NOT NULL,
      type penalty_type NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status payment_status DEFAULT 'pending' NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID REFERENCES job_postings(id) NOT NULL,
      reviewer_id UUID REFERENCES users(id) NOT NULL,
      reviewee_id UUID REFERENCES users(id) NOT NULL,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(job_id, reviewer_id)
    )
  `)

  console.log("Migrations completed successfully")
}
