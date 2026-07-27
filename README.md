# Mustache Journey — Social Calendar

A single-user content planner for [Mustache Journey](https://instagram.com/mustache.journey):
calendar, content pipeline, brand-deal tracking, idea capture, an inspiration
board — and an Instagram auto-publisher that posts finished Reels at original
~2K quality with no third-party re-encode anywhere in the chain.

It is deliberately a personal tool. There is one user (Kevin), one Instagram
account, one Dropbox account. That assumption is baked in everywhere and keeps
the whole thing far simpler than a multi-tenant product would be.

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [How publishing works](#how-publishing-works)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Deployment](#deployment)
- [Cron setup](#cron-setup)
- [Meta (Instagram) app setup](#meta-instagram-app-setup)
- [Dropbox app setup](#dropbox-app-setup)
- [Database migrations](#database-migrations)
- [Troubleshooting](#troubleshooting)
- [Project layout](#project-layout)

---

## What it does

### Calendar
Week, month, day and list views over `calendar_events`, with drag-and-drop
rescheduling. Two-way **Google Calendar sync** (OAuth; multiple calendars
selectable in Settings). Scheduled posts appear on the calendar alongside events,
so content and life are in one place.

**AI event entry** — type or paste a description ("dinner with the Ferrari people
Thursday 8pm at Cipriani") and Claude parses it into a structured event via
`/api/claude/parse-event`.

### Content pipeline
A kanban board over `social_posts` with six stages: **idea → scripted → shot →
editing → scheduled → published**. Plus a grid view that groups by urgency
(overdue / this week / upcoming / in progress / published) and a platform filter
for Instagram, TikTok and LinkedIn.

Each post carries a title, caption, hashtags, media, a scheduled date, notes, and
its publishing settings. Giving a post a scheduled date automatically advances it
to the `scheduled` stage, which is what makes it visible to the publishing
workers.

### Publishing
Every post is either **auto-publish** (the app posts it to Instagram itself) or
**notify** (the app emails you at the scheduled time with everything needed to
post it by hand). See [How publishing works](#how-publishing-works).

### UGC tracker
Brand deals and sponsored work: brand, contact, stage, deliverables, rate and
payment method, deadline, and the brief (pasted text or a link).

### Ideas
Lightweight capture for content ideas, promotable into pipeline posts.

### Inspiration board
Saved images, links and references with tags. Fed either from the app or from the
bundled **Chrome extension** (`extension/`), which clips the current page — URL,
title, an auto-screenshot, any images you pick, notes and tags — straight to the
board. The extension authenticates with a generated key from Settings
(`/api/extension-key`).

### PWA
Installable and runs standalone on a phone (`public/manifest.json` + `public/sw.js`),
with safe-area handling so it behaves on notched devices. Start URL is `/calendar`.

### Notifications
Email via [Resend](https://resend.com). Two kinds, and the distinction matters:

- **Routine:** the notify-to-post reminder, one per notify-mode post at its
  scheduled time.
- **Alarms:** publishing is unconfigured, a token problem, a post failed to
  publish, or a post went live but its record didn't update.

When everything works, the crons send **nothing** — roughly 288 silent runs a day.
Any email that isn't a post reminder means something needs your attention.

---

## Architecture

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.2.4**, App Router, Turbopack | React 19.2.4, TypeScript, Tailwind v4 |
| Database / auth / storage | **Supabase** (Postgres, RLS, Storage) | Free tier |
| Hosting | **Vercel** (Hobby) | Hobby allows only *daily* cron — see [Cron setup](#cron-setup) |
| Media store | **Dropbox Business** | Source of truth for video; never re-encoded |
| Publishing | **Meta Graph API v21.0** | Instagram Content Publishing |
| Email | **Resend** | |
| AI | **Anthropic API** | Natural-language event entry |
| Scheduling | **cron-job.org** | External 5-minute pinger |

### Why Dropbox, and why no third-party scheduler

The point of the publishing pipeline is **no middleman re-encode**. Buffer, Later,
Metricool and friends all re-compress video on the way through. Here, the app
hands Meta a temporary direct URL to the untouched master in Dropbox and Meta
ingests those exact bytes. This is verified, not assumed — see
[Publishing quality timeline](#publishing-quality-timeline).

### Request auth model

- **Browser routes** — Supabase session. `src/proxy.ts` (Next.js 16 renamed
  `middleware` to `proxy`) redirects unauthenticated requests to `/login`, except
  for `/api/cron/*`, `/api/auth/*`, `/api/inspirations`, `/auth/callback`,
  `/manifest.json` and `/sw.js`.
- **Cron routes** — `Authorization: Bearer $CRON_SECRET`, checked by
  `src/lib/cron-auth.ts` with a constant-time compare. **Fails closed**: if
  `CRON_SECRET` is unset, every cron request is rejected.
- **Server-only work** — the service-role Supabase client
  (`src/lib/supabase/admin.ts`) bypasses RLS. Never import it into anything that
  reaches the browser.

---

## How publishing works

Every post has a `publish_mode`, set per post in the post dialog. The schema
default is `notify`, deliberately — auto-publishing is opt-in.

### Auto-publish (`publish_mode = 'auto'`)

Instagram only. The worker at `/api/cron/publish-posts` runs every 5 minutes and
advances each due post by **exactly one step** per run, because Meta ingests video
asynchronously and a Reel container can take longer to become ready than a
serverless function is allowed to live.

```
pending    ──create container──▶ processing
processing ──poll: FINISHED────▶ publish ─▶ published
           ──poll: IN_PROGRESS─▶ (stay processing, look again next run)
           ──poll: ERROR───────▶ retry once with a fresh link, else failed
```

A post is picked up when it is `platform='instagram'`, `stage='scheduled'`,
`publish_mode='auto'`, and `scheduled_at` has passed.

Each attempt mints a **fresh** Dropbox temporary link (they expire in ~4 hours, so
reusing one across a retry would fail). Posts are leased via `publish_locked_at`
so overlapping runs can't double-process, and `ig_media_id` is written exactly
once behind an `IS NULL` guard so a post can never publish twice. Terminal
failures email you.

**"Publish now"** in the post dialog runs the same state machine against one post,
ignoring schedule and mode. It saves your edits first — the worker reads the row
from the database, so unsaved changes would otherwise be ignored. One click = one
step, so a Reel usually needs a second click (or just leave it: if the post is
auto-mode, scheduled and due, the cron finishes it within 5 minutes).

### Notify-to-post (`publish_mode = 'notify'`)

Works for **every** platform — this is the manual path for Stories, trending
audio, collabs, custom covers, TikTok and LinkedIn.

At `scheduled_at`, `/api/cron/send-notifications` emails you with:

- the caption and hashtags, pre-formatted in a copyable block
- a direct download link for the media (plus the Dropbox path, since the link
  lasts ~4 hours)
- what platform and format the post was planned for, and any notes

Guarantees worth knowing:

- **Exactly one email per post.** `notified_at` is written *before* the send, so a
  crash can't produce a repeating email.
- **No burst on first run.** Only posts due within the last **24 hours** are
  emailed. Anything older is skipped, so switching this on can't flood you with
  reminders about historical posts.
- **Rescheduling re-arms it.** Saving a post with a *future* scheduled date clears
  `notified_at`, so a post that slipped gets a fresh reminder at its new time.

### Publishing quality timeline

**An API-published Reel serves a 720p H.264 encode for a short window after
publishing, then the full 1080p VP9 ladder permanently.** Observed: ~15 minutes in
production, up to a few hours in testing. A native Edits upload gets 1080p at or
near birth.

This is a **latency characteristic, not a quality cap**. A freshly published Reel
looking soft is expected, not a bug. Practical advice: schedule publishes ahead of
your peak-audience window and it never matters.

Two related facts, both established by measurement:

- **The 1080p VP9 renditions are not engagement-gated.** Meta generates them
  automatically after publishing, at zero views. There is nothing to "unlock."
- **Never archive a Reel before its encodes settle.** Archiving freezes rendition
  generation. This is not quality-neutral — it is what produced a false "API posts
  are permanently capped at 720p" conclusion during testing.

To spot-check any post's real served quality, see
[Verifying served video quality](#verifying-served-video-quality).

---

## Environment variables

All are set in Vercel (Production) and mirrored in `.env.local` for local dev.
See `.env.local.example`.

### Core

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Browser-side Supabase key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only; bypasses RLS |
| `NEXT_PUBLIC_APP_URL` | yes | e.g. `http://localhost:3000` |

### Email + cron

| Variable | Required | Purpose |
|---|---|---|
| `RESEND_API_KEY` | yes | Resend API key |
| `NOTIFICATION_EMAIL` | yes | Where notifications go |
| `NOTIFICATION_FROM_EMAIL` | no | Defaults to `noreply@mustachejourney.com` |
| `CRON_SECRET` | **yes** | Bearer token for `/api/cron/*`. Without it every cron request is rejected. |

### Instagram publishing

| Variable | Required | Purpose |
|---|---|---|
| `META_APP_ID` | yes | Meta app id |
| `META_APP_SECRET` | yes | Meta app secret |
| `INSTAGRAM_USER_ID` | yes | IG Business/Creator account id |
| `INSTAGRAM_USER_ACCESS_TOKEN` | bootstrap | Long-lived token. Seeds the DB; after the first refresh the `app_credentials` table wins. |

`META_APP_ID` / `META_APP_SECRET` are needed not just to refresh the token but to
*inspect its expiry at all* — without them the app can't tell when publishing is
about to break, so it emails a daily warning instead.

### Dropbox

| Variable | Required | Purpose |
|---|---|---|
| `DROPBOX_APP_KEY` | yes | Scoped app key |
| `DROPBOX_APP_SECRET` | yes | Scoped app secret |
| `DROPBOX_REFRESH_TOKEN` | yes | Offline refresh token |
| `DROPBOX_READY_FOLDER` | no | Defaults to `/Social Media/Ready to Post` |

### Other

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for calendar sync | Google Calendar OAuth |
| `ANTHROPIC_API_KEY` | for AI entry | Natural-language event parsing |

---

## Local development

```bash
npm ci
cp .env.local.example .env.local   # then fill it in
npm run dev                        # http://localhost:3000
```

```bash
npm run build   # production build
npm run lint    # eslint
```

Notes:

- **`npm run build` succeeds with no environment variables set.** Clients are
  constructed lazily, per request, precisely so builds and Vercel Preview
  deployments don't fail on missing env vars.
- **`npm run lint` reports 37 pre-existing problems** (17 errors, 20 warnings) in
  older files. That is the known baseline — check whether *your* changed files
  appear before investigating. **Re-run the linter rather than trusting this
  number**: it read "42 (20 errors, 22 warnings)" until 26 July, and five
  separate documents had carried a wrong baseline by then.
- There are **no automated tests**. Verification is done per change; UI work is
  checked with Playwright screenshots at 390×844 and desktop widths.
- `AGENTS.md` requires reading the guides in `node_modules/next/dist/docs/` before
  writing Next.js code — **this is Next.js 16**, which has breaking changes versus
  most training data and most tutorials (async request APIs, `middleware` renamed
  to `proxy`, Turbopack by default).

---

## Deployment

Hosted on **Vercel (Hobby)**, deployed from `main`.

1. Connect the GitHub repo to Vercel.
2. Add every environment variable above to **Production**.
3. Push to `main` — Vercel builds and deploys.

**Environment variable changes require a redeploy to take effect.** Setting a
variable in the Vercel dashboard does not update a running deployment. This has
bitten this project more than once.

---

## Cron setup

Two endpoints need to be hit every 5 minutes:

| Endpoint | Job |
|---|---|
| `/api/cron/publish-posts` | Advances auto-publish posts; maintains the IG token |
| `/api/cron/send-notifications` | Notify-to-post reminders + the generic notification queue |

Both require the header:

```
Authorization: Bearer <CRON_SECRET>
```

**Vercel Hobby only allows daily cron**, which is far too coarse — so the real
cadence is driven by an external pinger at [cron-job.org](https://cron-job.org)
(free). `vercel.json` keeps a daily Vercel cron on `send-notifications` as a
backstop; Vercel injects the `Authorization` header automatically when
`CRON_SECRET` is set.

On both cron-job.org jobs, enable **notify on failure** and **notify when
disabled** — but *not* notify on success, which would be 288 emails a day.

That external watchdog is a deliberate second layer. The app's own emails cover
problems it can see, but they only work when the app works; cron-job.org catches
401s, 500s, Vercel being down, a paused Supabase project, and — importantly —
cron-job.org disabling a job after repeated failures, which would otherwise stop
everything silently.

---

## Meta (Instagram) app setup

The Instagram account must be a **Business or Creator** account. Personal accounts
cannot use the Content Publishing API.

1. Create an app at [developers.facebook.com](https://developers.facebook.com) —
   "Consumer" type.
2. Add the **Instagram Graph API** product.
3. Connect the Instagram account.
4. Generate a **long-lived user access token** with scopes `instagram_basic` and
   `instagram_content_publish`.
5. Set `META_APP_ID`, `META_APP_SECRET`, `INSTAGRAM_USER_ACCESS_TOKEN` and
   `INSTAGRAM_USER_ID` in Vercel, then **redeploy**.

The app stays in **Development mode** — single user, so no App Review is needed.

**Token lifecycle.** Long-lived tokens last ~60 days. The publish cron refreshes
the token automatically once fewer than 10 days remain, and stores the result in
the `app_credentials` table (a Vercel env var can't be rewritten by the running
app, so env-only storage would mean manual rotation every two months or
auto-publishing silently stops). The env var is only the bootstrap value; once the
table has a token, the table wins.

If refresh ever fails, you get a warning email once a day rather than a surprise
outage.

Meta's documented ceiling is **50 API-published posts per rolling 24 hours**; the
worker counts against it and defers the remainder rather than erroring.

---

## Dropbox app setup

A **scoped app** on the Dropbox account, using refresh-token (offline) OAuth.
Server-side only — there is no user-facing Dropbox login, because it's your own
account.

1. Create a scoped app at
   [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps).
2. Grant permissions: `files.metadata.read` and `files.content.read`.
3. Complete the OAuth flow with `token_access_type=offline` to obtain a **refresh
   token**.
4. Set `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` and `DROPBOX_REFRESH_TOKEN`.

Finished exports go in **`/Social Media/Ready to Post`** (override with
`DROPBOX_READY_FOLDER`). The post dialog lists that folder and stores the selected
file's path on the post; the publisher mints a fresh temporary link from it at
publish time.

The picker surfaces `.mp4`, `.mov`, `.m4v`, `.webm`, `.jpg`, `.jpeg`, `.png`,
`.heic` and `.heif`.

---

## Database migrations

Migrations live in `supabase/migrations/` and are applied **by hand** in the
Supabase SQL editor — there is no migration runner.

| Migration | Adds |
|---|---|
| `001_initial_schema.sql` | Core tables |
| `002_google_calendar.sql` | Calendar sync fields |
| `003_external_id_unique.sql` | Sync dedupe constraint |
| `004_storage_policies.sql` | Inspiration image storage |
| `005_publishing.sql` | Publishing fields on `social_posts` |
| `006_publish_worker.sql` | Worker bookkeeping + `app_credentials` |
| `007_notify_to_post.sql` | `notified_at` + notify queue index |

> **After applying any migration, run this in the SQL editor:**
> ```sql
> NOTIFY pgrst, 'reload schema';
> ```
> PostgREST caches the table schema. Until it reloads, writes to new columns fail
> with *"could not find the column … in the schema cache"* — and in this app that
> has shown up as post saves silently doing nothing.

See `docs/database-schema.md` for the full schema.

---

## Troubleshooting

### A scheduled post didn't go out

1. Open the post. The pipeline card and the dialog show a status badge —
   **Queued / Publishing / Published / Failed** — and a failed post shows its
   reason inline.
2. Check your email: terminal publish failures always send one.
3. Hit `/api/cron/publish-posts` with the bearer header and read the JSON. It
   reports `considered`, `created`, `published`, `waiting`, `retrying`, `failed`,
   plus token status.
4. Common causes: no Dropbox file attached (auto-publish has nothing to upload),
   an unsupported media format, a caption over 2,200 characters or 30 hashtags, or
   the post not actually being at `stage='scheduled'` with a past `scheduled_at`.

### No notify email arrived

Check `/api/cron/send-notifications` — the response body carries a `notifyError`
field. Empty means the cycle ran fine. Also confirm the post is `notify` mode,
`scheduled`, and came due **within the last 24 hours** (older posts are skipped by
design).

### "Publishing is not configured" emails

`INSTAGRAM_USER_ID` or the access token is missing in Vercel. Set it and
**redeploy**. This email arrives at most once a day while the problem persists,
and stops on its own once fixed.

### Cron returns 401

`CRON_SECRET` at cron-job.org doesn't match Vercel. Note it fails closed — an
*unset* `CRON_SECRET` returns 500, not 401.

### Cron returns 200 but nothing happens

Read the body. `{"ok":false,...}` with an `error` means publishing isn't
configured. The endpoint deliberately returns 200 in that case — the app emails
you instead of relying on the pinger's failure alert, because cron-job.org
disables a job after repeated failures, which would leave publishing broken even
after the config was fixed.

### A post published but shows as failed (or vice versa)

The status badge trusts `ig_media_id` over `publish_status`, because the worker
writes the media id first and could in principle die before updating the status.
If a post shows **Published** with a permalink, it is live — **do not publish it
again**. There is also an explicit email for the rare "published but the record
didn't update" case.

### A newly published Reel looks low quality

Expected for a short window — see
[Publishing quality timeline](#publishing-quality-timeline). Wait and re-check
before doing anything. Do **not** archive it: archiving freezes rendition
generation.

### Verifying served video quality

Screen recordings are **not** a valid measurement — adaptive bitrate and player
state confound them. To check what a post is really being served:

1. Open the Reel on instagram.com while logged in.
2. Extract `video_dash_manifest` from the embedded page scripts.
3. Parse the `<Representation>` elements for `width`, `height`, `codecs` and
   `bandwidth`.

A healthy settled post shows a **1080×1920 VP9** rung. `taken_at` in the same page
data gives the publish timestamp, so you can compute the post's age.

### Supabase "project will be archived for inactivity"

Free-tier Supabase projects pause after 7 days without enough database activity,
and a paused project takes the app down. The 5-minute pingers generate roughly
1,150 database queries a day, far above Supabase's stated bar of "a few user
requests each day," so this should not recur now that they are running.

If a warning still arrives after the pingers have been up a full week, service-role
traffic genuinely isn't being counted — in which case a keepalive wouldn't help
either (it's more of the same traffic) and the real fix is **Supabase Pro**
(~$25/mo), which removes project pausing entirely.

If the project ever does pause, it is not silent: every query throws, the crons
return 500, and cron-job.org's failure alert fires.

### Post saves silently do nothing

Almost always the PostgREST schema cache after a migration. Run
`NOTIFY pgrst, 'reload schema';`.

---

## Project layout

```
src/
  app/
    (app)/            calendar, pipeline, ugc, ideas, inspiration, settings
    api/
      claude/         natural-language event parsing
      cron/           publish-posts, send-notifications  (bearer auth)
      dropbox/        "Ready to Post" folder listing
      google-calendar/ sync, calendar list, disconnect
      posts/[id]/publish   "Publish now"
      extension-key/  Chrome extension auth
    login/, auth/     Supabase auth
  components/
    calendar/         views, event + post dialogs, drag-and-drop
    pipeline/         board, post dialog
    ugc/, ideas/, inspiration/, layout/, ui/
  lib/
    instagram.ts      Graph API client (v21.0 pinned)
    publisher.ts      auto-publish state machine
    notifier.ts       notify-to-post reminders
    ig-token.ts       token storage + unattended refresh
    dropbox.ts        listing + temporary links
    warn-once.ts      rate-limited warning emails
    email.ts, cron-auth.ts, google-calendar.ts, supabase/
  proxy.ts            auth boundary (Next.js 16's renamed middleware)
extension/            Chrome MV3 clipper
scripts/              one-off maintenance (see below)
supabase/migrations/  hand-applied SQL
tests/                no-framework Node checks (npm test)
docs/                 schema, integrations, build phases, extension spec
```

### Maintenance scripts

```bash
node --env-file=.env.local scripts/scan-drifted-times.mjs --tz=America/New_York
```

Lists events and scheduled posts whose stored time may have been moved by the
edit-dialog bug fixed in #36 — which shifted a row by the device's UTC offset on
every save, compounding, without needing anything to be edited.

**Read only, deliberately.** The stored value is `original + N × offset` and
neither term was recorded, so nothing can undo it without guessing — and
guessing wrong on a `scheduled_at` publishes at the wrong time rather than
merely displaying at one. The script narrows the rows worth opening; the
dialogs, now fixed, are what correct them.

Pass the zone the device was **set to**, which is not necessarily where it was.

**Key docs:** `HANDOFF.md` (project state and decision history),
`docs/database-schema.md`, `docs/integrations.md`, `docs/chrome-extension.md`,
`AGENTS.md` (Next.js 16 warning — read it before writing code).
