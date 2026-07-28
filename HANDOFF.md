# Session Handoff — Social Calendar: Mobile Fixes + 2K Auto-Publish Pipeline

**Handoff written: July 23, 2026.** (Do not infer the date from git history —
the repo's original build commits are from late April 2026; this document and
its plan are from July 23, 2026, and reflect the repo's state as of that day.)

> **Updated July 28, 2026.** The July 23–25 plan (Workstreams A and B) is
> complete and is preserved below as a historical record — source comments cite
> it. **For what is true today, read § CURRENT STATE.** Do not read the stage
> sections as a to-do list; every stage in them is finished.

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
4. **The task, in one line:** execute the plan in THIS file. Workstream A and
   Stages B0–B4 are **done**; the remaining work is **B5, B6, B7 and the README**.

> **How to use this file:** Everything needed — context, decisions, exact plan,
> file/line references, complexity ratings, and model guidance — is in this one
> file. The plan sections below are the original specification, annotated with
> what actually happened. Read the Current State block immediately below first —
> it is the fastest accurate picture of where the project stands.

---

## 📍 CURRENT STATE — read this first (updated July 28, 2026)

**The auto-publish pipeline is live and unattended. The per-event timezone
workstream is complete. Google Calendar sync now runs on app focus, not only on a
button. ReadyReel shipped on 28 July — every planned feature of the riviera-glass
redesign is now built.**

Everything below the § Goal heading is a **historical record** of the July 23–25
plan (Workstreams A and B) and is kept because source comments cite it — see
`instagram.ts`, `admin.ts`, `inspirations/route.ts`, `extension-key/route.ts`.
Read it for rationale, not for current state. This section is current state.

### What works right now, in production
- **Auto-publish (Instagram).** Posts with `publish_mode='auto'`, `stage='scheduled'`
  and a due `scheduled_at` publish themselves at original ~2K quality with no
  intermediate re-encode. Verified end to end in July (evidence table below).
- **Two cron-job.org pingers, every 5 minutes**, both sending
  `Authorization: Bearer <CRON_SECRET>`: `/api/cron/publish-posts` and
  `/api/cron/send-notifications`. **Confirmed healthy 28 July** from the
  cron-job.org dashboard — consistent 5-minute cadence, all 200 OK.
  - **`vercel.json` schedules only `send-notifications`, daily.** The real cadence
    for both is the external pinger, because Vercel Hobby allows only daily crons.
    Reading `vercel.json` alone will tell you the publish worker never runs. It
    does. The route header in `publish-posts/route.ts` says so; believe it over
    the config.
  - **A green 200 there does not prove publishing works.** That route returns 200
    even when `result.ok` is false, deliberately, so the pinger's failure alerts
    stay reserved for unreachability. A dead Instagram token would show 288 green
    checks a day. The state is in the JSON body.
- **Notify-mode posts** email at their scheduled time with caption, hashtags and a
  media link.
- **Per-event timezones.** `calendar_events.time_zone` is captured on every write
  path, honoured by every render and bucketing site, editable via a searchable
  picker, and round-trips through Google. Migration 008 is **applied**.
- **Google Calendar sync, both directions.** App → Google is immediate on every
  write. Google → app pulls on app open and on return to the tab, throttled to 5
  minutes and shared across views, plus the manual button in Settings.

### Migrations
001–008 are all applied. `008_event_timezone.sql` adds the nullable
`calendar_events.time_zone`; a null means "unknown" and readers fall back to the
device zone, which is a **permanently supported path**, not a migration window.

### Acceptance evidence (July 25, 2026 — unchanged, still the record)
| Path | Evidence |
|---|---|
| Manual "Publish now" | Post `1bc953a2` → container `18030885791835746` → media `17871012090627085` → https://www.instagram.com/reel/DbON80djKs7/ — 1 attempt, no retries |
| Automatic cron path | Post `52f959ab` → run 1 `considered:1, created:1` → run 2 `published:1`, https://www.instagram.com/reel/DbOQbNblyM7/ — **entirely unattended** |
| Auth + config | Cron returned `{"ok":true,...,"token":{"status":"ok","daysLeft":59}}` — proves CRON_SECRET, all four Meta env vars, a live `debug_token` round trip |
| **Served quality** | `DbON80djKs7` at ~15 min = 1080×1920 VP9 @2.27 Mbps + 720×1280 VP9 @1.57 Mbps + HE-AAC — full parity with a native upload, birth bitrates byte-identical to the B0 API arm |

### The one path still unproven
**`fb_exchange_token` token refresh.** It cannot run until ~**13 Sept 2026**, when
the token crosses the 10-days-remaining threshold. It fails non-fatally by design
and a missing `META_APP_ID`/`META_APP_SECRET` triggers a daily warning email, so
the worst case is a manual rotation. **Do not describe it as tested.**

### Stage numbering — check it before acting on a number

The riviera-glass stage table lived in a handoff deleted on 28 July, so the numbers
now have no home but this line. **Stage 5 = ReadyReel** (the revolving reels display
in `/home`) — **shipped 28 July**. **Stage 6 = the Today pane** (right panel
restyle) — the only stage left. Stages 7–9 are superseded or done.

Kevin refers to the reels as "stage 6", which produced one brief for the wrong
feature on 28 July. **If a stage number is used, confirm which feature is meant.**

### ReadyReel (Stage 5) — SHIPPED 28 July, PR #51

Phase C of `docs/design/home/riviera-glass-home-plan.md`, and the last unbuilt
piece of the redesign. Kevin's gate from 25 July — *"super useful, but only if
the thumbnails show"* — is met: they show. `handoff-stage5-readyreel-2026-07-28.md`
was deleted with this change, as it instructed.

`src/components/home/ReadyReel.tsx` renders it; the arithmetic lives in
`src/lib/ready-reel.ts` (pure, no React, no `@/` alias — `tests/ready-reel.test.mjs`
loads it directly) and the hover/spin CSS is in `globals.css`.

**The face is the file's own first frame**, played from `getTemporaryLink()` —
the URL the publish worker already ingests, so it needed no new auth path.
`/2/files/get_thumbnail_v2` was never called and `src/lib/dropbox.ts` still has
no thumbnail function. That option remains open as an optimisation if video
faces ever prove heavy; it was not needed and is not missing.

**Four rounds of Kevin's feedback shaped it, and each is worth not re-deriving:**
1. **Thumbnails show.** Confirmed on the preview.
2. **"just still images, no revolving."** v2 gave 2–3 files a static fan and only
   spun at 4+. That is a sparse-first design tuned for a volume this feature does
   not run at. **The fan is gone; the cylinder starts at two files.** One file
   keeps the floating hero card — a lone face on a cylinder spends half of every
   revolution showing its own blank back.
3. **"the spacing between them is very wide."** The radius floor was 0.8 of a face
   width, forcing a 260px ring where the geometry asked for 162px. It is 0.3 now
   and **binds at two faces only**; three and up sit at their exact apothem. It
   cannot be removed — a two-sided polygon has no apothem, so two cards would sit
   coplanar.
4. **"make the cards a little bigger."** Faces are 128/110/88px across the three
   count bands. The ceiling is the ~415px column, and the widest ring (eight
   faces) is ~320px.

**The three pre-diagnosed defects were fixed, not ported.** Radius computed from
count and face size with faces capped at 8; the drag copy reworded to the click
that exists; `glass-float` not duplicated.

**Two defects that only a renderer could have found.** The 3D transforms are pure
CSS, so they can be rendered in headless Chromium with placeholder cards and no
credentials at all — do this before trusting any change to the geometry.
- **The far side of the ring drew through the near side, MIRRORED.** The back of
  a rotated element is visible by default; Kevin would have seen his reels
  backwards. `backface-visibility: hidden`, prefixed form included for iOS Safari.
- **Faces were 2:3 against 9:16 content**, so `object-fit: cover` was cropping the
  top and bottom off every frame — where the hook text sits.

**Load-bearing, do not undo:**
- **Hover is CSS behind `@media (hover: hover)`, never React state.** `mouseenter`
  fires on a tap with no `mouseleave`, which would leave the cylinder paused after
  the first touch. Same trap as `glass.ts`'s `canHover` note from Stage 3. The
  hover *composes* with each face's ring slot via `--face-transform`; an absolute
  transform would rip the card out of the ring.
- **Backface-hiding costs coverage.** A ring whose faces sit more than 180° apart
  has an angle with nothing on screen and blinks empty. Guarded by a test.
- **`?links=1` on `/api/dropbox/ready` is opt-in.** Each link is its own Dropbox
  round trip and the post dialog's picker does not need one. Links are minted for
  the visible faces only; the count above the reel still reports the whole folder.
- **Links expire in ~4h**, so /home re-mints on a return to the tab once they are
  old enough. A stale link paints nothing, with no error anywhere to explain it.
- **Clicking a face prefills `PostDialog`; it is not a second write path.**
  `defaultDropboxPath`/`defaultTitle` seed a new post at the `editing` stage, which
  auto-advances to `scheduled` the moment a date is set.
- **Row 3 is needs-attention over events on the left, reel on the right.** Kevin's
  28 July ruling. There is no Row 4, whatever the home plan says.

**Open, none blocking:** no "Open Dropbox folder" button in the empty state (the
team-namespace URL is unknown — ask Kevin, it is two lines); the 1.35/1 column
ratio was never revisited after the bulk moved left; and **motion was never
verified from a build container** — frozen angles cannot settle whether a 22s
revolution is restful. Touch remains untestable here, as always.

### Stage 6 "Today pane" — resolved by action, 28 July; brief written

**A task brief exists: `handoff-stage6-today-pane-2026-07-28.md`.** It is scoped to
Stage 6 alone and is **to be deleted when Stage 6 ships** — it is not a second
state document. It carries two things that would otherwise be lost: that README §4
describes the *rejected* replace design, and that "fits without scrolling"
conflicts with keeping the TimeGrid.

It sat blocked on Kevin (merge vs replace vs defer) from 26 July. His request to
make the right panel show a chosen day settled it as **merge**: the panel keeps
its Calendars toggles and TimeGrid, and now follows whichever day is selected in
the week board. What remains of Stage 6 is only whether to restyle it in the
riviera-glass idiom.

### Open items, none of them blocking
- ~~`deleteEventFromGoogle` has no source guard.~~ **Out of date — it is guarded,
  in two layers.** Corrected 28 July after Kevin made it a merge condition and it
  was checked rather than assumed. `deleteEvent()` refuses a row whose `source` is
  not `'app'` *before touching anything*, and fails **closed** — an unrecognised
  source refuses rather than assuming ownership, so the four-value CHECK covers
  'tripit' and 'icloud' too, not just Google. Above it, `EventDialog` renders
  "Synced from Google — delete it there." with **no Delete button** for a
  non-app row, on both the calendar and `/home` surfaces since they share the
  dialog. This item described the pre-guard behaviour and was carried forward
  unverified through several documents.
- **All-day events could live in a `date` column** rather than `timestamptz` +
  zone. Tidier; deliberately deferred to avoid a second migration mid-workstream.
- **An app-created event edited *in Google* does not come back.** The app owns what
  it created; full bidirectional conflict resolution was never attempted.
- **Deleting an event in Google now deletes it here. FIXED 28 July.** The pull
  upserted and only upserted, so a Google-side deletion left its row in the app
  permanently — Kevin hit this the same day. After each calendar's pages are
  fetched, the sync now compares the ids Google returned against the
  google-sourced rows it holds for that calendar inside the queried window, and
  removes the difference. `staleEventIds` is pure and tested, because it is the
  only part of the sync that destroys data.
  - `showDeleted=true` is deliberately **not** the mechanism: with
    `singleEvents=true`, Google's list endpoint does not reliably return
    standalone deleted events, and the documented route for deletions is
    incremental sync with a `syncToken` — a token per calendar plus 410 handling.
    Comparing what came back needs neither and is exact for the window fetched.
  - **Guards:** it runs only after every page succeeded (the loop throws
    otherwise, so a partial fetch can never read as "Google deleted everything");
    it is scoped to `source = 'google'`, that one calendar, and the queried
    window; and a row without an `external_id` is never touched.
  - **Outside the 30/90-day window nothing is reconciled**, so deleting a
    far-future event does not propagate until the window reaches it.
  - **Deletion is deliberately NOT symmetric.** Google → app propagates, as of
    this change. App → Google does not, for a synced event: `deleteEvent()`
    refuses it outright. That asymmetry is correct — Google owns those rows, and
    the alternative of deleting locally only would have the pull re-import the
    row on the next sync, so the event returns by itself and reads as a bug in
    whichever direction you were not expecting.
- **A local edit to a Google-sourced event is reverted by the next pull.** The
  upsert overwrites the mapped fields. This is why sync is on focus rather than a
  background cron — an edit vanishing while you watch is at least attributable.
- ~~The upcoming-events list caps at 5 with no `+n more`.~~ **Wrong — it has one.**
  `EventsPanel.tsx:254` renders `+{extra} more →` (`MAX_ROWS = 5`), confirmed on
  screen showing "+34 MORE". This item was carried forward from an older handoff
  without checking the code; corrected 28 July. A real nuance survives: the count
  is computed off a capped `allUpcoming`, so beyond ~40 upcoming events the "+n"
  understates — see the comment there.
- The 24h window on failed posts, and `/home`'s 12s abort not being applied to
  `CalendarView`/`PipelineBoard` — flagged repeatedly, never ruled on.
- **TripIt-fed events rendered a `GMT+0` wall clock. FIXED 28 July.** A subscribed
  feed defaults to UTC, so every flight arrived labelled UTC and we rendered the
  UTC wall clock: `1:04 AM GMT+0` where Google shows `9:04pm`. `toAppEventRow` now
  treats a UTC zone on a **timed** event as a placeholder and drops it, so the row
  reads in the device zone — byte-for-byte what Google displays. All-day rows
  **keep** UTC, because there the zone only decides which local day the stored
  midnight falls on; dropping it would revive the day-early bug step 3 fixed.
  Existing rows repair themselves on the next sync, since the pull upserts on
  `external_id`.

  **What this does not do, deliberately.** It does not show the true local time at
  the far end of a journey. Google does not either — it renders a 9:00 AM Dublin
  arrival as `4:00am` Eastern, and TripIt's real times (`9:04 PM EDT` /
  `9:00 AM IST`) exist only as **prose in the event description**, which is not a
  field anything can read. Matching Google is the goal; beating it would need the
  venue zone derived from an airport code, which is a different project.

  **The structural gap, recorded rather than fixed:** `calendar_events` holds ONE
  zone, and a flight has two. `end.timeZone` is sent by Google and discarded by
  the pull, and every render of `ends_at` uses the *start's* zone. The per-event
  timezone plan modelled one zone per event by design — it was written around
  "dinner at 8, wherever I am" — so this is a gap in the plan rather than a defect
  in its implementation. Fixing it means a migration for `end_time_zone`, capture,
  render, push, and a ruling on which end decides the day a range files under.

  **Kevin's stance, 28 July:** he will use the calendar knowing timezones are still
  imperfect, cross-checking against **TripIt and Flighty**, and will report
  concrete problems as they appear. So treat further timezone work as *reactive*
  — do not pre-emptively build the two-zone model without a real case from him.

- **The TWA Hotel check-in instant does not match Google, and is unexplained.** We
  stored `12:00Z` (8:00 am Eastern); Google shows 1:00 pm Eastern (`17:00Z`). Five
  hours apart, so it is not the UTC-placeholder issue wearing a different hat, and
  the fix above does not touch it. Likely TripIt publishing a nominal noon for a
  hotel check-in while the native record says otherwise — note Google also shows a
  "check-out" at 7–8pm, which is not a real checkout time either. Diagnose with:
  `select title, starts_at, time_zone, source, external_id, calendar_id from
  calendar_events where title ilike '%TWA%' order by starts_at;` — two rows means
  duplicate records from two calendars; one row at `12:00Z` means the feed says so.
  Left alone until it bothers anyone.

### Verification you cannot do in this container — plan around it
- **Touch.** CDP touch events reach the page but do not drive Chromium's
  compositor. Every phone bug this project has had was found by Kevin, not by a
  test. Phase A shipped two tap bugs past a clean desktop pass.
- **Anything requiring the database.** There is no `.env.local` here and no
  credentials, so the app cannot run against real data.
- **The Vercel preview URL and `dropboxusercontent.com`** — the egress proxy
  returns 403 for both.
- **Consequence, learned the hard way on 28 July:** `tsc --noEmit` clean plus
  `next build` compiling does **not** cover render-time correctness. A closure
  reading a `const` declared later in the same component passes both and crashes
  the page — TypeScript will not claim use-before-declaration through a closure.
  `/calendar` shipped white because of exactly that. **For UI work the preview is
  the gate; green local checks are not.**

### Repo / workflow state
- **After a PR merges, prune before you reset:**
  `git fetch --prune origin && git checkout -B <branch> origin/main`. Without
  `--prune` the stale `origin/<branch>` ref makes the stop hook report GitHub's
  merge commit as your own unverified work. See `AGENTS.md`.
- `node_modules` is NOT present in a fresh container — run `npm ci` first, or the
  `node_modules/next/dist/docs/` guides that `AGENTS.md` mandates won't exist.
- `npm run build` succeeds with **no env vars set at all**.
- `npm run lint` reports **37 pre-existing problems** on `main` (17 errors, 20
  warnings) in older files. Don't mistake them for regressions. This baseline has
  been carried wrongly by **five** documents now (it read 42 until 26 July, and
  36 in three commit messages on 27 July). **Re-run the linter yourself rather
  than trusting any document, including this one.**
- `npm test` is 242 checks, no framework. **Run it under a non-UTC `TZ`** — several
  of the bugs it guards are invisible at UTC+0. See `tests/README.md`.
- Superseded handoffs are **deleted, not archived** — they are in git history.
  `handoff-b4-start-2026-07-24.md` went on 26 July;
  `handoff-riviera-glass-2026-07-25.md`,
  `handoff-riviera-glass-2026-07-26-consolidated.md` and
  `handoff-2026-07-27-stage9-shipped.md` went on 28 July, with their live content
  folded into this section. This file is the source of truth.

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
- **Run the B0 spike before building the pipeline** — ✅ **DONE, both arms PASS
  (July 24, 2026).** The Reels API accepts ~2K files (despite the *recommended*
  1080×1920 spec) and served quality reaches native parity within a few hours.
  The contemplated fallback (one high-bitrate 1080p transcode by us) is **not
  needed and must not be built** — see § Stage B0 "B0 results".
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

## Current State of the Repo — AS OF JULY 23, 2026 (historical)

> Superseded by § CURRENT STATE at the top of this file. Kept because the
> "Known problems" and "Mobile bug → root cause map" below record why things
> were built the way they were. Do not read it as present-day fact.

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
6. ~~**Vercel PREVIEW deployments fail for every branch**~~ — ✅ **RESOLVED (observed
   green on PR #10, July 25, 2026).** Previously (diagnosed from build logs, PR #1):
   `Error: supabaseUrl is required.` during page-data collection for
   `/api/extension-key`, because `src/app/api/extension-key/route.ts:5-8` creates the
   Supabase admin client at module scope and the Supabase env vars
   (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) were enabled only for the
   Production environment in Vercel. The env vars are now evidently enabled for Preview
   too — preview builds complete and deploy. **Green Vercel checks are now the
   expectation on PRs; a red one means something is actually wrong.**
   **Hardening now done in code (B4 session, July 25, 2026).** The diagnosis above
   named only `/api/extension-key`, but there was a **second instance** with the
   same module-scope pattern in `src/app/api/inspirations/route.ts` — so `npm run
   build` failed locally without env vars even after fixing the first. Both now
   build their admin client lazily inside a `function admin()`, and `npm run build`
   completes with **no environment variables set at all**. Previews therefore no
   longer depend on the Vercel dashboard config staying correct. Watch for this
   pattern in any new route: a module-scope `createClient(...)` breaks the build,
   not just the runtime.
7. ~~**PWA manifest and service worker never load in production.**~~ ✅ **FIXED
   July 25, 2026.** The browser logged `Manifest: Line: 1, column: 1, Syntax
   error` on every page load. `public/manifest.json` is valid JSON — the cause was
   `src/proxy.ts`: its matcher excluded `_next/static`, `favicon.ico` and image
   extensions but not `/manifest.json` or `/sw.js`. Browsers fetch the manifest
   **without credentials** by default, so it arrived session-less, got redirected
   to `/login`, and the browser parsed login HTML as JSON. Both paths are now
   treated as public. Worth remembering when adding any other unauthenticated
   browser-initiated fetch.
8. **Supabase sends weekly "project will be archived for inactivity" notices**,
   regardless of how heavily the app is used. Unfixed, an actually-paused project
   takes the database offline and scheduled posts silently fail to publish. Full
   analysis, diagnostic sequence, and candidate fixes are in **Stage B7** below —
   start with the 30-second check that the notice even refers to this project.

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

### Stage B0 — Spike: validate 2K acceptance ✅ CLOSED (both arms PASS)
**Complexity 2/5 (mostly manual/API driving, little code) · any model assists; needs Kevin for account setup · ~1 hour**
- Kevin (manual): create Meta Developer app (Consumer type, Instagram Graph API
  product, Development mode), connect the MJ IG Business/Creator account, generate
  a long-lived user token with `instagram_basic` + `instagram_content_publish`.
- Get one real ~2K Edits export into Dropbox; call `files/get_temporary_link`.
- Manually run: `POST /{ig-user-id}/media` (media_type=REELS, video_url=temp
  link, test caption) → poll `GET /{container-id}?fields=status_code` → on
  FINISHED, `POST /{ig-user-id}/media_publish`. (Throwaway script or curl.)
- **Record: (a) did IG accept the 2K file? (b) does served quality match a native
  Edits upload of the same file?** (~~Post can be archived immediately after.~~
  **This instruction was wrong and caused round one's false conclusion — archiving
  freezes rendition generation. Never archive a post before its encodes settle.**)
- If rejected: fallback decision is already made — one high-bitrate 1080p
  transcode from the 2K master, done by us. Pipeline design is unchanged.

#### B0 results (executed July 23–25, 2026) — FINAL: both arms PASS ✅

**Measurement method (validated — use this for any future quality question).**
Pull the post's served **DASH manifest**: `video_dash_manifest`, embedded in the
logged-in instagram.com page scripts, then parse the `<Representation>` attrs for
rung resolution / codec / bitrate. **Screen-recording / frame-level comparison is
NOT valid** — ABR and player state confound it (an early −91 dB "silent reel"
scare was player mute during capture, not a pipeline bug).

`taken_at` in the same page data gives the publish timestamp, so any measurement
can be aged accurately. A healthy settled post shows a 1080×1920 VP9 rung.

**Round 1 (July 23–24) was confounded and its conclusion was retracted.** It
compared an early API test post (12 views, archived for most of its life) against
an established native post (2.1K views) and read the difference as "API = worse".
The arms differed in age, views **and** archive history at once, so the comparison
could not support that. It survives only as the source of two lasting lessons: use
DASH manifests rather than screen recordings, and never archive a post you intend
to measure. Rounds 2 and 3 below are the evidence.

**Round 2 (July 24) — the clean two-arm experiment.** The *same* Edits 2K master,
posted twice minutes apart as normal fresh reels on `mustache.journey`, neither
archived, both measured at equal age:

| Arm | Post | Served ladder (at ~1 h) | Served ladder (re-measure, few hours) |
|---|---|---|---|
| Native (Edits app) | `instagram.com/reel/DbLqOclhOn1/` | 1080×1920 VP9 @2.03 Mbps + 720×1280 VP9 @1.47 Mbps | — |
| **API** (REELS, `video_url` = Dropbox `files/get_temporary_link` — the exact B4 design) | `instagram.com/reel/DbLsSCijUL1/` | 720×1280 H.264 @1.48 Mbps — only rung | **1080×1920 VP9 @2.27 Mbps + 720×1280 VP9 @1.57 Mbps** |

Audio: HE-AAC ~116 kbps native vs ~118 kbps API — full parity.

At ~1 h the API arm looked like a real penalty under the pre-registered decision
rule. The re-measure a few hours later is what settled it: the ladder was not
capped, it was **still being generated**.

**Round 3 (July 25) — production verification of the built B4 pipeline.** Not a
spike script this time: the deployed pipeline published
`https://www.instagram.com/reel/DbON80djKs7/` for real (Dropbox master → Graph
API URL ingest → container → publish).

| Age | Served ladder |
|---|---|
| 5 min | 720×1280 H.264 @1.48 Mbps + HE-AAC 118 kbps — the expected birth state |
| ~15 min | **1080×1920 VP9 @2.27 Mbps + 720×1280 VP9 @1.57 Mbps + HE-AAC** — full ladder |

The birth bitrates were **byte-identical to round 2's API arm**. Same master
through a deterministic encoder producing the same numbers is direct evidence the
pipeline handed Meta the exact original bytes — no corruption, no intermediate
re-encode anywhere in the chain. The transient window here was only **~15
minutes**, versus a few hours in round 2; treat the window as variable, not fixed.

- **B0(a) — Does the Reels API accept the ~2K file? ✅ PASS — CLOSED.** Container →
  poll → publish succeeded end-to-end; audio survives ingest at parity. **No
  fallback transcode needed on acceptance grounds.**
- **B0(b) — Does served quality match a native upload? ✅ PASS — CLOSED.** At birth
  the API post serves 720p H.264 only, but **Meta generates the high-quality VP9
  renditions for API posts asynchronously, with zero views required.** On
  re-measure the API arm serves a ladder structurally identical to native, at a
  slightly *higher* 1080p bitrate. The one-time transient is a **latency**
  characteristic, not a quality cap. Observed windows: **~15 min in production
  (round 3), up to a few hours in round 2** — variable, and not something to
  design around beyond scheduling.
- **Round one's "permanent 720p cap" reading was wrong, and why matters:** that
  first API test post (`DbJBleDD-BU`) was **archived immediately after publishing**,
  which froze rendition generation. The confounds of round one (upload path vs.
  age/views vs. archive history) are eliminated by the two-arm test above.
- **Corrected folklore:** VP9/1080p renditions are **not** engagement-promoted.
  Native uploads get the full ladder at birth with zero views; API uploads get it
  minutes-to-hours later, also without engagement.
- **Archiving is NOT quality-neutral** — it appears to freeze/demote the served
  rendition and pause encode generation. **Never archive a post before its encodes
  settle**, and treat any future archive-related feature as quality-risky.

**Design implications for B4 — build it exactly as § Stage B4 specifies.**
- **URL ingest via `getTemporaryLink` is validated end-to-end. Keep it.**
- **Do NOT build a 1080p pre-transcode.** The 2K file was accepted fine and source
  resolution cannot influence the serving ladder — a self-transcode would address
  nothing.
- **The resumable / binary-push upload variant (`upload_type=resumable` +
  `rupload.facebook.com`) is NOT required.** It was scoped as the mitigation for a
  URL-ingest penalty that turned out not to exist; URL ingest achieves parity on
  its own. Optional future experiment only, and only if the transient window ever
  matters: does pushing bytes shorten it further?
- The container/poll/publish **state machine design is unchanged and validated.**
- **Known characteristic to document (README troubleshooting):** API-published
  reels serve a 720p H.264 birth encode for a transient window — **~15 min
  observed in production, up to a few hours in testing** — then the full 1080p VP9
  ladder permanently. Native uploads get 1080p at or near birth. Recommended
  usage: **schedule publishes ahead of peak-audience windows** and the window is
  irrelevant.
- **No B4 code changes are required by any of these results** (confirmed again
  after round 3's production verification).

**Build order impact:** B1 → B2 → B3 were unblocked and are **shipped** (see the
B4-start handoff). **B4's done-gate is OPEN** — nothing about auto-publish is
gated on further measurement. Remaining B4 prerequisite is credentials only
(`META_APP_ID`, `META_APP_SECRET`, a long-lived `INSTAGRAM_USER_ACCESS_TOKEN`,
`INSTAGRAM_USER_ID`). The schema default `publish_mode='notify'` stays as-is for
safety — flipping individual posts to `auto` is now a product choice, not a
quality risk.

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

### Stage B4 — Publisher worker (the core) — ✅ DONE, VERIFIED LIVE (July 25, 2026)
**Complexity 4/5 · Use the strongest model available (Opus-class or better); NOT a Sonnet job · ~1 day**

> **Status: built AND proven end-to-end in production.** The full chain published a
> real reel from the app: Dropbox `get_temporary_link` → Meta container → poll to
> FINISHED → `media_publish` → permalink, with no middleman re-encode.
>
> **First live run (the acceptance evidence):**
> - Post `1bc953a2-a1e5-4993-aee3-3b0588a50b75` ("Auto Post test"), source
>   `/social media/ready to post/need a minute.mp4`.
> - Call 1 → `container_created` (container `18030885791835746`).
> - Call 2, ~1 min later → `published`, media `17871012090627085`,
>   permalink `https://www.instagram.com/reel/DbON80djKs7/`.
> - Cron smoke test with no posts due returned
>   `{"ok":true,"considered":0,...,"token":{"status":"ok","daysLeft":59}}` — which
>   also proves `CRON_SECRET` auth, all four Meta env vars, and a successful
>   `debug_token` round trip against Graph.
>
> **Also settled by this run:**
> - The **Dropbox picker works in production** and stores a real `path_lower`
>   (`/social media/ready to post/…`). This closes the last open B2 verification.
> - `app_credentials` works: the env-sourced token was inspected once and persisted
>   with `expires_at` = 2026-09-23, matching Meta's debugger exactly. The DB value
>   wins from now on, later runs skip `debug_token`, and the first real refresh is
>   due around **13 Sept 2026** (the 10-days-remaining threshold).
> - `fb_exchange_token` refresh remains **unexercised** until that date — it is the
>   one path in B4 no test has covered. It fails non-fatally by design.
>
> **The automatic path is verified end to end.** The cron-job.org pinger for
> `/api/cron/publish-posts` is set up (every 5 min, `Authorization: Bearer
> <CRON_SECRET>`), and post `52f959ab` went out with no human step at all:
> - run 1 → `considered:1, created:1`, container `18030889445835746`
> - run 2 → `published:1`, media `18097399642995606`,
>   https://www.instagram.com/reel/DbOQbNblyM7/
>
> Run 1 is the important one: it exercised the candidate-selection query —
> `stage='scheduled'` + `publish_mode='auto'` + `scheduled_at <= now()` + the
> status filter, backed by the partial index — which manual "Publish now" bypasses
> entirely by looking a post up by id. Run 2 then carried the same post through
> poll → `media_publish` → permalink across a **separate serverless invocation**,
> which is the resumption behaviour the whole state machine exists for.
>
> **App-side alerting (added July 25, 2026 — closes Open Question #7):** every way
> publishing can break now produces an email, each rate-limited to once per 24h by
> `src/lib/warn-once.ts` (markers live in `app_credentials`, the only durable state
> a stateless cron has; one key per condition so no warning masks another):
> publishing not configured at all, token cannot be refreshed, token invalid,
> token refresh failing near expiry, plus the un-throttled per-post failure and
> "published but the record didn't update" emails. **When everything works the
> cron sends nothing** — 288 silent runs a day — so an email always means action is
> needed. Two of these were previously un-throttled and would have emailed every 5
> minutes while the condition held; that is fixed.
>
> **Cron alerting:** both cron-job.org jobs should have *notify on failure* and
> *notify when disabled* enabled (not notify-on-success — 288 emails/day). This is
> the external watchdog layer: the app's own Resend emails cover per-post failures
> and token expiry, but they only work when the app works. cron-job.org catches the
> cases where it doesn't — 401s, 500s, Vercel down, **a paused Supabase project**
> (the DB query throws → 500), and cron-job.org auto-disabling a job after repeated
> failures, which would otherwise stop everything silently.
>
> **What shipped:**
> - `supabase/migrations/006_publish_worker.sql` — `publish_locked_at`,
>   `publish_attempts`, `ig_container_created_at` on `social_posts`; the
>   `app_credentials` table; the publish-queue partial index. **Applied to the prod
>   DB on July 25, 2026**, followed by `NOTIFY pgrst, 'reload schema';`.
> - `src/lib/instagram.ts` — Graph API client (v21.0 pinned), caption assembly and
>   validation, media-type resolution, container lifecycle, token debug/exchange.
> - `src/lib/ig-token.ts` — token storage in `app_credentials` + unattended refresh
>   at <10 days remaining, email warning at <3 days. Resolves Open Question #5 in
>   favour of the table (a Vercel env var can't be rewritten by the running app).
> - `src/lib/publisher.ts` — the state machine, shared by both entry points.
> - `src/app/api/cron/publish-posts/route.ts` — cron entry, `checkCronAuth`.
> - `src/app/api/posts/[id]/publish/route.ts` — session-authed "Publish now".
>
> **Deliberate design calls worth knowing before changing it:**
> - **Leases, not just status.** Overlapping cron runs are possible (a run every 5
>   min, and a slow run can outlive its interval), so a post is claimed by
>   compare-and-swapping `publish_locked_at`. A lease older than 10 min is
>   stealable, so a crashed run costs one cycle instead of wedging a post forever.
> - **Double-publish is guarded three ways**: the lease, a fresh re-read of
>   `ig_media_id` immediately before `media_publish`, and an `ig_media_id IS NULL`
>   filter on the write that records the result.
> - **The scariest case is handled explicitly**: if the publish succeeds but the
>   database write fails, the post IS live on Instagram and our record is wrong.
>   That path emails and logs "the post IS live — do not publish it again" rather
>   than looking like a failure to be retried.
> - **Carousels cannot be auto-published** and fail fast with that message:
>   `social_posts` holds one `media_dropbox_path` and a carousel needs several.
>   Supporting them means a schema change (a media array), which was out of scope.
>   Notify mode covers them today. Same fail-fast treatment for `article` posts,
>   non-ingestible files (webm/heic), and captions over the 2200-char / 30-hashtag
>   limits — retrying can't fix any of these, so they don't burn the retry budget.
> - **Token refresh is the one piece the B0 spike never exercised** (the spike used
>   a hand-made short-lived token). It follows Meta's documented `fb_exchange_token`
>   flow, which suits this app's Facebook-Login-based Meta app; if Kevin's token
>   turns out to be an Instagram-Login token, the endpoint is
>   `graph.instagram.com/refresh_access_token` instead. Refresh failures are
>   non-fatal by design — worst case Kevin rotates by hand, never a lost post.
>
> Original specification follows.

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

### Stage B5 — Notify-to-post fallback — ✅ DONE (July 25, 2026)
**Complexity 2/5 · Sonnet-capable · ~half day**
For `publish_mode='notify'` posts, at `scheduled_at` send an email (via existing
`src/lib/email.ts`) with: ready-to-copy caption+hashtags, the Dropbox file link,
and a note of the target platform/format. This is the path for Stories, trending
audio, collabs, custom covers. Web push upgrade (VAPID, service-worker push) is
a separate later task — email ships first.

> **Migration 007 applied July 25, 2026** (with `NOTIFY pgrst, 'reload schema';`),
> so this is **live in production**. Not yet observed against a real post: the
> first genuine reminder is the confirmation. If one fails to arrive, the cron
> response body carries `notifyError`.
>
> **What shipped:**
> - `supabase/migrations/007_notify_to_post.sql` — `notified_at` on `social_posts`
>   + a partial index mirroring 006's publish queue.
> - `src/lib/notifier.ts` — `runNotifyCycle` (selection, claim, send) and
>   `buildNotifyEmail` (exported so the email body is testable without sending).
> - `/api/cron/send-notifications` — now runs the notify cycle **and** the original
>   generic queue, each isolated so one failing can't stop the other. **No new
>   pinger needed**: this endpoint was already being hit every 5 minutes.
> - `PostDialog` clears `notified_at` when a post is saved with a *future*
>   `scheduled_at`, so a post that slipped gets a fresh reminder at its new time.
>
> **Four decisions worth keeping:**
> 1. **Reads `social_posts` directly rather than draining the `notifications`
>    table.** A queued row bakes its message at scheduling time; captions get
>    edited right up to posting, so a pre-baked reminder would email a stale
>    caption. Composing at send time is the whole point.
> 2. **Claim before send.** `notified_at` is written *before* the email, guarded by
>    `.is('notified_at', null)`. A crash between the two costs one reminder (the
>    post is still visibly scheduled in the pipeline); the other order would risk
>    an email every 5 minutes, which Kevin cannot stop.
> 3. **24h overdue grace window.** Every pre-existing post defaults to
>    `publish_mode='notify'`, so without a cutoff the first run after deploy would
>    email about every post ever scheduled in the past. Posts older than the window
>    are skipped and **not** marked, so rescheduling one still works.
> 4. **Not Instagram-only.** Unlike the publish worker, notify mode is the manual
>    fallback for every platform — that is what it is for.
>
> **Known limitation:** the email prints `scheduled_at` in **UTC** (`toUTCString`),
> matching the existing B4 failure emails. The server has no idea of Kevin's
> timezone. Harmless in practice — the email arrives *at* the scheduled moment —
> but if it ever reads wrong, that's why. A fix needs a stored timezone preference.
>
> **Verification:** 22 checks against a stubbed PostgREST client and the real
> `buildNotifyEmail` — subject/format/caption/hashtags/download link/expiry note,
> HTML escaping (captions are free text: `&`, `<script>`, quotes), all four
> degraded cases (no media, no caption, no post_type, no title), Dropbox-link
> failure falling back to the path, the selection filters, the 24h window, claim
> ordering, and a post already claimed by another run. The rendered email was also
> screenshotted at 390px. Build compiles; eslint at the 42-problem baseline.
>
> **Also discovered:** the `notifications` table has **no producer** — nothing in
> the app has ever written to it, so that cron loop has always drained an empty
> queue. It is left working for calendar events and the future web-push upgrade.
> `notification_at` / `notification_method` on `social_posts` are likewise dead.

### Stage B6 — Pipeline UI — ✅ DONE (July 25, 2026)
**Complexity 2/5 · Sonnet-capable · ~half day**
- `PostDialog`: publish-mode toggle (auto/notify) + Dropbox picker (from B2).
- `PostCard` (both pipeline and calendar variants): status badge — queued /
  processing / published / failed — and IG permalink once live.
- "Publish now" button (manual trigger of the worker for one post) — doubles as
  the test harness. **The API half is already built in B4**
  (`POST /api/posts/[id]/publish`); B6 only needs to wire a button to it.

> **What shipped:**
> - `src/components/ui/PublishStatusBadge.tsx` — **one** derivation
>   (`derivePublishState`) shared by every surface, so the pipeline board, the grid
>   and the calendar can never disagree about a post's publish state.
> - `PostDialog` — a Publishing section (IG-only): auto/notify toggle persisted to
>   `publish_mode`, live badge, IG permalink, last `publish_error`, and the
>   "Publish now" button with a readable account of what one step did.
> - Kanban card, grid card and calendar card all carry the badge; the kanban card
>   also shows the failure reason inline and links the permalink.
>
> **Three decisions worth keeping:**
> 1. **The badge trusts `ig_media_id` over `publish_status`.** The worker writes
>    the media id first and can die before the status (see `publishFinished`), so
>    a stale `failed` on a post that is actually live must not be believed — that
>    is the one wrong answer that could make someone publish twice.
> 2. **"Publish now" saves the post first, always.** The worker reads the row from
>    the database, so an unsaved caption or a just-picked Dropbox file would
>    otherwise be silently ignored. Verified by test, not by inspection.
> 3. **The follow-up wording is conditional.** The cron only resumes a post that is
>    auto-mode, scheduled and due (`selectCandidates`). A notify-mode post pushed
>    manually will sit at "processing" until someone clicks again, so the UI says
>    "click again" in exactly that case and "the scheduler will finish it" otherwise.
>
> **Only the toggle writes to the schema; no migration, no API change, no B4
> change.** The publish-mode toggle is shown for Instagram only, because
> `publish_mode` is meaningless to the worker on any other platform — promising
> automation the worker won't perform would be a lie in the UI.
>
> **Verification (Playwright, per Stage A3's protocol):** rendered against mocked
> PostgREST data at 390×844 and 1280×800 — all eight badge states (including
> "media id beats stale failed status"), the dialog's failed/published/queued
> states, kanban + grid + calendar cards, and a full "Publish now" round trip that
> confirmed the save-happens-first ordering and the badge refresh. `npm run build`
> compiles; `npx eslint src` is at the documented 42-problem baseline, unchanged.

### Stage B7 — Supabase "project will be archived for inactivity" notices
**Complexity 2/5 (diagnosis, not construction) · Sonnet-capable · ~1–2h, mostly Kevin-side checks**

Kevin receives **weekly Supabase notices that the project will be archived/paused
for inactivity, no matter how much he uses the app.** Left alone this is worse than
an annoyance: on the free tier an actually-paused project takes the database
offline, and once Workstream B is live that means **the publish cron fails and
scheduled posts silently don't go out.** It is a reliability risk for auto-publish,
which is why it belongs in this plan rather than in a someday pile.

**Why the obvious explanation doesn't fit.** Supabase free projects pause after
~7 days of inactivity, but this project should never look idle: since B1 an
external cron-job.org pinger hits `/api/cron/send-notifications` **every 5
minutes**, and that handler runs a real PostgREST query against `notifications`.
Add Kevin's own daily browser use and the database sees traffic constantly. So
either the notice isn't about this project, or something is stopping that traffic
from counting. Diagnose before changing anything.

#### Diagnosis as of July 25, 2026 — narrowed to "wait one week", do NOT build a keepalive

**Hypotheses 1 and 2 are both ruled out:**
- **(1) Wrong project — RULED OUT.** Kevin has exactly one Supabase project, so
  the notice is necessarily about this one.
- **(2) Pinger 401ing — RULED OUT.** The cron returns
  `{"ok":true,...,"token":{"status":"ok"}}` against both endpoints, so the
  `CRON_SECRET` header is correct and every ping does real database work.

**The finding that matters: the traffic is one day old.** B1's cron pinger shipped
in `5cdb35c` on **July 24, 2026**. Supabase's inactivity window is *"the past
week"*, so **every warning email received so far covers a week that was almost
entirely before the pinger existed.** Before July 24 this project's only automated
traffic was a single daily Vercel cron querying an empty `notifications` table
(downgraded to daily in `fdb5d5e`, April 29) plus Kevin's sporadic browser use.
Against Supabase's stated bar — *"typically a few user requests to the database
each day over the previous week"* — the warnings were most likely **correct all
along**, not a false alarm.

**What the pinger now generates**, for comparison with that bar:

| Endpoint | Runs/day | DB queries per run | Queries/day |
|---|---|---|---|
| `/api/cron/send-notifications` | 288 | `social_posts` select (B5) + `notifications` select | ~576 |
| `/api/cron/publish-posts` | 288 | `app_credentials` select + `social_posts` select | ~576 |

**≈1,150+ database queries per day**, two to three orders of magnitude above the
documented threshold.

**The decisive test is time, not code.** If a warning still arrives after the
pinger has been running a full week — i.e. **after ~August 1, 2026** — then
service-role PostgREST traffic genuinely isn't counted, and only then is there
something to fix.

**Corrected fix ladder** (the original "add a keepalive" branch below is wrong for
this case and is kept only for provenance): if ~1,150 service-role queries/day do
not register as activity, then **a keepalive cannot help either** — it would be
more of exactly the same kind of traffic. The real options at that point are
Supabase **Pro (~$25/mo, removes pausing entirely)** or accepting the risk.

**Risk while waiting is bounded and visible, not silent.** If the project ever did
pause, every DB query throws, the publish cron returns 500, and cron-job.org's
failure alert emails Kevin — that is exactly the watchdog layer B4 was built with.
A pause cannot silently swallow scheduled posts.

**Original hypotheses (kept for provenance):**
1. ~~**The notice is about a different Supabase project.**~~ Ruled out — one project.
   Orgs accumulate half-finished projects, and the warning email names one specific
   project ref. If that ref isn't the app's, the app's usage is irrelevant and there
   is nothing to fix in code. **Check first — it's a 30-second check that could close
   this entirely.**
2. **The 5-minute pinger is 401ing.** `checkCronAuth` rejects before touching the
   database, so a stale/incorrect `Authorization: Bearer <CRON_SECRET>` at
   cron-job.org (e.g. after the secret was rotated) means every ping does *zero*
   DB work. This would be a significant finding on its own — **it would also mean
   email notifications are silently broken**, and B4's publish cron would be dead
   on arrival for the same reason.
3. **Supabase's inactivity signal doesn't count what we generate.** If it keys off
   something other than PostgREST request volume, steady API traffic might not
   register as "activity".
4. **The warning is scheduled/stale on Supabase's side** — a known class of
   annoyance where the notice fires on a cadence or off a lagging metric.

**Diagnostic sequence (needs Kevin or a session with Supabase egress — this repo's
sandbox is on "Trusted" egress and cannot reach Supabase):**
1. Open the warning email and compare its project ref/URL against
   `NEXT_PUBLIC_SUPABASE_URL`. Different → delete or ignore the stale project, done.
2. If it IS the app's project: check the cron-job.org execution history for
   `/api/cron/send-notifications`. Are pings returning **200 with a JSON body**, or
   401/500? A 401 confirms hypothesis 2.
3. Cross-check in Supabase → Project → Logs / API usage that requests are actually
   arriving in the last 24h, and read the project's reported "last activity".

**Fixes, by outcome:**
- *Wrong project* → remove it; no code change.
- *Pinger 401* → re-set the `CRON_SECRET` header at cron-job.org and redeploy.
  This also restores notifications and unblocks the publish cron — fix regardless.
- *Traffic genuinely not counting* → add an explicit keepalive. Cheapest version is
  a tiny read/write inside the existing publish cron (it already runs every 5
  minutes and already holds a service-role client), so this is a few lines, not a
  new endpoint.
- *Structural* → **Supabase Pro (~$25/mo) removes project pausing entirely.** Note
  this is NOT covered by the "no Vercel plan upgrade" decision in § Explicitly
  Ruled Out — that decision was about Vercel cron limits, a different vendor and a
  different problem. Once real posts depend on the database being up, paying to
  remove a whole class of silent failure is worth putting to Kevin as a choice.

**Do not** implement a keepalive before step 1. If the notice is about another
project, a keepalive adds a permanent moving part that fixes nothing.

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
| B7 | Supabase inactivity-notice diagnosis | 2/5 | Sonnet ✅ (diagnosis, needs Kevin) | 1–2h |

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

1. **B0 spike outcome** — ✅ **FULLY RESOLVED (July 24, 2026; re-confirmed in
   production July 25 — see § Stage B0 "B0 results").** Both arms PASS. B0(a): the
   Reels API accepts the ~2K file, audio survives at parity. B0(b): served quality
   reaches full parity with a native upload — Meta generates the 1080p VP9 ladder
   for API posts **asynchronously after publish, no engagement required**
   (verified by re-measuring the API arm `DbLsSCijUL1`, then again on the
   production post `DbON80djKs7`, both serving 1080×1920 VP9 @2.27 Mbps + 720p
   VP9). The earlier "stuck at 720p" reading was an artifact of archiving round
   one's test post immediately. **No fallback transcode, no resumable-upload
   rewrite, no B4 code changes.** The only residual is a documented 720p transient
   after publish — ~15 min in production, up to a few hours in testing — so
   schedule ahead of peak-audience windows.
2. **Exact Edits export spec (container/codec/resolution)** — ✅ **RESOLVED
   (July 25, 2026).** The master is an **MP4** and was ingested by the Graph API
   without complaint across all three test rounds and both production publishes,
   audio intact (HE-AAC, parity with native). It satisfies the API's
   MP4/MOV + H.264/HEVC + AAC requirement as exported, with no pre-processing on
   our side. Nothing further to confirm.
3. Web push (VAPID) timing — deliberately deferred; email-first in B5.
4. Whether Kevin wants `auto` or `notify` as the default for Reels once trust is
   established (schema defaults to `notify` for safety).
5. **Long-lived IG token storage — RESOLVED in B4: the `app_credentials` table**
   (migration 006). A Vercel env var cannot be rewritten by the running app, so
   env-only storage would mean a manual secret rotation every ~60 days or
   auto-publish silently stops. `INSTAGRAM_USER_ACCESS_TOKEN` stays as the
   bootstrap value; the first successful refresh writes the table, which wins after.
6. **Why does Supabase warn weekly about archiving for inactivity?** **Narrowed to
   a waiting test on July 25, 2026 — see § Stage B7 for the full analysis.** Both
   leading hypotheses are ruled out: Kevin has only one Supabase project (so the
   notice is about this one), and the pinger is confirmed authenticating and doing
   real DB work. The likely answer is that **the warnings were simply correct**:
   the 5-minute pinger only shipped July 24, so every warning so far measured a
   week with almost no automated traffic. The project now generates ~1,150 DB
   queries/day against a documented bar of "a few per day". **Decisive test: does a
   warning still arrive after ~August 1, 2026?** If yes, service-role traffic isn't
   counted and a keepalive would be pointless — the choice then is Supabase Pro
   (~$25/mo) or accepting the risk. **Do not build anything before that date.**
7. **Should `/api/cron/publish-posts` return 503 instead of 200 when `ok:false`?**
   ✅ **RESOLVED (July 25, 2026) — no. The app emails instead, and the route keeps
   returning 200.** The gap was real: an unconfigured integration (missing
   `INSTAGRAM_USER_ID` or token) returned HTTP 200 with `ok:false`, which the
   cron-job.org failure alert cannot see, and both exits return *before* any
   per-post or token-maintenance email can fire — so scheduled posts would have
   piled up unpublished in complete silence.

   **Why not 503:** cron-job.org disables a job after repeated failures, so a
   misconfiguration lasting a few hours could switch the pinger off and leave
   publishing broken *after* the config was fixed. It also delegates the alerting
   to third-party settings that can change without anyone noticing.

   **What shipped instead:** `runPublishCycle` sends a rate-limited warning email
   on both unconfigured exits (`src/lib/warn-once.ts`, marker
   `publish_unconfigured_warning_sent_at`). The two alerting layers stay
   complementary — the app reports "running but misconfigured", cron-job.org
   reports "not running at all" — and neither can mask the other. Note that an
   unexpected error (paused Supabase, thrown exception) already returned 500 and
   was always caught by the watchdog; only the two graceful config exits were blind.

## Final Deliverable Reminder (Kevin's explicit request — do not drop)

> ✅ **DONE — `README.md` was written on July 25, 2026**, replacing the
> create-next-app boilerplate. Everything specified below is covered, including
> the publishing-quality content spelled out further down this section. Two errors
> were found and fixed while verifying its claims against the code rather than the
> existing docs: `docs/integrations.md` gave the wrong Google OAuth redirect URI
> (`/api/auth/callback/google` — the app sends `/api/auth/callback/google-calendar`,
> so following the doc produced a broken sync setup), and `src/lib/dropbox.ts`'s
> header comment named the wrong default Dropbox folder. **The spec below is kept
> as the record of what was asked for.**

When both workstreams are complete, **write a highly detailed `README.md`** for
this project, replacing the current create-next-app boilerplate. It should cover:
what the app is and who it's for (single-user Mustache Journey planner), the full
feature list (calendar + Google sync, pipeline, UGC tracker, ideas, inspiration
board, Chrome extension, Claude AI entry, PWA, notifications, and the new
publishing pipeline), architecture overview (Next.js/Supabase/Vercel/Dropbox/
Meta Graph API), the complete env-var reference, local dev + deploy instructions,
the cron/pinger setup, the Meta & Dropbox app setup steps (condensed from
`docs/integrations.md`), how auto-publish vs notify-to-post works, and
troubleshooting notes (token expiry, failed publishes, cron auth).

**Publishing-quality content the README must carry** (established by B0 rounds
2–3 and the July 25 production verification; full detail in § Stage B0 "B0
results"). These are the findings most likely to be lost, so they are spelled out
here verbatim rather than left as a pointer:

*Under "how publishing works":*
- The pipeline hands Meta a URL to the untouched ~2K master in Dropbox
  (`files/get_temporary_link`, 4-hour links) and Meta ingests those exact bytes.
  Nothing re-encodes the file anywhere in the chain — that is the entire point of
  the design, and it is verified, not assumed.
- **The 1080p VP9 renditions are not engagement-gated.** Meta generates them
  automatically after publish, even at zero views. Do not wait for or chase
  engagement to "unlock" quality; there is nothing to unlock.

*Under "troubleshooting":*
- **The quality timeline.** An API-published reel serves a 720p H.264 birth encode
  for a transient window — **~15 minutes observed in production, up to a few hours
  in testing** — then the full 1080p VP9 ladder permanently. Native Edits uploads
  get 1080p at or near birth. This is a latency characteristic, not a quality cap.
  Practical guidance: **schedule auto-publishes ahead of peak-audience windows**
  and the window never matters. A fresh post looking soft is expected, not a bug.
- **Never archive a reel before its encodes settle.** Archiving freezes/pauses
  rendition generation and is **not** quality-neutral — it is what produced a
  false "API posts are permanently capped at 720p" conclusion during testing.
  Relevant to any future archive-related feature.
- **How to spot-check any post's served quality.** Open the reel on instagram.com
  while logged in, extract `video_dash_manifest` from the embedded page scripts,
  and parse the `<Representation>` attributes (width / height / codecs /
  bandwidth). A healthy settled post shows a 1080×1920 VP9 rung. `taken_at` in the
  same page data gives the publish timestamp, so the post's age can be computed for
  comparison. **Screen recordings are not a valid measurement** — ABR and player
  state confound them.

Treat this README as the closing stage of the project — it is part of "done."

## Next Steps

> **Status as of July 24, 2026 — since overtaken; B4 shipped and was verified in
> production on July 25.** Steps 1–4 below are the original plan, kept for
> provenance only. For current state read this file's "📍 CURRENT STATE" block
> at the top. (This pointed at `handoff-b4-start-2026-07-24.md` § "Next steps"
> until that file was deleted on 26 July as superseded; it is in git history.)

1. ~~Read `AGENTS.md`, skim `docs/build-phases.md` and `docs/database-schema.md`,
   and the two key files: `src/components/calendar/CalendarView.tsx` and
   `src/components/calendar/WeeklyBoard.tsx`.~~ (`AGENTS.md` still applies to
   every session — Next.js 16 has breaking changes vs. training data.)
2. ~~Build **Workstream A** (A1 → A2 → A3).~~ **Done** — merged in PR #4.
3. ~~Walk Kevin through the **B0 spike**.~~ **Done** — both arms pass; results
   recorded in § Stage B0 "B0 results". B4 is no longer gated on it.
4. ~~B1 → B2 → B3~~ **done and live** (PRs #6, #7). ~~B4~~ **built and verified in
   production July 25, 2026** (see § Stage B4). ~~B6~~ **done July 25, 2026** (see
   § Stage B6). Remaining: **B5 → B7**, then the README deliverable above.

**Immediate next actions:**
1. **Kevin:** set `META_APP_ID` (`1002021345591349`), `META_APP_SECRET`, a
   long-lived `INSTAGRAM_USER_ACCESS_TOKEN` (scopes `instagram_basic` +
   `instagram_content_publish`), and `INSTAGRAM_USER_ID` (`17841455072367303`) in
   Vercel Production, then **redeploy** — env changes need one to take effect.
2. **Kevin:** apply `supabase/migrations/006_publish_worker.sql`, then run
   `NOTIFY pgrst, 'reload schema';` in the SQL editor.
3. **First live test:** attach a Dropbox file to a throwaway post and hit
   `POST /api/posts/<id>/publish` ("Publish now"). It advances one step per call,
   so expect `container_created`, then `published` on a later call once Meta
   finishes ingesting. Do **not** debut this on a real scheduled post.
4. **Kevin:** add the cron-job.org pinger for `/api/cron/publish-posts` every 5 min
   with the same `CRON_SECRET` Bearer header.
5. Still unverified from B2: that the Dropbox picker lists a real file in prod.
