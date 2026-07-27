-- Per-event timezones, step 1 of docs/design/timezones/per-event-timezone-plan.md
--
-- `starts_at` is a timestamptz — an absolute instant — and the app renders it in
-- whatever zone the device is set to. That is wrong for what an event actually
-- means: "dinner at 8" is a WALL CLOCK, and a wall clock is not something an
-- instant can hold. Created in New York and read in Paris, 8pm becomes 2am.
--
-- The instant stays. It is what ordering, range queries and the publish path
-- are built on, and none of that should change. This column adds the second
-- half of the pair: the zone the wall clock was meant in. Together they
-- reconstruct the intended reading exactly.
--
-- NULLABLE ON PURPOSE, AND PERMANENTLY SO.
--
-- Null means "we do not know", and the renderer falls back to the device zone —
-- which is exactly today's behaviour. So this migration is inert: nothing moves
-- on deploy, and no existing row is touched.
--
-- There is deliberately no backfill. For app-created rows there is no record of
-- where they were created, so filling one in would be a guess applied to every
-- historical event at once. For Google-sourced rows — which is nearly all of
-- them here — the record exists in Google, and the pull re-reads it: once the
-- sync records start.timeZone, those rows populate themselves without anyone
-- guessing anything.
--
-- Null is therefore a supported state forever, not a migration window. Events
-- outside the sync window, rows on calendars later disconnected, and anything
-- created before this all stay null indefinitely.
--
-- IANA names only ('Europe/Monaco'), never fixed offsets. An offset is not a
-- zone: New York is GMT-5 in January and GMT-4 in July, so a stored 'GMT-4'
-- would be correct until the clocks changed and quietly wrong for half the year
-- after that. No CHECK constraint enforces this — Postgres cannot validate an
-- IANA name without pg_timezone_names, and a constraint that rejected a zone
-- Google legitimately sent would fail the sync rather than the value.

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS time_zone TEXT;

COMMENT ON COLUMN calendar_events.time_zone IS
  'IANA zone the wall clock was meant in (e.g. Europe/Monaco). NULL means unknown; readers fall back to the viewing device''s zone. Never a fixed offset — offsets change with DST.';
