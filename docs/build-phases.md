# Build Phases

Detailed task breakdown for each phase. Work through phases in order.

---

## Phase 1 — Core App

**Goal:** Fully functional app with calendar, content pipeline, UGC tracker, ideas, and email notifications. Deployed to Vercel.

### Setup
- [ ] Scaffold Next.js 14+ with TypeScript, Tailwind CSS, Shadcn UI
- [ ] Initialize Supabase project, connect to Next.js
- [ ] Configure Supabase Auth (single user, email/password)
- [ ] Run full database schema migration (`docs/database-schema.md`)
- [ ] Deploy skeleton to Vercel
- [ ] Set up environment variables (Supabase, Resend)
- [ ] Protected routes — redirect to login if not authenticated

### Calendar Module
- [ ] Calendar layout with Day / Week / Month / List / Agenda views
- [ ] App-native event CRUD (create, read, update, delete)
- [ ] Event entry form: title, date, time, all-day toggle, location, notes, calendar selector, notification
- [ ] Calendar management: add/edit/delete calendars, set color, show/hide toggle
- [ ] Google Calendar OAuth connection
- [ ] Sync Google Calendar events (read + write)
- [ ] TripIt OAuth connection
- [ ] Sync TripIt events (read-only)
- [ ] Combined/individual calendar toggle in sidebar

### Content Pipeline Module
- [ ] Kanban board: Idea → Scripted → Shot → Editing → Scheduled → Published
- [ ] Post card: platform icon, post type, title, scheduled date, media preview link
- [ ] Post detail drawer/modal: all fields (caption, hashtags, media URL, notes, notification)
- [ ] Platform filter (All / IG / TikTok / LinkedIn)
- [ ] Grid preview mode: visual feed preview sorted by scheduled date
- [ ] Stage drag-and-drop (or click-to-advance)

### UGC Tracker Module
- [ ] Kanban board: Lead → Pitched → Negotiating → Contract Signed → Shooting → Delivered → Invoice Sent → Paid
- [ ] Project card: brand name, rate, deadline, stage
- [ ] Project detail drawer/modal: all fields (brand, contact, rate, deliverables, deadline, brief, payment method, notes, notification)
- [ ] List view alternative

### Ideas Module
- [ ] Quick capture form: title, description, platform, optional date/date range/trip name
- [ ] Card view + list view
- [ ] Promote to pipeline button (creates post in Content Pipeline at Idea stage)

### Notifications (Phase 1 — Email Only)
- [ ] Resend integration
- [ ] Notification scheduler: check `notifications` table, send emails at `send_at` time
- [ ] Triggered by: saving an event, post, or UGC project with a notification set
- [ ] Vercel Cron Job to process notification queue every 15 minutes

### Navigation
- [ ] Sidebar navigation: Calendar, Content, UGC, Ideas, Board (disabled Phase 1), Settings
- [ ] Mobile-responsive layout

---

## Phase 2 — Visual & Extended

**Goal:** Inspiration Board, Chrome Extension, PWA push notifications, Claude event entry, social media profile connections.

### Inspiration Board
- [ ] Masonry grid gallery layout
- [ ] Manual add form: type, title, URL, image upload, notes, tags, trip/date
- [ ] Image storage in Supabase Storage (`inspirations` bucket)
- [ ] Filter bar: by type, tag, trip, date range
- [ ] Item detail modal
- [ ] Delete + edit items

### Chrome Extension
- [ ] Manifest V3 extension scaffold
- [ ] Popup UI (title, URL, screenshot, image selector, notes, tags, trip/date)
- [ ] Content script to find images on page
- [ ] Auth token flow (connect to app URL)
- [ ] API endpoint: `POST /api/inspirations` (accepts extension payload)
- [ ] Test end-to-end: clip → appears in Board

### PWA + Push Notifications
- [ ] Web App Manifest
- [ ] Service worker (offline read support)
- [ ] Web Push API setup (VAPID keys)
- [ ] Push notification subscription flow in settings
- [ ] Send push for notifications (alongside email)
- [ ] iOS install prompt / instructions in settings

### Claude Event Entry
- [ ] Server-side API route: `POST /api/claude/parse-event`
- [ ] System prompt: parse natural language into structured event (with prompt caching)
- [ ] UI: input field in Calendar header — "Add event with AI"
- [ ] On submit: call Claude API → parse response → write to `calendar_events` → refresh calendar

### Social Media Connections
- [ ] Instagram OAuth (Meta Developer App — Development mode)
- [ ] Display Instagram profile in settings + sidebar
- [ ] TikTok OAuth
- [ ] Display TikTok profile
- [ ] LinkedIn OAuth
- [ ] Display LinkedIn profile
- [ ] Social account status indicators in app header

---

## Phase 3 — Later / Optional

**Goal:** iCloud sync, analytics, advanced search.

### iCloud CalDAV
- [ ] CalDAV client integration (`tsdav` library)
- [ ] iCloud App-Specific Password setup instructions
- [ ] Read + write sync for iCloud calendars
- [ ] Add to calendar sources in settings

### Analytics Dashboard
- [ ] Pull post metrics from Instagram Graph API
- [ ] Pull post metrics from TikTok API
- [ ] Pull post metrics from LinkedIn API
- [ ] Dashboard view: reach, engagement, follower growth over time
- [ ] Link metrics back to individual posts in Content Pipeline

### Search & Advanced Filtering
- [ ] Global search across all modules
- [ ] Advanced filters: date range, tags, platform, stage
- [ ] Saved filter presets

---

## Environment Variables Checklist

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google Calendar (Phase 1)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# TripIt (Phase 1)
TRIPIT_API_KEY=
TRIPIT_API_SECRET=

# Resend (Phase 1)
RESEND_API_KEY=
NOTIFICATION_EMAIL=Hello@mustachejourney.com

# Anthropic Claude (Phase 2)
ANTHROPIC_API_KEY=

# Meta / Instagram (Phase 2)
META_APP_ID=
META_APP_SECRET=
INSTAGRAM_USER_ACCESS_TOKEN=
INSTAGRAM_USER_ID=

# TikTok (Phase 2)
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

# LinkedIn (Phase 2)
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# Web Push VAPID keys (Phase 2)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```
