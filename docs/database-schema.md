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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

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
```
