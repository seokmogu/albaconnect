-- Add unique constraint on (worker_id, day_of_week) to enable atomic upserts
ALTER TABLE worker_availability
  ADD CONSTRAINT worker_availability_worker_day_unique UNIQUE (worker_id, day_of_week);
