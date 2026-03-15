-- Migration 0021: Geofence enforcement for worker check-in

-- Add location_lat/lon + enforcement columns to job_postings
ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS location_lat  NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS location_lon  NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS checkin_radius_meters  INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS location_enforcement   BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN job_postings.location_lat IS 'Latitude for geofence centre (WGS-84). NULL = no geofence.';
COMMENT ON COLUMN job_postings.location_lon IS 'Longitude for geofence centre (WGS-84). NULL = no geofence.';
COMMENT ON COLUMN job_postings.checkin_radius_meters IS 'Allowed check-in radius in metres (default 300).';
COMMENT ON COLUMN job_postings.location_enforcement IS 'Admin override: false disables geofence for this job.';

-- Add distance audit column to job_applications
ALTER TABLE job_applications
  ADD COLUMN IF NOT EXISTS checkin_distance_meters INTEGER;

COMMENT ON COLUMN job_applications.checkin_distance_meters IS 'Haversine distance in metres from job location at check-in time. NULL when job has no geofence.';
