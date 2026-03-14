-- Migration: 0014_employer_favorites
-- Adds employer_favorites table for worker shortlist (re-hire bookmarks)

CREATE TABLE IF NOT EXISTS employer_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT employer_favorites_employer_worker_uniq UNIQUE (employer_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_employer_favorites_employer
  ON employer_favorites (employer_id, created_at DESC);
