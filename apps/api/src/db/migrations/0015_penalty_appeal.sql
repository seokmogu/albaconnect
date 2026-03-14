-- Migration 0015: Add appeal flow to penalties table
-- Adds appeal_status, appeal_note, appeal_submitted_at, and admin_appeal_note

DO $$ BEGIN
  CREATE TYPE penalty_appeal_status AS ENUM ('none', 'pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE penalties
  ADD COLUMN IF NOT EXISTS appeal_status penalty_appeal_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS appeal_note text,
  ADD COLUMN IF NOT EXISTS appeal_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_appeal_note text;
