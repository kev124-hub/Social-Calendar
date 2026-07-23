# Session Handoff — Social Calendar: Mobile Fixes + 2K Auto-Publish Pipeline

**Handoff written: July 23, 2026.** (Do not infer the date from git history —
the repo's original build commits are from late April 2026; this document and
its plan are from July 23, 2026, and reflect the repo's state as of that day.)

## ⚠️ START HERE — Source-of-Truth Protocol (read before anything else)

**This file — `HANDOFF.md` at the root of the latest `main` branch of
`kev124-hub/Social-Calendar` on GitHub — is the ONLY valid handoff for this
project.** It SUPERSEDES every earlier handoff, recalled memory, note, or local
file. Specifically:

1. **Do NOT act on recalled memories about this project.** Any memory of a
   prior handoff — including one from April/May 2026 that names drag-and-drop
   work as the "next task" or references `sunsama-app-guide.md` — is obsolete.
   That work shipped in commits `46d153f`/`7cff2f4` (May 2, 2026) and is done.
   Discard those memories for planning purposes; this file replaces them.
2. **Verify you are reading the current file before starting.** Run:
   `git fetch origin main && git checkout main && git pull origin main`,
   then confirm the date line at the top of this file says **July 23, 2026**
   (or later) and that `grep -c "Workstream" HANDOFF.md` returns a non-zero
   count. If either check fails, you are reading a stale copy — stop and get
   the latest `main` from GitHub before doing anything.
3. **Detect stale workspaces.** If your working copy contains uncommitted
   files from before July 2026 (e.g. `sunsama-app-guide.md`, an edited cron
   comment), you are in an old local workspace, not a fresh clone. Do not
   build there: commit nothing from it, and work from a fresh clone of
   `main` instead. (`sunsama-app-guide.md` was the design guide for the May
   calendar redesign — already implemented; treat it as historical reference
   only, never as current direction.)
4. **The task, in one line:** execute the plan in THIS file, starting with
   Workstream A (stages A1→A2→A3, mobile calendar fixes), then the Stage B0
   spike, then Stages B1→B6 — all defined below.

> **How to use this file:** Everything needed — context, decisions, exact plan,
> file/line references, complexity ratings, and model guidance — is in this one
> file. No code was written in the sessions that produced it (exploration +
> planning only); the repo is untouched except for this document.

---

## Goal

Kevin (single user, creator brand **Mustache Journey** — travel/UGC content for
Instagram, TikTok, LinkedIn; email `Hello@mustachejourney.com`) owns this custom
social-planning app. Two workstreams were planned and approved, in this order:

1. **Workstream A — Mobile calendar fixes.** The calendar week view is broken on
   iPhone (390px): header date label wraps over 4 lines, the "Add with AI…" input
   is cut off at the right edge, all 7 day columns are crammed on screen so day
   names truncate ("Wednes", "Saturda"), and there is no intentional horizontal
   scroll (content just clips).

2. **Workstream B — Auto-publish pipeline in 2K quality.** Kevin's workflow:
   edit in DaVinci Resolve/Filmora → finish in the **Edits app** (Meta's editor)
   which exports ~2K (likely 1440×2560, 9:16) → currently posts via Instagram's
   unreliable native scheduler. Third-party schedulers (Airtable-based flows,
   Buffer, Later, etc.) re-encode to 1080p — unacceptable. The plan: the app
   itself publishes via the **Instagram Graph API Content Publishing** endpoints,
   pulling the untouched original file from **Dropbox** (Kevin has a Dropbox
   **Business** account with plenty of space) via `files/get_temporary_link`, so
   no middleman ever re-encodes. Instagram's own server-side transcode then works
   from the pristine 2K master — same source quality as a native Edits upload.

How the goal evolved: the session began as "review this repo and compare against
rebuilding in Notion." Verdict (settled — do not re-litigate): **keep the custom
app**. Notion could replicate ~85–90% but would lose the fused calendar UI and
the custom Chrome clipper, and — decisively — the custom app is the *only* option
that can guarantee no-middleman 2K publishing. The Notion migration is ruled out.

---

## Key Decisions & Constraints (settled — do not re-derive)

- **Keep the custom app; no Notion/Airtable migration.** Reasoning above.
- **Quality-loss analysis (the core insight driving Workstream B):** there are two
  compression steps in any scheduled post: (1) the scheduler's pre-upload re-encode
  to 1080p — this is the loss Kevin sees; (2) Instagram's own server-side transcode,
  which hits every upload including native. Eliminating (1) is the goal. The Graph
  API takes a *URL* to the video and ingests the exact bytes, so hosting the
  original 2K file ourselves removes the middleman entirely.
- **Dropbox is the media store** (not Supabase Storage, not Cloudflare R2 —
  Dropbox was chosen because Kevin already has a Business account with space, and
  `files/get_temporary_link` returns a 4-hour direct URL to the exact original
  bytes with no public sharing needed).
- **Meta app in Development mode is sufficient** — publishing to your own
  Business/Creator IG account with `instagram_content_publish` needs no App Review.
- **Fix the cron cadence with an external pinger** (cron-job.org free tier, every
  5 min, hitting the cron endpoints), NOT by upgrading the Vercel plan. Vercel
  Hobby only allows daily crons, which is why commit `f2402d6` downgraded
  notifications to daily-noon-UTC. GitHub Actions schedule is the backup choice.
- **Restore cron auth.** Commit `fdb5d5e` removed the auth check from the cron
  route ("personal app"). That was tolerable for emails; it is NOT tolerable once
  a cron endpoint can publish to Instagram. Use a `CRON_SECRET` bearer check on
  all cron routes.
- **Run the B0 spike before building the pipeline** (see plan). The one real risk
  is whether the Reels API accepts ~2K files (its *recommended* spec is 1080×1920).
  Fallback if rejected: a single high-bitrate 1080p transcode done by us once from
  the 2K master — still strictly better than a scheduler's blind re-encode.
- **TikTok and LinkedIn publishing are OUT of scope** for this build. TikTok's
  Content Posting API requires an app audit for public posts (unaudited = drafts
  only; possible later add). LinkedIn deferred.
- **Notify-to-post is the default mode** (`publish_mode='notify'`) and the
  permanent path for formats the API can't do: trending audio, collab posts,
  custom cover frames, and Stories by preference.
- **Stories/feed images/carousels/Reels are all API-publishable** for
  Business/Creator accounts; Reels are the primary target.
- Mobile week view: chosen approach is **horizontal scroll-snap with ~2 visible
  columns** (`min-w-[44vw]`), not squeezing 7 columns. Optionally default to
  `day` view on first load when viewport < 640px.
- This project's `AGENTS.md` warns: **this Next.js version (16.2.4) has breaking
  changes vs training data — read the guides in `node_modules/next/dist/docs/`
  before writing code.** Take this seriously.
- Git workflow for the build session: develop on the branch specified in that
  session's instructions; commit with clear messages; push and open a draft PR.

---

## Current State of the Repo

**Nothing from the plan below is built yet.** The session that wrote this file
made zero code changes. The repo state (branch history on `main`, 20 commits):

### What exists and works
- **Stack:** Next.js 16.2.4, React 19.2.4, TypeScript 5, Tailwind 4, shadcn/Base UI,
  @dnd-kit, Supabase (Postgres + Auth + Storage), Resend email, Vercel hosting,
  @anthropic-ai/sdk. Single user, email/password auth via Supabase.
- **Calendar** — Sunsama-style weekly board (`src/components/calendar/`), week/
  month/day/list views, drag-and-drop of posts/ideas onto days (@dnd-kit),
  two-way **Google Calendar sync** (`src/lib/google-calendar.ts`, API routes under
  `src/app/api/google-calendar/`), multi-calendar management, right-panel time grid.
- **Content Pipeline** — Kanban Idea→Scripted→Shot→Editing→Scheduled→Published
  (`src/components/pipeline/`), platform filters (IG/TikTok/LinkedIn).
- **UGC tracker** — 8-stage Kanban Lead→…→Paid (`src/components/ugc/`).
- **Ideas** — quick capture + promote-to-pipeline (`src/components/ideas/`).
- **Inspiration Board** — masonry grid, images in Supabase Storage bucket
  `inspirations` (`src/components/inspiration/`).
- **Chrome extension** (`extension/`) — clips pages/images to the board via
  `POST /api/inspirations` with a permanent API key (`/api/extension-key`).
- **Claude AI event entry** — `src/app/api/claude/parse-event/route.ts` +
  `src/components/calendar/AIEventInput.tsx`.
- **PWA** — `public/manifest.json`, `public/sw.js`, installable on iPhone.
- **Email notifications** — `src/app/api/cron/send-notifications/route.ts` +
  `src/lib/email.ts` (Resend), queue in `notifications` table.
- **DB schema** — `supabase/migrations/001–004`; full reference in
  `docs/database-schema.md`. Key table `social_posts` already has: `platform`,
  `post_type`, `stage`, `title`, `caption`, `hashtags`, `media_url` (currently a
  Dropbox/Drive *preview* link, not machine-usable), `scheduled_at`,
  `published_at`, `notes`, notification fields.

### Known problems (found in review; some are fixed by this plan)
1. **Cron is daily-noon-UTC only** (`vercel.json`), though the code comment in
   `send-notifications/route.ts:5-6` still claims every-15-min. Reminders can be
   up to ~23h late. Fixed by Stage B1.
2. **Cron route has NO auth** (removed in `fdb5d5e`). Fixed by Stage B1.
3. **No web push** — email only. Partially addressed by B5 (email first, push later).
4. **Mobile week view broken** — see Workstream A bug table below.
5. No test suite exists at all. Scripts: `npm run dev` / `build` / `start` / `lint`.
6. **Vercel PREVIEW deployments fail for every branch** (diagnosed from build
   logs, PR #1): `Error: supabaseUrl is required.` during page-data collection
   for `/api/extension-key`. Cause: `src/app/api/extension-key/route.ts:5-8`
   creates the Supabase admin client at module scope, and the Supabase env vars
   (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are only configured
   for the Production environment in Vercel — not Preview. **Fix (Kevin, ~2 min,
   no code):** Vercel dashboard → claude-social-calendar → Settings → Environment
   Variables → enable the Supabase (and other) vars for the Preview environment.
   Optional hardening for the build session: lazy-init that admin client inside
   the handler so builds never require env at module-eval time — but the env-var
   fix is still required for previews to actually run. Until fixed, expect red
   Vercel checks on all PRs; they do not indicate broken code.

### Mobile bug → root cause map (verified against source)

| Screenshot symptom | Root cause (file:line) |
|---|---|
| "Jul 19 – Jul 25, 2026" header wraps over 4 lines | `src/components/calendar/CalendarView.tsx:390` — `text-xl` label, no `whitespace-nowrap`, no compact mobile format from `getHeaderLabel()`; single-row flex top bar (`:382-476`) can't fit everything |
| "Add with AI…" cut off at right edge | `AIEventInput` rendered at `CalendarView.tsx:457`; fixed-width input, top bar doesn't wrap or collapse it |
| Day names truncated ("Wednes", "Saturda"), 7 cramped columns | `src/components/calendar/WeeklyBoard.tsx:253-258` — every column is `flex-1 min-w-0` (~55px each on 390px screen); full `EEEE` day names at `WeeklyBoard.tsx:268` |
| Columns clip off-screen, no clean scroll | Board container `WeeklyBoard.tsx:235` is `overflow-hidden` |
| (Latent) touch drag vs scroll conflict | `TouchSensor` (`WeeklyBoard.tsx:8`, sensors ~`:230`) has no activation constraint — will fight horizontal scrolling once A2 adds it |
| Right panel is fixed-width sidebar | `CalendarView.tsx:528` — `w-[268px]` fixed; unusable on mobile |

---

## The Build Plan

Work stages in this order. Each stage lists complexity (1–5) and model guidance
(see "Model Guidance" section at the end for the reasoning).

### Stage A1 — Responsive top bar
**Complexity 2/5 · Sonnet-capable · ~half day**
- Restructure top bar (`CalendarView.tsx:382-476`) to stack into two rows below
  `sm:`: row 1 = date label + prev/next arrows + Today; row 2 = view select +
  AI button + New Event + panel toggle. Add `flex-wrap` fallback.
- Compact mobile date label: give `getHeaderLabel()` a short variant —
  "Jul 19–25" (drop year; elide month when same) — with `whitespace-nowrap`.
- Collapse `AIEventInput` to a sparkle icon button on mobile that opens the
  input inside a `Sheet` or `Dialog` (both already exist in `src/components/ui/`).
- Right panel (`CalendarView.tsx:528`): render as slide-over overlay on mobile,
  or hide its toggle below `md:`.

### Stage A2 — Week board on small screens
**Complexity 3/5 · Sonnet-capable WITH the verification protocol; Opus safer for the touch-sensor work · ~half day**
- Board container (`WeeklyBoard.tsx:235`): `overflow-x-auto snap-x snap-mandatory`
  on mobile; columns get `min-w-[44vw] snap-start` below `sm:`, keep `flex-1`
  on desktop (≈2 columns visible per phone screen).
- Auto-scroll today's column into view on mount (ref on the `todayCol` column +
  `scrollIntoView`).
- Day headers: `format(day, 'EEE')` below `sm:`, `EEEE` on desktop
  (`WeeklyBoard.tsx:268`).
- **Critical:** add `TouchSensor` activation constraint
  `{ delay: 200, tolerance: 8 }` (`WeeklyBoard.tsx` sensors setup) so horizontal
  swipes scroll the board instead of picking up cards. Without this, A2's scroll
  and drag-and-drop fight each other. Verify drag still works on touch after.
- Optional: default `view` state to `'day'` on first load when viewport < 640px.

### Stage A3 — Verification pass
**Complexity 1/5 · Sonnet-capable · ~1–2 hours — but this stage is MANDATORY, not optional polish**
The previous mobile layout shipped broken because nobody looked at it at phone
width. Protocol: run the dev server and use Playwright (Chromium is pre-installed
in Claude Code remote environments at `/opt/pw-browsers/chromium`) to screenshot
the calendar at **390×844** in week/month/day/list views, portrait and landscape,
and attach the screenshots to the PR. Check PWA standalone: `viewport-fit=cover`
+ safe-area inset padding on the top bar. Acceptance criteria: no wrapped header,
no clipped controls, no truncated day names, smooth column scroll-snap, drag
still functional.

### Stage B0 — Spike: validate 2K acceptance (DO THIS BEFORE B2–B6)
**Complexity 2/5 (mostly manual/API driving, little code) · any model assists; needs Kevin for account setup · ~1 hour**
- Kevin (manual): create Meta Developer app (Consumer type, Instagram Graph API
  product, Development mode), connect the MJ IG Business/Creator account, generate
  a long-lived user token with `instagram_basic` + `instagram_content_publish`.
- Get one real ~2K Edits export into Dropbox; call `files/get_temporary_link`.
- Manually run: `POST /{ig-user-id}/media` (media_type=REELS, video_url=temp
  link, test caption) → poll `GET /{container-id}?fields=status_code` → on
  FINISHED, `POST /{ig-user-id}/media_publish`. (Throwaway script or curl.)
- **Record: (a) did IG accept the 2K file? (b) does served quality match a native
  Edits upload of the same file?** (Post can be archived immediately after.)
- If rejected: fallback decision is already made — one high-bitrate 1080p
  transcode from the 2K master, done by us. Pipeline design is unchanged.

### Stage B1 — Cron foundation + auth (also fixes broken notifications)
**Complexity 1/5 · Sonnet/Haiku-capable · ~half day**
- Add `CRON_SECRET` env var; all `/api/cron/*` routes check
  `Authorization: Bearer <CRON_SECRET>` and 401 otherwise.
- Set up cron-job.org (free) to hit `/api/cron/send-notifications` and (later)
  `/api/cron/publish-posts` every 5 minutes with the auth header. Backup option:
  GitHub Actions `schedule` workflow doing an authenticated curl.
- Remove/neutralize the stale daily cron in `vercel.json` (or keep as backstop).
- Fix the stale comment at `send-notifications/route.ts:5-6`.

### Stage B2 — Dropbox integration
**Complexity 2/5 · Sonnet-capable · ~half day**
- Scoped Dropbox app on Kevin's Business account: `files.metadata.read` +
  `files.content.read`. Refresh-token OAuth (offline access); app key/secret/
  refresh token in env. No user-facing OAuth — it's Kevin's own account,
  server-side only.
- Convention: Edits exports land in one folder, e.g.
  `/Social Calendar/Ready to Post/`.
- `src/lib/dropbox.ts`: token refresh + `listReadyFolder()` +
  `getTemporaryLink(path)` (4-hour direct URL).
- Post dialog (`src/components/pipeline/PostDialog.tsx`): "Attach media from
  Dropbox" — lists the Ready folder via a small API route, selection stores the
  path on the post.

### Stage B3 — Schema migration
**Complexity 1/5 · Sonnet/Haiku-capable · ~1 hour**
New `supabase/migrations/005_publishing.sql`, adding to `social_posts`:
```sql
media_dropbox_path text,
publish_mode text CHECK (publish_mode IN ('auto','notify')) DEFAULT 'notify',
publish_status text CHECK (publish_status IN ('pending','processing','published','failed')),
ig_container_id text,
ig_media_id text,
ig_permalink text,
publish_error text
```
Update `src/types/database.ts` and `docs/database-schema.md` to match.

### Stage B4 — Publisher worker (the core)
**Complexity 4/5 · Use the strongest model available (Opus-class or better); NOT a Sonnet job · ~1 day**
New route `src/app/api/cron/publish-posts/route.ts` (pinged every 5 min, auth per B1):
1. Select posts: `stage='scheduled'`, `publish_mode='auto'`,
   `scheduled_at <= now()`, `publish_status IN ('pending','processing')` (and
   `publish_status IS NULL` treated as pending for backfill).
2. **pending** → Dropbox temp link → `POST /{ig-user-id}/media` with media_type
   mapped from `post_type` (reel→REELS, static→IMAGE, carousel→children flow,
   story→STORIES), caption assembled from `caption` + `hashtags` (validate ≤2200
   chars, ≤30 hashtags) → store `ig_container_id`, set `processing`.
3. **processing** → poll container `status_code`. Video processing takes minutes;
   the design REQUIRES resuming across cron runs via the stored container id —
   do not busy-wait inside one invocation (serverless timeout). On `FINISHED` →
   `POST /media_publish` → `stage='published'`, `published_at=now()`, store
   `ig_media_id`, fetch permalink. On `ERROR`/`EXPIRED` → failure path.
4. Failure path: one automatic retry (re-create container once — temp links
   expire after 4h, so always mint a fresh link on retry), then
   `publish_status='failed'`, store `publish_error`, send notification email so
   a missed post is never silent.
5. Long-lived IG token expires in ~60 days — add refresh handling (refresh when
   <10 days remain, as part of this cron; store token + expiry in a small
   `app_credentials` table or env-rotation note).
6. Idempotency guard: never create a second container for a post that has one;
   never publish twice (check `ig_media_id IS NULL` before `media_publish`).
API rate limit (50 API-published posts/24h) is far above Kevin's volume — a
simple count guard is enough.

### Stage B5 — Notify-to-post fallback
**Complexity 2/5 · Sonnet-capable · ~half day**
For `publish_mode='notify'` posts, at `scheduled_at` send an email (via existing
`src/lib/email.ts`) with: ready-to-copy caption+hashtags, the Dropbox file link,
and a note of the target platform/format. This is the path for Stories, trending
audio, collabs, custom covers. Web push upgrade (VAPID, service-worker push) is
a separate later task — email ships first.

### Stage B6 — Pipeline UI
**Complexity 2/5 · Sonnet-capable · ~half day**
- `PostDialog`: publish-mode toggle (auto/notify) + Dropbox picker (from B2).
- `PostCard` (both pipeline and calendar variants): status badge — queued /
  processing / published / failed — and IG permalink once live.
- "Publish now" button (manual trigger of the worker for one post) — doubles as
  the test harness.

---

## Complexity & Model Guidance Summary

| Stage | What | Complexity | Model | Est. |
|---|---|---|---|---|
| A1 | Responsive top bar | 2/5 | Sonnet ✅ | 0.5d |
| A2 | Scroll-snap week board + touch sensor | 3/5 | Sonnet OK, Opus safer | 0.5d |
| A3 | Screenshot verification protocol | 1/5 | Sonnet ✅ (mandatory stage) | 1–2h |
| B0 | 2K acceptance spike | 2/5 | Any (mostly manual + Kevin) | 1h |
| B1 | Cron pinger + CRON_SECRET auth | 1/5 | Sonnet/Haiku ✅ | 0.5d |
| B2 | Dropbox lib + picker | 2/5 | Sonnet ✅ | 0.5d |
| B3 | Migration 005 | 1/5 | Sonnet/Haiku ✅ | 1h |
| B4 | Publisher worker state machine | **4/5** | **Opus-class or stronger** | 1d |
| B5 | Notify-to-post emails | 2/5 | Sonnet ✅ | 0.5d |
| B6 | Pipeline UI | 2/5 | Sonnet ✅ | 0.5d |

**Why B4 is the exception:** it's a distributed state machine (multi-step IG
container lifecycle resumed across stateless serverless cron invocations), with
expiring resources (4h Dropbox links, 60-day tokens), idempotency requirements
(no double-publish), and failure paths where a silent bug means a real post
silently never goes out. This is exactly the shape of task where the prior
Sonnet-built code left latent issues (the unnoticed daily-cron downgrade, the
removed cron auth, the untested mobile layout). Give B4 to the strongest model
available and review the error paths by hand.

**Why the mobile bugs happened isn't (only) a model problem:** the layout was
never verified at phone width. Whichever model builds Workstream A, Stage A3's
screenshot protocol is the actual fix — enforce it as an acceptance gate, not a
suggestion.

---

## Environment / Setup

- Repo: `kev124-hub/Social-Calendar` (GitHub), deployed on Vercel **Hobby** plan
  (daily-cron limit — the reason for B1's external pinger).
- Working dir in remote sessions: `/home/user/Social-Calendar`.
- Commands: `npm run dev` / `npm run build` / `npm run lint`. No tests exist.
- `CLAUDE.md` → `AGENTS.md`: **read `node_modules/next/dist/docs/` before
  writing Next.js code** — v16 has breaking changes vs model training data.
- Existing env vars (names; values live in Vercel + `.env.local`): Supabase
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`), `GOOGLE_CLIENT_ID/SECRET`, `RESEND_API_KEY`,
  `NOTIFICATION_EMAIL`, `ANTHROPIC_API_KEY`.
- New env vars this plan introduces: `CRON_SECRET`, `META_APP_ID`,
  `META_APP_SECRET`, `INSTAGRAM_USER_ACCESS_TOKEN` (or stored/refreshed in DB
  per B4), `INSTAGRAM_USER_ID`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`,
  `DROPBOX_REFRESH_TOKEN`.
- Kevin's accounts: Dropbox Business (media store), IG must be Business/Creator
  type for the Graph API (required — verify before B0).
- Playwright/Chromium available in remote sessions at `/opt/pw-browsers/chromium`
  (do NOT run `playwright install`).

## Explicitly Ruled Out (don't re-suggest)

- Migrating to Notion/Airtable/ClickUp/etc. — settled, custom app stays.
- Third-party schedulers (Buffer/Later/Metricool…) — they re-encode; the whole
  point is eliminating that.
- Vercel plan upgrade for cron — external pinger chosen instead.
- TikTok/LinkedIn auto-posting in this build — deferred (TikTok needs app audit).
- Supabase Storage / Cloudflare R2 for video hosting — Dropbox Business chosen.

## Open Questions

1. **B0 spike outcome** — does the Reels API accept ~2K files, and does served
   quality match native Edits uploads? (Fallback already decided if not.)
2. Exact Edits export spec (container/codec/resolution) — confirm during B0 that
   it's MP4/MOV H.264 or HEVC + AAC (API requirement).
3. Web push (VAPID) timing — deliberately deferred; email-first in B5.
4. Whether Kevin wants `auto` or `notify` as the default for Reels once trust is
   established (schema defaults to `notify` for safety).

## Final Deliverable Reminder (Kevin's explicit request — do not drop)

When both workstreams are complete, **write a highly detailed `README.md`** for
this project, replacing the current create-next-app boilerplate. It should cover:
what the app is and who it's for (single-user Mustache Journey planner), the full
feature list (calendar + Google sync, pipeline, UGC tracker, ideas, inspiration
board, Chrome extension, Claude AI entry, PWA, notifications, and the new
publishing pipeline), architecture overview (Next.js/Supabase/Vercel/Dropbox/
Meta Graph API), the complete env-var reference, local dev + deploy instructions,
the cron/pinger setup, the Meta & Dropbox app setup steps (condensed from
`docs/integrations.md`), how auto-publish vs notify-to-post works, and
troubleshooting notes (token expiry, failed publishes, cron auth). Treat this as
the closing stage of the project — it is part of "done."

## Next Steps (first actions for the new session)

1. Read `AGENTS.md`, skim `docs/build-phases.md` and `docs/database-schema.md`,
   and the two key files: `src/components/calendar/CalendarView.tsx` and
   `src/components/calendar/WeeklyBoard.tsx`.
2. Build **Workstream A** (A1 → A2 → A3) — self-contained, no external accounts
   needed, immediate daily-life win. Verify with the A3 screenshot protocol
   before opening the PR.
3. In parallel or next: walk Kevin through the **B0 spike** (needs his Meta app
   + a real 2K file). Do not start B4 until B0's result is recorded here.
4. Then B1 → B2 → B3 → B4 → B5 → B6 in order. B1 alone fixes the broken
   notification timing and is worth shipping immediately.
