-- Migration 0012: Add plan_tier to employer_profiles
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'basic', 'premium'));
