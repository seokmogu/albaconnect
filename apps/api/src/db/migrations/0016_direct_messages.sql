-- Migration 0016: direct messages between employers and workers

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  recipient_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages(job_id, sender_id, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_recipient
  ON messages(recipient_id, read_at);
