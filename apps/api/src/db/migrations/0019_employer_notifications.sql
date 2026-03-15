-- Migration: 0019_employer_notifications
-- Adds notifications table for employer real-time alerts

CREATE TYPE notification_type AS ENUM (
  'application_submitted',
  'application_accepted',
  'application_completed',
  'noshow',
  'payment_completed',
  'noshow_penalty'
);

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  job_id      UUID REFERENCES job_postings(id) ON DELETE SET NULL,
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread  ON notifications(user_id, is_read) WHERE is_read = false;
