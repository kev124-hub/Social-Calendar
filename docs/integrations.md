# External Integrations Guide

Setup instructions and notes for each external service.

---

## Google Calendar

**Purpose:** Read + write access to Kevin's Google calendars.  
**Phase:** 1  
**Cost:** Free

### Setup Steps
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (e.g., "Social Calendar")
3. Enable the **Google Calendar API**
4. Create **OAuth 2.0 credentials** (Web Application type)
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://your-vercel-url.vercel.app/api/auth/callback/google` (prod)
6. Download the client ID and client secret — add to `.env.local`

### Environment Variables
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### Scopes Required
- `https://www.googleapis.com/auth/calendar` (read + write)

---

## TripIt

**Purpose:** Read-only access to travel itineraries as calendar events.  
**Phase:** 1  
**Cost:** Free

### Setup Steps
1. Go to [TripIt Developer](https://www.tripit.com/developer)
2. Register for API access
3. Create an application to get API key + secret
4. Use OAuth 1.0a flow

### Environment Variables
```
TRIPIT_API_KEY=
TRIPIT_API_SECRET=
```

### Notes
- TripIt's API returns trips as structured data — map to `calendar_events` with source='tripit'
- Sync on login + manual refresh button in settings

---

## Instagram (Meta Developer App)

**Purpose:** Display Instagram profile info; future analytics.  
**Phase:** 2  
**Cost:** Free  
**Mode:** Development mode only (single user — no App Review needed)

### Setup Steps
1. Go to [Meta for Developers](https://developers.facebook.com)
2. Create a new App → choose "Consumer" type
3. Add product: **Instagram Graph API**
4. Connect Kevin's Instagram Business/Creator account
5. Generate a long-lived User Access Token
6. Add to `.env.local`

### Environment Variables
```
META_APP_ID=
META_APP_SECRET=
INSTAGRAM_USER_ACCESS_TOKEN=
INSTAGRAM_USER_ID=
```

### Notes
- Instagram requires a Business or Creator account (not personal)
- Development mode = only the app owner's account works — perfect for single-user app
- Access token expires — implement token refresh flow
- Privacy policy URL required in Meta app settings (add a `/privacy` route to the app)

---

## TikTok

**Purpose:** Display TikTok profile info; future analytics.  
**Phase:** 2  
**Cost:** Free

### Setup Steps
1. Go to [TikTok for Developers](https://developers.tiktok.com)
2. Create an app
3. Request scopes: `user.info.basic`
4. Add redirect URI for OAuth callback

### Environment Variables
```
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
```

---

## LinkedIn

**Purpose:** Display LinkedIn profile info; future analytics.  
**Phase:** 2  
**Cost:** Free

### Setup Steps
1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com)
2. Create an app
3. Request products: **Sign In with LinkedIn using OpenID Connect**
4. Add redirect URI for OAuth callback

### Environment Variables
```
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
```

---

## Anthropic API (Claude)

**Purpose:** Natural language event entry — Kevin types or pastes a description, Claude creates the calendar event automatically.  
**Phase:** 2  
**Cost:** ~$0.01–$0.05 per interaction (fractions of a cent per event)

### Setup Steps
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create account (separate from Claude.ai Pro subscription)
3. Generate an API key
4. Add to `.env.local` (server-side only — never expose to client)

### Environment Variables
```
ANTHROPIC_API_KEY=
```

### Implementation Notes
- Use `claude-sonnet-4-6` model (or latest available)
- Server-side API route only (`/api/claude/parse-event`)
- Prompt: parse natural language into structured event object (title, date, time, location, calendar)
- Write result directly to Supabase `calendar_events` table
- Include prompt caching for the system prompt

---

## Resend (Email Notifications)

**Purpose:** Send notification emails for post deadlines, UGC milestones, calendar reminders.  
**Phase:** 1  
**Cost:** Free tier (100 emails/day — more than sufficient)

### Setup Steps
1. Go to [resend.com](https://resend.com)
2. Create account
3. Verify sending domain or use their sandbox domain for dev
4. Generate API key

### Environment Variables
```
RESEND_API_KEY=
NOTIFICATION_EMAIL=Hello@mustachejourney.com
```

---

## Supabase

**Purpose:** Database (PostgreSQL), authentication, and file storage.  
**Phase:** 1  
**Cost:** Free tier sufficient for personal use

### Setup Steps
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Run the migration from `docs/database-schema.md`
4. Get project URL + anon key from Settings → API

### Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### Storage Buckets to Create
- `inspirations` — for clipped/uploaded images from the Inspiration Board

---

## Vercel

**Purpose:** Hosting and deployment.  
**Phase:** 1  
**Cost:** Free tier sufficient

### Setup Steps
1. Push project to GitHub
2. Connect GitHub repo to Vercel
3. Add all environment variables in Vercel dashboard
4. Deploy

### Notes
- Set up preview deployments for testing
- Add production domain if desired (custom domain optional)

---

## iCloud CalDAV (Phase 3)

**Purpose:** Read + write access to iCloud calendars.  
**Phase:** 3 — deferred  
**Complexity:** High (CalDAV protocol, Apple-specific auth)

### Notes for When Ready
- Uses CalDAV protocol (not a REST API)
- Requires App-Specific Password from Apple ID settings
- Use a CalDAV client library (e.g., `tsdav`)
- Server: `caldav.icloud.com`
