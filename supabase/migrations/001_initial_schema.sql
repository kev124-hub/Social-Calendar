-- Social Calendar — Initial Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ─────────────────────────────────────────────
-- CALENDARS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendars (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  source      TEXT NOT NULL CHECK (source IN ('app', 'google', 'tripit', 'icloud')),
  external_id TEXT,
  is_visible  BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed: default app-native calendar
INSERT INTO calendars (name, color, source)
VALUES ('My Calendar', '#6366f1', 'app')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────
-- IDEAS (defined before social_posts so FK works)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ideas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  description      TEXT,
  platform         TEXT CHECK (platform IN ('instagram', 'tiktok', 'linkedin', 'any')),
  date_start       DATE,
  date_end         DATE,
  trip_name        TEXT,
  promoted_to_post UUID,            -- FK added after social_posts created
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- CALENDAR EVENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id         UUID REFERENCES calendars(id) ON DELETE CASCADE,
  external_id         TEXT,
  title               TEXT NOT NULL,
  description         TEXT,
  location            TEXT,
  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ,
  all_day             BOOLEAN DEFAULT false,
  notification_at     TIMESTAMPTZ,
  notification_method TEXT CHECK (notification_method IN ('email', 'push', 'both')),
  source              TEXT NOT NULL CHECK (source IN ('app', 'google', 'tripit', 'icloud')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- SOCIAL POSTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'linkedin')),
  post_type           TEXT CHECK (post_type IN ('reel', 'carousel', 'story', 'static', 'video', 'article')),
  stage               TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN ('idea', 'scripted', 'shot', 'editing', 'scheduled', 'published')),
  title               TEXT,
  caption             TEXT,
  hashtags            TEXT,
  media_url           TEXT,
  scheduled_at        TIMESTAMPTZ,
  published_at        TIMESTAMPTZ,
  notes               TEXT,
  notification_at     TIMESTAMPTZ,
  notification_method TEXT CHECK (notification_method IN ('email', 'push', 'both')),
  promoted_from_idea  UUID REFERENCES ideas(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Now add the FK from ideas → social_posts (idempotent)
ALTER TABLE ideas DROP CONSTRAINT IF EXISTS fk_ideas_promoted_to_post;
ALTER TABLE ideas
  ADD CONSTRAINT fk_ideas_promoted_to_post
  FOREIGN KEY (promoted_to_post) REFERENCES social_posts(id);

-- ─────────────────────────────────────────────
-- UGC PROJECTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ugc_projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_name          TEXT NOT NULL,
  contact_name        TEXT,
  stage               TEXT NOT NULL DEFAULT 'lead' CHECK (stage IN (
    'lead', 'pitched', 'negotiating', 'contract_signed',
    'shooting', 'delivered', 'invoice_sent', 'paid'
  )),
  rate                NUMERIC(10, 2),
  payment_method      TEXT,
  deliverables        TEXT,
  deadline            DATE,
  brief_text          TEXT,
  brief_url           TEXT,
  notes               TEXT,
  notification_at     TIMESTAMPTZ,
  notification_method TEXT CHECK (notification_method IN ('email', 'push', 'both')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- INSPIRATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspirations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                   TEXT NOT NULL CHECK (type IN ('image', 'video_link', 'url_clip', 'text_note', 'file_link')),
  title                  TEXT,
  source_url             TEXT,
  image_path             TEXT,
  notes                  TEXT,
  tags                   TEXT[] DEFAULT '{}',
  trip_name              TEXT,
  date_start             DATE,
  date_end               DATE,
  clipped_via_extension  BOOLEAN DEFAULT false,
  created_at             TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('calendar_event', 'social_post', 'ugc_project')),
  entity_id   UUID NOT NULL,
  message     TEXT NOT NULL,
  send_at     TIMESTAMPTZ NOT NULL,
  method      TEXT NOT NULL CHECK (method IN ('email', 'push', 'both')),
  sent        BOOLEAN DEFAULT false,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_calendar_events_starts_at   ON calendar_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_id ON calendar_events(calendar_id);

CREATE INDEX IF NOT EXISTS idx_social_posts_stage        ON social_posts(stage);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform     ON social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_at ON social_posts(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_ugc_projects_stage ON ugc_projects(stage);

CREATE INDEX IF NOT EXISTS idx_notifications_send_at ON notifications(send_at) WHERE sent = false;

CREATE INDEX IF NOT EXISTS idx_inspirations_tags ON inspirations USING gin(tags);

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Single-user app — allow authenticated user full access
-- ─────────────────────────────────────────────
ALTER TABLE calendars        ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ugc_projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspirations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated user can do everything
CREATE POLICY "auth_all" ON calendars       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON calendar_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON social_posts    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON ugc_projects    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON inspirations    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON ideas           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON notifications   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ugc_projects_updated_at
  BEFORE UPDATE ON ugc_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ideas_updated_at
  BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
