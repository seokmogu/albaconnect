-- Migration 0018: FCM token for Android/iOS push notifications on worker_profiles

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(255);

COMMENT ON COLUMN worker_profiles.fcm_token IS
  'Firebase Cloud Messaging device token for push notifications; NULL if not registered';
