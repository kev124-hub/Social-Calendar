-- OAuth token storage for external integrations
CREATE TABLE IF NOT EXISTS user_integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT NOT NULL UNIQUE, -- 'google_calendar', 'tripit'
  access_token  TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  metadata      JSONB DEFAULT '{}',  -- e.g. {"calendar_ids": ["primary", "..."]}
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON user_integrations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_user_integrations_updated_at
  BEFORE UPDATE ON user_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
