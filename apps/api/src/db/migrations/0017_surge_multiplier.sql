-- Migration 0017: surge_multiplier for dynamic pricing on job_postings

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS surge_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00;

COMMENT ON COLUMN job_postings.surge_multiplier IS
  'Dynamic surge pricing multiplier (1.00 = base rate, max 2.00)';
