-- Add unique index on external_id so upsert (ON CONFLICT) works for Google/TripIt sync
-- Partial index: only enforces uniqueness when external_id is not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external_id_unique
  ON calendar_events(external_id)
  WHERE external_id IS NOT NULL;
