-- Auto-publish pipeline columns on social_posts (Workstream B)
-- Run in: Supabase Dashboard → SQL Editor
--
--   media_dropbox_path — path of the source media in the Dropbox "Ready to Post"
--                        folder; the publisher mints a fresh temporary link from
--                        this at publish time (media_url stays a human preview link).
--   publish_mode       — 'auto' (app publishes via the IG Graph API) or 'notify'
--                        (app emails a ready-to-post reminder). Defaults to 'notify'.
--   publish_status     — worker state machine: pending → processing → published/failed.
--   ig_container_id    — IG media container id (created, then polled to FINISHED).
--   ig_media_id        — published IG media id (set once, guards against double-publish).
--   ig_permalink       — public URL of the published post.
--   publish_error      — last failure reason, surfaced in the UI and notification.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS media_dropbox_path text,
  ADD COLUMN IF NOT EXISTS publish_mode text
    CHECK (publish_mode IN ('auto', 'notify')) DEFAULT 'notify',
  ADD COLUMN IF NOT EXISTS publish_status text
    CHECK (publish_status IN ('pending', 'processing', 'published', 'failed')),
  ADD COLUMN IF NOT EXISTS ig_container_id text,
  ADD COLUMN IF NOT EXISTS ig_media_id text,
  ADD COLUMN IF NOT EXISTS ig_permalink text,
  ADD COLUMN IF NOT EXISTS publish_error text;
