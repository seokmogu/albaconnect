-- Migration: add check-in/check-out columns to job_applications
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS checkin_at TIMESTAMPTZ;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS checkout_at TIMESTAMPTZ;
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(5,2);
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS checkin_latitude NUMERIC(9,6);
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS checkin_longitude NUMERIC(9,6);
