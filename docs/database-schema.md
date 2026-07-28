# Database Schema

Full schema for the Social Calendar app. All tables live in Supabase (PostgreSQL).

---

## users
Managed by Supabase Auth. Single user (Kevin). No custom users table needed — use `auth.users`.

---

## calendars
Connected calendar sources plus app-native calendar.

```sql
CREATE TABLE calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  source TEXT NOT NULL CHECK (source IN ('app', 'google', 'tripit', 'icloud')),
  external_id TEXT,           -- Google calendar ID, TripIt calendar ID, etc.
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## calendar_events
App-native events plus cached events from external calendars.

**`starts_at` is an instant; `time_zone` is what makes it a wall clock.**
`starts_at` is a `timestamptz`, so on its own it renders in whatever zone the
device is set to — a dinner created as 8pm in Monaco reads as 2pm in New York.
`time_zone` (IANA name, never a fixed offset — offsets move with DST) records the
zone the time was *meant* in, and every render and bucketing site reads the pair.

**A null `time_zone` means "unknown" and falls back to the device zone**, which is
exactly the pre-008 behaviour. That is a **permanently supported path**, not a
migration window: rows outside the 30/90-day sync window, rows on calendars later
disconnected, and app rows predating 008 are all null indefinitely.

**All-day rows sit at midnight in their OWN zone** — not UTC midnight, and not
device-local midnight. `ends_at` is that day's last second in the same zone.
Google's all-day `end.date` is *exclusive* and is decremented on the way in.

See `docs/design/timezones/per-event-timezone-plan.md` for the full design and the
three all-day off-by-ones it fixed.

```sql
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id UUID REFERENCES calendars(id) ON DELETE CASCADE,
  external_id TEXT,           -- ID from Google/TripIt (null for app-native)
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,
  time_zone TEXT,             -- IANA zone the wall clock was meant in (migration 008)
  notification_at TIMESTAMPTZ,
  notification_method TEXT CHECK (notification_method IN ('email', 'push', 'both')),
  source TEXT NOT NULL CHECK (source IN ('app', 'google', 'tripit', 'icloud')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## social_posts
Content pipeline — tracks posts from idea to published.

```sql
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'linkedin')),
  post_type TEXT CHECK (post_type IN ('reel', 'carousel', 'story', 'static', 'video', 'article')),
  stage TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN ('idea', 'scripted', 'shot', 'editing', 'scheduled', 'published')),
  title TEXT,
  caption TEXT,
  hashtags TEXT,
  media_url TEXT,             -- Dropbox or Google Drive link
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  notes TEXT,
  notification_at TIMESTAMPTZ,
  notification_method TEXT CHECK (notification_method IN ('email', 'push', 'both')),
  promoted_from_idea UUID REFERENCES ideas(id),
  -- Auto-publish pipeline (migration 005_publishing.sql)
  media_dropbox_path TEXT,    -- path in the Dropbox "Ready to Post" folder; source of truth for publishing
  publish_mode TEXT CHECK (publish_mode IN ('auto', 'notify')) DEFAULT 'notify',
  publish_status TEXT CHECK (publish_status IN ('pending', 'processing', 'published', 'failed')),
  ig_container_id TEXT,       -- IG media container id (created, then polled to FINISHED)
  ig_media_id TEXT,           -- published IG media id (guards against double-publish)
  ig_permalink TEXT,          -- public URL once published
  publish_error TEXT,         -- last failure reason
  -- Publisher worker bookkeeping (migration 006_publish_worker.sql)
  publish_locked_at TIMESTAMPTZ,          -- cooperative lease; a stale lease can be stolen
  publish_attempts INTEGER NOT NULL DEFAULT 0,  -- container-creation attempts (max 2: initial + one retry)
  ig_container_created_at TIMESTAMPTZ,    -- container age, for stuck-ingest detection
  -- Per-event timezones (migration 008_event_timezone.sql)
  -- Notify-to-post (migration 007_notify_to_post.sql)
  notified_at TIMESTAMPTZ,                -- when the "time to post this" email went out; NULL = not yet
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## app_credentials
Server-only rotating secrets (migration `006_publish_worker.sql`). Currently holds
the Instagram long-lived access token, which the publish cron refreshes unattended
when fewer than 10 days remain — a Vercel env var can't be rewritten by the running
app, so the token has to live somewhere writable.

Read precedence in the app: this table first, then the
`INSTAGRAM_USER_ACCESS_TOKEN` env var as the bootstrap value. The first successful
refresh writes the row, and the row wins from then on.

```sql
CREATE TABLE app_credentials (
  key        TEXT PRIMARY KEY,   -- e.g. 'instagram_user_access_token'
  value      TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**RLS is enabled with deliberately NO policies.** Every other table has an
`auth_all` policy for the `authenticated` role; this one must not. The
anon/authenticated roles should see zero rows — only the service-role key (which
bypasses RLS) reads it, from the cron worker. Do not add an `auth_all` policy here.

---

## ugc_projects
UGC brand deal tracker — full pipeline from lead to paid.

```sql
CREATE TABLE ugc_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name TEXT NOT NULL,
  contact_name TEXT,
  stage TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN (
    'lead', 'pitched', 'negotiating', 'contract_signed',
    'shooting', 'delivered', 'invoice_sent', 'paid'
  )),
  rate NUMERIC(10, 2),
  payment_method TEXT,        -- PayPal, bank transfer, check, etc.
  deliverables TEXT,
  deadline DATE,
  brief_text TEXT,
  brief_url TEXT,             -- link to brief doc
  notes TEXT,
  notification_at TIMESTAMPTZ,
  notification_method TEXT CHECK (notification_method IN ('email', 'push', 'both')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## inspirations
Inspiration board items — moodboard/gallery.

```sql
CREATE TABLE inspirations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('image', 'video_link', 'url_clip', 'text_note', 'file_link')),
  title TEXT,
  source_url TEXT,            -- original URL clipped from
  image_path TEXT,            -- Supabase Storage path for uploaded images
  notes TEXT,
  tags TEXT[],                -- array of tag strings
  trip_name TEXT,
  date_start DATE,
  date_end DATE,
  clipped_via_extension BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## ideas
Lightweight idea capture with optional date/trip attachment.

```sql
CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  platform TEXT CHECK (platform IN ('instagram', 'tiktok', 'linkedin', 'any')),
  date_start DATE,
  date_end DATE,
  trip_name TEXT,
  promoted_to_post UUID REFERENCES social_posts(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## notifications
Scheduled notification queue — processed by a background job or cron.

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('calendar_event', 'social_post', 'ugc_project')),
  entity_id UUID NOT NULL,
  message TEXT NOT NULL,
  send_at TIMESTAMPTZ NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('email', 'push', 'both')),
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Indexes

```sql
-- Calendar events by date range
CREATE INDEX idx_calendar_events_starts_at ON calendar_events(starts_at);
CREATE INDEX idx_calendar_events_calendar_id ON calendar_events(calendar_id);

-- Social posts by stage and platform
CREATE INDEX idx_social_posts_stage ON social_posts(stage);
CREATE INDEX idx_social_posts_platform ON social_posts(platform);
CREATE INDEX idx_social_posts_scheduled_at ON social_posts(scheduled_at);

-- UGC projects by stage
CREATE INDEX idx_ugc_projects_stage ON ugc_projects(stage);

-- Notifications queue
CREATE INDEX idx_notifications_send_at ON notifications(send_at) WHERE sent = false;

-- Inspirations by tags
CREATE INDEX idx_inspirations_tags ON inspirations USING gin(tags);

-- Auto-publish queue (migration 006). The publish worker runs this selection every
-- 5 minutes; partial index keeps it to actual auto-publish candidates.
CREATE INDEX idx_social_posts_publish_queue ON social_posts(scheduled_at)
  WHERE publish_mode = 'auto' AND stage = 'scheduled';

-- Notify-to-post queue (migration 007). Same shape, for the other publish_mode:
-- posts Kevin will post by hand and wants an email about at their scheduled time.
CREATE INDEX idx_social_posts_notify_queue ON social_posts(scheduled_at)
  WHERE publish_mode = 'notify' AND stage = 'scheduled' AND notified_at IS NULL;
```

> **Note on `notification_at` / `notification_method`** (from `001_initial_schema.sql`):
> these are **unused** — no code reads or writes them, and the `notifications` table
> they belong to has no producer either. Stage B5 deliberately added `notified_at`
> instead of reusing them: those columns describe *when and how to notify*, whereas
> `notified_at` records *that we did*. Don't wire new work to them without checking.

---

## After applying any migration

Run this in the Supabase SQL editor:

```sql
NOTIFY pgrst, 'reload schema';
```

PostgREST caches the table schema. Until it reloads, writes to newly added columns
fail with *"could not find the column … in the schema cache"* even though the
column exists — and `PostDialog` swallows Supabase errors, so post saves appear to
succeed while silently doing nothing. This cost real debugging time during B2.
