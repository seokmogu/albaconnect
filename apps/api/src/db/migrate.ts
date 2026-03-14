import fs from "node:fs"
import path from "node:path"
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
    CREATE TABLE IF NOT EXISTS worker_availability (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time VARCHAR(5) NOT NULL,
      end_time VARCHAR(5) NOT NULL,
      timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul',
      valid_from TIMESTAMPTZ NOT NULL,
      valid_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_worker_availability_worker_id ON worker_availability(worker_id)`)

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS worker_blackout (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blackout_date DATE NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_worker_blackout_worker_id ON worker_blackout(worker_id)`)
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_blackout_unique ON worker_blackout(worker_id, blackout_date)`)

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

  await runNotificationsMigration()

  const migrationFiles = [
    path.join(process.cwd(), 'src/db/migrations/0007_admin_suspension.sql'),
    path.join(process.cwd(), 'src/db/migrations/0011_phone_verification.sql'),
  ]
  for (const file of migrationFiles) {
    if (fs.existsSync(file)) {
      await db.execute(sql.raw(fs.readFileSync(file, 'utf8')))
    }
  }

  // Add push_subscription column for Web Push API (nullable jsonb)
  await db.execute(sql`
    ALTER TABLE worker_profiles
    ADD COLUMN IF NOT EXISTS push_subscription jsonb
  `)

  await runDisputeMigration()
  await runCertificationMigration()

  console.log('Migrations completed successfully')
}

export async function runCheckinMigration() {
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS checkin_at TIMESTAMPTZ`)
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS checkout_at TIMESTAMPTZ`)
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(5,2)`)
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS checkin_latitude NUMERIC(9,6)`)
  await db.execute(sql`ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS checkin_longitude NUMERIC(9,6)`)
}

export async function runNotificationsMigration() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      read BOOLEAN DEFAULT FALSE NOT NULL,
      data TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC)`)
}

export async function runCertificationMigration() {
  // Create worker_cert_type enum
  await db.execute(sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'worker_cert_type') THEN
      CREATE TYPE worker_cert_type AS ENUM ('ID_VERIFIED', 'DRIVER_LICENSE', 'FOOD_HANDLER', 'FORKLIFT', 'FIRST_AID');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cert_status') THEN
      CREATE TYPE cert_status AS ENUM ('pending', 'verified', 'expired', 'rejected');
    END IF;
  END $$`)

  // Create worker_certifications table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS worker_certifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type worker_cert_type NOT NULL,
      status cert_status NOT NULL DEFAULT 'pending',
      evidence_url TEXT,
      verified_by UUID REFERENCES users(id),
      verified_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_worker_certs_worker_id ON worker_certifications(worker_id)`)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_worker_certs_status ON worker_certifications(status)`)
}

export async function runDisputeMigration() {
  // Create dispute enums (idempotent)
  await db.execute(sql`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispute_type') THEN
      CREATE TYPE dispute_type AS ENUM ('NOSHOW_DISPUTE', 'PAYMENT_DISPUTE', 'QUALITY_DISPUTE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispute_status') THEN
      CREATE TYPE dispute_status AS ENUM ('open', 'resolved', 'dismissed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dispute_raised_by_role') THEN
      CREATE TYPE dispute_raised_by_role AS ENUM ('worker', 'employer');
    END IF;
  END $$`)

  // Add dispute_hold column to job_postings
  await db.execute(sql`ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS dispute_hold BOOLEAN NOT NULL DEFAULT FALSE`)

  // Create job_disputes table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS job_disputes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID REFERENCES job_postings(id) NOT NULL,
      raised_by_id UUID REFERENCES users(id) NOT NULL,
      raised_by_role dispute_raised_by_role NOT NULL,
      type dispute_type NOT NULL,
      description TEXT NOT NULL,
      status dispute_status NOT NULL DEFAULT 'open',
      resolution_notes TEXT,
      resolved_by UUID REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      resolved_at TIMESTAMP,
      UNIQUE(job_id, raised_by_id, type)
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_disputes_job_id ON job_disputes(job_id)`)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_disputes_raised_by ON job_disputes(raised_by_id)`)
}
