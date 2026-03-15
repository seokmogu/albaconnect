-- Migration 0020: Toss Payments webhook event idempotency log

CREATE TABLE IF NOT EXISTS toss_webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_key     VARCHAR(200) NOT NULL,
  event_type    VARCHAR(100) NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT toss_webhook_events_order_key_unique UNIQUE (order_key)
);

COMMENT ON TABLE toss_webhook_events IS
  'Idempotency log for Toss Payments webhook events. ON CONFLICT on order_key prevents double-processing.';

CREATE INDEX IF NOT EXISTS idx_toss_webhook_events_created_at
  ON toss_webhook_events (created_at DESC);
