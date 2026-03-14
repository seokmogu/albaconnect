ALTER TABLE payments ADD COLUMN IF NOT EXISTS toss_order_id VARCHAR(100);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS toss_status VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payout_at TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS payments_toss_order_id_unique ON payments(toss_order_id) WHERE toss_order_id IS NOT NULL;
