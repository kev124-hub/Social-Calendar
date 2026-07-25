-- Publisher worker support (Workstream B, Stage B4)
-- Run in: Supabase Dashboard → SQL Editor
--
-- After applying, run  NOTIFY pgrst, 'reload schema';  in the SQL editor.
-- PostgREST caches the table schema, and writes to new columns fail with
-- "could not find the column ... in the schema cache" until it reloads. This
-- bit us during B2, where post saves silently failed.

-- ---------------------------------------------------------------------------
-- 1. Worker bookkeeping on social_posts
-- ---------------------------------------------------------------------------
--   publish_locked_at       — cooperative lease. A worker claims a post by
--                             compare-and-swapping this to now(); a lease older
--                             than the TTL is considered abandoned and can be
--                             stolen, so a crashed run can't wedge a post
--                             forever. Cleared when the post reaches a terminal
--                             state or is handed back to 'pending'.
--   publish_attempts        — container-creation attempts. The worker allows one
--                             automatic retry (2 attempts total) before failing
--                             the post and emailing, so a missed post is never
--                             silent.
--   ig_container_created_at — when the current IG container was created. Needed
--                             to detect a container stuck IN_PROGRESS: the row's
--                             updated_at is bumped by every lease renewal and so
--                             cannot measure container age.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS publish_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ig_container_created_at timestamptz;

-- The worker's selection query, every 5 minutes, forever. Partial index keeps it
-- to the handful of rows that are actually auto-publish candidates.
CREATE INDEX IF NOT EXISTS idx_social_posts_publish_queue
  ON social_posts (scheduled_at)
  WHERE publish_mode = 'auto' AND stage = 'scheduled';

-- ---------------------------------------------------------------------------
-- 2. app_credentials — server-only store for rotating secrets
-- ---------------------------------------------------------------------------
-- Resolves HANDOFF.md Open Question #2 (app_credentials table vs. env rotation)
-- in favour of the table. The Instagram long-lived user token expires in ~60
-- days and the worker refreshes it unattended; a Vercel env var cannot be
-- rewritten by the running app, so env-only storage would require Kevin to
-- manually rotate a secret every two months or auto-publish silently stops.
--
-- Read precedence in the app: this table first, INSTAGRAM_USER_ACCESS_TOKEN env
-- var as the bootstrap/fallback. The first successful refresh writes here, and
-- the DB value wins from then on.

CREATE TABLE IF NOT EXISTS app_credentials (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_credentials IS
  'Server-only rotating secrets (e.g. instagram_user_access_token). Service-role access only — never expose to the browser.';

-- RLS on with DELIBERATELY NO POLICIES. Unlike the app's data tables (which have
-- an "auth_all" policy for the authenticated role), nothing here should ever be
-- readable by a browser session: the anon/authenticated roles must see zero
-- rows. The service-role key used by the cron worker bypasses RLS, so the worker
-- still has full access. Do not add an "auth_all" policy to this table.
ALTER TABLE app_credentials ENABLE ROW LEVEL SECURITY;

-- CREATE TRIGGER has no IF NOT EXISTS, so drop first to keep this file re-runnable.
DROP TRIGGER IF EXISTS trg_app_credentials_updated_at ON app_credentials;
CREATE TRIGGER trg_app_credentials_updated_at
  BEFORE UPDATE ON app_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
