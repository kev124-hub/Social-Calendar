# Session Handoff — Social Calendar: start Workstream B, Stage B4 (IG publisher worker)

**Written: July 24, 2026.** Continues the plan in **`HANDOFF.md`** (the master
source-of-truth at repo root). Read `HANDOFF.md` first for the full Workstream A/B
plan and settled decisions; THIS file records everything that changed since it was
written and gives the concrete next task: **build Stage B4**.

> **Source-of-truth note:** `HANDOFF.md` is still the canonical plan and was already
> reconciled with the B0 spike results (see its "B0 results" subsection + Open
> Questions #1). This file is a session-continuation layer on top of it, not a
> replacement.

---

## Goal (unchanged)

Kevin (single user, creator brand **Mustache Journey**, `Hello@mustachejourney.com`)
owns a custom Next.js social-planning app. **Workstream A (mobile calendar fixes) is
done and shipped.** **Workstream B** = auto-publish pipeline that posts to Instagram
in the original ~2K quality by pulling the untouched file from Dropbox and handing its
URL to the Instagram Graph API (no third-party re-encode). Stages B1→B3 are now done
and live; **B4 (the publisher worker) is the next task.**

## Current repo state

- **Branch:** develop on `claude/mobile-calendar-fixes-a-314hyx` (the designated
  branch). Its prior PRs are all merged, so **restart it from `origin/main`** for new
  work: `git fetch origin main && git checkout -B claude/mobile-calendar-fixes-a-314hyx origin/main`.
- **`main` is at `d9b493b`** and local is in sync with `origin/main`. Working tree clean.
- **Stack:** Next.js 16.2.4 (Turbopack), React 19, TS 5, Tailwind 4, Base UI, @dnd-kit,
  Supabase (Postgres + Auth), Resend email, Vercel Hobby, `@anthropic-ai/sdk`.
- Deployed on Vercel project **`claude-social-calendar`** (team `kevins-projects-90f0c300`,
  projectId `prj_b4h1d24hW6eC3cvuAolBu7A98cKG`), production domain
  `https://claude-social-calendar.vercel.app`.

## What shipped since HANDOFF.md was written (all merged to main, live in prod)

| PR | What | Status |
|---|---|---|
| #4 | Workstream A — mobile calendar fixes (A1/A2/A3) | merged, live |
| #6 | B0 spike results reconciled into HANDOFF.md **+ B1** (cron auth) | merged, live |
| #7 | **B2 + B3** — Dropbox media picker + publishing schema (migration 005) | merged, live |
| #8 | Auto-advance post stage to `scheduled` when a date is set | merged, live |

### B1 — cron foundation + auth (done, verified in prod)
- `src/lib/cron-auth.ts` → `checkCronAuth(request)`: requires
  `Authorization: Bearer <CRON_SECRET>`, constant-time compare, **fails closed** if
  `CRON_SECRET` unset. **Reuse this in the B4 route.**
- `src/app/api/cron/send-notifications/route.ts` enforces it.
- **`src/proxy.ts`** (Next 16's renamed middleware) treats **`/api/cron`** as a public
  path — otherwise the auth-redirect bounces session-less cron callers to `/login`
  before they reach the handler. **B4's `/api/cron/publish-posts` is covered by this.**
- Cadence: external pinger on **cron-job.org** hits `/api/cron/send-notifications`
  **every 5 min** with the Bearer header (Vercel Hobby only allows daily crons; the
  `vercel.json` daily cron remains a backstop and auto-authenticates once CRON_SECRET
  is set). Verified: `{"sent":0}` 200 OK in prod.

### B2 — Dropbox integration (done, live; picker listing not yet confirmed with a real file)
- `src/lib/dropbox.ts` → refresh-token OAuth (cached short-lived access token),
  `listReadyFolder()`, **`getTemporaryLink(path)`** (4-hour direct URL of exact bytes).
  **B4 uses `getTemporaryLink(post.media_dropbox_path)` to get the `video_url`.**
- `src/app/api/dropbox/ready/route.ts` — session-authed GET for the picker.
- `PostDialog` — "Attach from Dropbox" picker; stores `media_dropbox_path` on the post.
- **Ready folder = `/Social Media/Ready to Post`** (Dropbox team namespace `ns:3692464`).
  Code default is this path (no `DROPBOX_READY_FOLDER` override needed). Created it via
  the Dropbox MCP.

### B3 — publishing schema (done, migration applied to prod DB)
- `supabase/migrations/005_publishing.sql` added to `social_posts`:
  `media_dropbox_path`, `publish_mode` (`auto`|`notify`, **DEFAULT `notify`**),
  `publish_status` (`pending`|`processing`|`published`|`failed`),
  `ig_container_id`, `ig_media_id`, `ig_permalink`, `publish_error`.
- Types in `src/types/database.ts` (+ `PublishMode`/`PublishStatus` aliases) and
  `docs/database-schema.md` updated to match.

### Post-B2 fix (#8): stage auto-advance
- In `PostDialog`, setting a Scheduled date now advances stage `idea/scripted/shot/editing`
  → `scheduled` (never demotes `scheduled`/`published`). Matters because **B4 selects
  `stage = 'scheduled'`** — a dated post must not sit in `idea`.

## B0 spike outcome — ✅ FULLY CLOSED, both arms PASS (updated July 24, 2026)

The fresh-vs-fresh deciding experiment has been run; B0 is done and B4's gate is open.
Full measurements live in `HANDOFF.md` § Stage B0 "B0 results".

- **B0(a) — 2K acceptance: PASS ✅.** The Graph API ingests the ~2K master end-to-end;
  audio survives at parity. **No 1080p fallback transcode needed.**
- **B0(b) — served-quality parity: PASS ✅.** Same master posted twice minutes apart,
  neither archived: native (`DbLqOclhOn1`) served 1080p VP9 + 720p VP9 at birth; the API
  arm (`DbLsSCijUL1`) served 720p H.264 only at ~1 h — **but on re-measure hours later
  serves 1080×1920 VP9 @2.27 Mbps + 720p VP9**, structurally identical to native at a
  slightly higher 1080p bitrate. Meta builds the high-quality ladder for API posts
  **asynchronously within hours, zero views required.** Round one's "permanent 720p cap"
  was an artifact of archiving that first test post immediately.
- **Consequences for B4 — build it exactly as designed below:**
  - **Keep URL ingest via `getTemporaryLink`** — validated end-to-end.
  - **Do NOT build the 1080p pre-transcode** — source resolution cannot influence the
    serving ladder, so it would fix nothing.
  - **The resumable / binary-push variant (`upload_type=resumable` +
    `rupload.facebook.com`) is NOT required** — it existed to mitigate a URL-ingest
    penalty that turned out not to exist. Optional future experiment only: whether
    pushing bytes shortens the transient window.
  - **The DONE-GATE is now OPEN.** The only remaining prerequisite is Meta credentials.
  - Keep the schema default `publish_mode='notify'` for safety, but flipping a post to
    `auto` is now a product choice, not a quality risk.
- **Document in the README troubleshooting section:** API-published reels serve 720p
  H.264 for roughly the first **1–3 hours**, then 1080p VP9 permanently — so schedule
  publishes a few hours ahead of peak-audience windows.
- **Still true and important:** archiving is not quality-neutral (it freezes/demotes the
  served rendition and pauses encode generation) — **never archive a post before
  measuring it.** DASH-manifest parsing is the only valid measurement method; screen
  recordings are confounded by ABR/player state.

## Environment / credentials

**Configured in Vercel (Production) + local `.env.local` (values live there, never in repo):**
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`, `NOTIFICATION_EMAIL` (`Hello@mustachejourney.com`), `NOTIFICATION_FROM_EMAIL`
- `GOOGLE_CLIENT_ID/SECRET`, `ANTHROPIC_API_KEY`
- **`CRON_SECRET`** — set & rotated; cron-job.org pinger sends `Authorization: Bearer <CRON_SECRET>`.
- **`DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` / `DROPBOX_REFRESH_TOKEN`** — scoped app,
  Full Dropbox access, scopes `files.metadata.read` + `files.content.read`, offline
  refresh token. (`DROPBOX_READY_FOLDER` optional; code defaults to `/Social Media/Ready to Post`.)

**NOT yet configured — needed for B4 (Kevin must provide):**
- `META_APP_ID` — the spike used Meta app **"Social Media Calendar", App ID `1002021345591349`**.
- `META_APP_SECRET`
- `INSTAGRAM_USER_ACCESS_TOKEN` — the spike used a **short-lived** token; B4 needs a
  **long-lived** (~60-day) token with `instagram_basic` + `instagram_content_publish`,
  plus refresh handling (refresh when <10 days remain).
- `INSTAGRAM_USER_ID` = **`17841455072367303`** (mustache.journey IG Business account).

## B4 design (from HANDOFF.md Stage B4 — complexity 4/5, strongest model, review error paths by hand)

New route **`src/app/api/cron/publish-posts/route.ts`**, pinged every 5 min, auth via
`checkCronAuth` (B1). It's a **state machine resumed across stateless cron runs** — do
NOT busy-wait inside one invocation (serverless timeout):

1. **Select** posts: `stage='scheduled'`, `publish_mode='auto'`, `scheduled_at <= now()`,
   `publish_status IN ('pending','processing')` (treat `NULL` as pending).
2. **pending** → `getTemporaryLink(media_dropbox_path)` → `POST /{ig-user-id}/media`
   with `media_type` mapped from `post_type` (reel→REELS, static→IMAGE, carousel→children
   flow, story→STORIES), caption = `caption` + `hashtags` (validate ≤2200 chars, ≤30
   hashtags) → store `ig_container_id`, set `publish_status='processing'`.
3. **processing** → poll `GET /{container-id}?fields=status_code`. On `FINISHED` →
   `POST /{ig-user-id}/media_publish` → `stage='published'`, `published_at=now()`, store
   `ig_media_id`, fetch `ig_permalink`. On `ERROR`/`EXPIRED` → failure path.
4. **Failure path:** one automatic retry (re-create container — temp links expire in 4h,
   so always mint a **fresh** link on retry), then `publish_status='failed'`, store
   `publish_error`, send a failure email via `src/lib/email.ts` so a missed post is never
   silent.
5. **Token refresh:** IG long-lived token expires ~60 days — refresh when <10 days remain
   as part of this cron; store token+expiry in a small `app_credentials` table or an
   env-rotation note.
6. **Idempotency:** never create a 2nd container for a post that has `ig_container_id`;
   never publish twice (check `ig_media_id IS NULL` before `media_publish`).
7. Rate limit (50 API posts/24h) is far above Kevin's volume — a simple count guard suffices.

**DONE-GATE IS OPEN** — B0 closed with both arms passing, so build B4 to completion as
specified. Keep `publish_mode` default = `notify` so nothing flips to `auto` unless
explicitly set (safety, not a quality gate now). Add a **"Publish now" manual trigger**
for one post (overlaps Stage B6) that doubles as the test harness — it's still the right
way to exercise the worker end-to-end before trusting the cron path.

## Reusable pieces already in place for B4
- `src/lib/cron-auth.ts` → `checkCronAuth(request)`
- `src/lib/dropbox.ts` → `getTemporaryLink(path)`
- `src/lib/email.ts` → `sendNotificationEmail(subject, body)`
- Migration 005 columns (above); `src/proxy.ts` already makes `/api/cron` public.
- Graph API base used in spike: **v21.0**.

## Gotchas / constraints (do not relearn the hard way)
- **`AGENTS.md`:** Next.js 16.2.4 has breaking changes vs training data — **read
  `node_modules/next/dist/docs/` before writing route code.** Middleware is **`src/proxy.ts`**
  (`export async function proxy(...)` + `config.matcher`), not `middleware.ts`. Route
  handlers use the Web `Request` API, are **not cached by default**, run on the Node
  runtime by default (so `node:crypto` works).
- **PostgREST schema cache:** after a migration adds columns, saves can fail with
  "could not find the column … in the schema cache" even though the column exists. Run
  **`NOTIFY pgrst, 'reload schema';`** in the Supabase SQL editor after any DDL. (This
  bit us during B2 — post saves silently failed until reload.)
- **`PostDialog` swallows Supabase errors** (no error surfaced on save) — a bad
  column/constraint fails silently. Keep this in mind when adding publish fields to writes.
- **Dropbox team namespace (`ns:3692464`):** if `list_folder`/`get_temporary_link`
  fails to resolve `/Social Media/Ready to Post`, add a `Dropbox-API-Path-Root` header.
  **Not yet confirmed** that the production picker actually lists a real file — the folder
  was empty at last check and Kevin was about to drop a test video. Verify this early.
- **Vercel Hobby:** daily cron only; cron-job.org drives the 5-min cadence. **Env var
  changes require a redeploy** to take effect. Preview deployments need the same env vars
  enabled for the Preview environment or they can fail (known issue #6 in HANDOFF.md).
- **Session sandbox egress is "Trusted"** — it CANNOT reach `graph.facebook.com`,
  Dropbox, or Supabase directly. So B4's live API calls can't be tested from the Claude
  Code session; test in production/preview or via Kevin. (To run API calls from a session
  you'd have to switch the cloud-env network access to Custom and allowlist the hosts.)
- **Git workflow:** develop on `claude/mobile-calendar-fixes-a-314hyx` (restart from main),
  commit with the `Co-Authored-By: Claude …` + `Claude-Session:` trailers, push, open a
  **draft** PR; Kevin reviews/merges (he's been squash-merging). Every GitHub comment/PR
  gets the Claude Code attribution footer. **Never put model IDs in commits/PRs/code.**
- PR reviews auto-subscribe this session to CI/comment webhooks; Vercel preview "Ready" =
  green. Schedule an hourly self check-in per PR and stop once merged.

## Errors / blockers
None open. B1/B2/B3 + the stage fix are live, and B0 is fully closed. Two things still
want doing: the Meta credentials must land in Vercel before B4 can be exercised, and it
is still unconfirmed that the Dropbox picker lists a real file in production (see gotcha
above).

## Open questions
1. ~~**B0(b)** — does served quality match native?~~ **RESOLVED ✅ — yes.** Parity is
   reached asynchronously within a few hours of publish. No pre-transcode, no resumable
   upload; B4 ships as designed. Only residual is the documented ~1–3 h 720p transient.
2. Long-lived IG token storage: `app_credentials` table vs env rotation — decide in B4.
3. Default publish mode for Reels once trust is established (schema defaults to `notify`).

## Next steps (start of the new session)
1. Read `AGENTS.md`, the relevant `node_modules/next/dist/docs/` route-handler pages,
   `HANDOFF.md` Stage B4, and `src/lib/{cron-auth,dropbox,email}.ts`.
2. Get the Meta credentials into Vercel (Kevin): `META_APP_ID` (`1002021345591349`),
   `META_APP_SECRET`, a **long-lived** `INSTAGRAM_USER_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`
   (`17841455072367303`).
3. Build `src/app/api/cron/publish-posts/route.ts` as the resumable container-lifecycle
   state machine above, reusing `checkCronAuth` + `getTemporaryLink` + `sendNotificationEmail`,
   with idempotency guards, one retry with a fresh temp link, failure email, and token refresh.
   Add a small migration if you introduce `app_credentials`.
4. Add a **"Publish now"** manual trigger for one post (test harness; overlaps B6). Keep
   `publish_mode` default `notify` as a safety default — B0 no longer gates auto mode.
5. Set up a cron-job.org pinger for `/api/cron/publish-posts` (every 5 min, same
   `CRON_SECRET` Bearer header) — Kevin.
6. Confirm the Dropbox picker lists a real file in prod; fix the team-namespace path-root
   header if needed.
7. Typecheck (`npx tsc --noEmit`) + `npm run build` before each PR; push a draft PR; let
   Kevin merge.

**To use this file:** start a new session, have it read `handoff-b4-start-2026-07-24.md`
(and `HANDOFF.md`), then begin at "Next steps" above.
