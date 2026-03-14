-- Migration: Add last_alert_sent_at to worker_profiles for re-engagement alerts
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMPTZ;
