-- Migration 0018: Add reviewer_role column to reviews table
-- Adds verified reviewer_role for bi-directional review system.
-- Backfills existing rows using the reviewer's actual user role.

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS reviewer_role user_role;

-- Backfill existing rows
UPDATE reviews r
SET reviewer_role = u.role
FROM users u
WHERE u.id = r.reviewer_id
  AND r.reviewer_role IS NULL;

-- Now enforce NOT NULL (all rows should be populated after backfill)
ALTER TABLE reviews
  ALTER COLUMN reviewer_role SET NOT NULL;

-- Ensure unique constraint exists (prevent duplicate reviews per job per reviewer)
DO $$ BEGIN
  ALTER TABLE reviews ADD CONSTRAINT reviews_job_id_reviewer_id_unique UNIQUE (job_id, reviewer_id);
EXCEPTION WHEN duplicate_table THEN null;
END $$;
