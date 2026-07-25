-- Notify-to-post fallback (Workstream B, Stage B5)
-- Run in: Supabase Dashboard → SQL Editor
--
-- After applying, run  NOTIFY pgrst, 'reload schema';  in the SQL editor.
-- PostgREST caches the table schema, and writes to new columns fail with
-- "could not find the column ... in the schema cache" until it reloads.

-- ---------------------------------------------------------------------------
-- notified_at on social_posts
-- ---------------------------------------------------------------------------
-- When the "time to post this" email was sent for this post.
--
-- This is the idempotency marker for the notify worker: the cron runs every 5
-- minutes, so without a durable record of the send, every due notify-mode post
-- would email Kevin 288 times a day. NULL means "not yet notified".
--
-- Deliberately a new column rather than a reuse of notification_at /
-- notification_method (added in 001): those describe *when and how to notify*
-- and are dead — no code has ever read or written them — whereas this records
-- *that we did*. Overloading a field whose name means the opposite would be a
-- trap for the next reader.
--
-- Cleared by the app when a post is rescheduled into the future, so a post that
-- slipped gets a fresh reminder at its new time (see PostDialog).

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

COMMENT ON COLUMN social_posts.notified_at IS
  'When the notify-to-post email was sent. NULL = not yet notified. Cleared on reschedule.';

-- The notify worker's selection query, every 5 minutes, forever. Mirrors the
-- publish queue index from 006, for the other publish_mode.
CREATE INDEX IF NOT EXISTS idx_social_posts_notify_queue
  ON social_posts (scheduled_at)
  WHERE publish_mode = 'notify' AND stage = 'scheduled' AND notified_at IS NULL;
