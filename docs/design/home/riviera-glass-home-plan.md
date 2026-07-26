# Plan: `/home` dashboard — revised spec, rulings, and build phases

> Hand-off plan for the implementing session (Riviera Glass workstream).
> Written 2026-07-26. Supersedes design README §7 where they conflict — every
> deviation below is a ruling Kevin has made, not a suggestion. Verified
> against the real codebase on `main` (post Stage 1–2): all referenced fields,
> components, and endpoints exist as described.

## ⚠️ Corrections to this file — read before building

`handoff-riviera-glass-2026-07-26-consolidated.md` governs current state and is
the file to read alongside this one. Four things below were written before
later rulings landed. They are **corrected in place** as of 26 July, but the
two marked **load-bearing** are the ones that will cost you real work:

1. **Lint baseline is 37 problems (17 errors, 20 warnings) — not 42.**
   **Load-bearing.** Re-verified by running `npm run lint` on `main` at
   `13b027e`. Three separate documents have now carried a wrong number (38,
   42). If you "fix" lint toward 42 you will be chasing a target that does not
   exist and may well change working code to reach it. Lint the files you
   touch, compare against 37, and **re-run the baseline yourself rather than
   inheriting it from any document — including this one.**

2. **The `src/lib/events.ts` extraction in Phase B is load-bearing, not
   tidying.** It reads like a refactor in the Phase B table; it is not. It is
   the single hook point Stage 9 (two-way Google sync) patches. Both existing
   write paths must go through it — see the verified inventory in Part 2's
   extraction section. Route only one and Stage 9 has two places to patch and
   will miss one. Do not defer it, do not "do it later in Stage 9", do not
   copy-paste the body into `HomeView`.

3. **Stage 8 (pipeline board) is merged** (PR #28), not "under review" as
   Part 3's stage-numbering note says.

4. **Time format is settled: 12-hour `h:mm a`.** Ruling-3 §"Also settled"
   below says "match whatever Kevin ruled" — he ruled, on 26 July, and every
   calendar surface already complies. Do not ship `HH:mm`.

---

## Part 1 — Rulings (settled with Kevin, do not re-litigate)

### Ruling 1: Token expiry display is CUT

The sidebar/health "IG token 41d" number does not ship, in any stage. Reasons,
all verified in code:

- `app_credentials` is **service-role only** — RLS denies the browser (see the
  table's own comment in `src/types/database.ts`). Displaying the number means
  building a new API route for a feature Kevin already rated "nice to have,
  not essential."
- `expires_at` is nullable and only populated when `META_APP_ID`/`META_APP_SECRET`
  are set **and** the refresh cron has completed a `debug_token` round trip
  (`src/lib/ig-token.ts`). In every other case the display would permanently
  read "expiry unknown."
- The `PublishHealth` `live` state ("Worker live", pulsing dot) asserts the
  cron is running, but **no heartbeat exists** to verify that. By the design's
  own honesty rule, `live` cannot render truthfully today.

**What replaces it:** publish health becomes *problems-only*, derived from
data the client already fetches:

- A post with `derivePublishState(post) === 'failed'` in the last 24h → red
  "A post failed" linking to it.
- Otherwise → render **nothing**. No dot, no "live", no token line.

This lives in the home page's **Needs attention** block (Part 2, Row 3) — the
sidebar health block stays unwired, exactly as Stage 2 shipped it.
`code/PublishHealth.tsx` stays in the tree unused; do not delete, do not wire.
Token health remains the refresh cron's concern.

### Ruling 2: Week view is a content board — formalized

`WeeklyBoard` builds its columns exclusively from posts and ideas; calendar
events have never rendered there and now **never will**. This is the official
model:

- **Week** = content production cockpit (posts + ideas only)
- **Month** = everything (events + posts + ideas)
- **Home** = where events are created and seen day-to-day (this plan)

Context for whoever reads this later: the "new event dialog does nothing" bug
report was actually this — `EventDialog` and the AI event input save
correctly, but week view cannot display the result, so from week view the
event silently vanishes into month view. The fix is visibility (Ruling 3),
not the dialog.

### Ruling 3: Event creation moves to home, WITH a visible outcome

Home gets first-class event creation (AI paste + manual dialog) **and an
upcoming-events block** so a created event appears instantly in a list right
below the input. Without that block, the invisibility bug just moves to a new
page. Both ship together or neither.

### Also settled earlier (carried forward)

- Pipeline load / stage counts: **cut** ("not useful" — Kevin). This also
  deletes the CONGESTED / overdue-per-stage / oldest-days threshold machinery.
- ReadyReel on home: **deferred to Phase C**, gated on the Stage 5 Dropbox
  thumbnail resolution. Home must not take that dependency.
- Routing: `/` keeps redirecting to `/calendar`. `/home` is a nav entry only
  (re-added to the sidebar in Phase B). Home is not the landing page.
- Platform `'any'` renders neutral grey `ANY`, never Instagram purple.
- Time format: **settled — 12-hour `h:mm a`, everywhere.** Kevin ruled on
  26 July; week and month were corrected in PR #26 and every calendar surface
  now complies. Consistency beats the mock: do not ship the mock's `HH:mm`.

---

## Part 2 — The page, block by block

New route `src/app/(app)/home/page.tsx` — a one-liner rendering
`src/components/home/HomeView.tsx` (`'use client'`), exactly the pattern every
other page uses. All fetching is client-side Supabase; **no new API routes**.

### Data (three queries, one component)

```ts
// 1. Posts — feeds hero, stat tiles, week strip, needs-attention
supabase.from('social_posts').select('*')
  .order('scheduled_at', { ascending: true, nullsFirst: false })

// 2. Calendars — feeds EventDialog, createEventFromParsed, visibility filter
supabase.from('calendars').select('*').order('name')

// 3. Upcoming events — feeds the upcoming block
supabase.from('calendar_events').select('*, calendar:calendars(*)')
  .gte('starts_at', startOfToday.toISOString())
  .order('starts_at', { ascending: true })
  .limit(12)   // filter to visible calendars client-side, show first 5
```

### Header

- Mono 11 date (`var(--font-mono-num)`, `.14em` tracking, `INK.tertiary`),
  Playfair 28 greeting (`font-heading`, `INK.primary`).
- Three quick-action tiles (label 13/600 `INK.primary` + mono 9.5 hint
  `INK.tertiary`, glass chip surface `rgba(255,255,255,.62)` + hairline border,
  radius 13, `hover:-translate-y-[3px]` — CSS hover only, never JS):
  1. **New post** → mounts `PostDialog` (`open/onClose/onSave/defaultStage:'idea'`
     — self-contained, already does its own insert).
  2. **Capture idea** → mounts `IdeaDialog` (same shape).
  3. **Paste an event** → focuses the AI event input in the events block
     (Row 4). Not a separate dialog — it scrolls/focuses the input.

### Row 1 — grid `minmax(0,1.55fr) minmax(0,1fr)`, 14px gap

**Next-publish hero** (left): earliest `social_posts` with `stage='scheduled'`
and future `scheduled_at`.

- 132px media strip (`media_url` img else `.glass-thumb-placeholder` with post
  type in mono 9), panel surface `var(--glass-panel)` + `blur(14px)`, radius 20,
  hairline border, `var(--shadow-panel)`.
- Eyebrow, mono 10 `#0b3a50`: **label depends on `publish_mode`** —
  `NEXT PUBLISH · in 3h 41m` with pulsing dot when `publish_mode === 'auto'`
  (the worker will act); `NEXT POST · in 3h 41m` with a **static** dot
  otherwise (Kevin posts it manually — a pulse would overclaim). Countdown
  recomputes on a 60s interval, not per-second.
- Playfair 30 title, caption 13.5 clamp-2, pills for time / platform /
  publish mode (`#141014` fill + `#f7f3ef` text for auto).
- Dropbox path, mono 9.5 truncated — **omit entirely when
  `media_dropbox_path` is null** (most notify-mode posts).
- **Empty state (required, spec omitted it):** panel stays, striped placeholder,
  "Nothing scheduled yet" 13/600 + an "Open calendar" pill — same stated-empty
  treatment as ReadyReel's.

**Stat tiles** (right): `repeat(3, minmax(0,1fr))`, 40px mono numerals,
12/600 labels, `STAT` tints from `glass.ts`, `hover:-translate-y-1`.
Definitions (unchanged from §7's table):

| Tile | Rule |
|---|---|
| ready | posts in the current week with `stage in ('scheduled','published')` |
| behind | `scheduled_at < now()` and `stage !== 'published'` |
| queued | `publish_status in ('pending','processing')`; renders `—` if the read fails |

Counter ramp 0→target over 1100ms with cubic ease-out (rAF), inside the
`prefers-reduced-motion` guard (the global block already covers it).

### Row 2 — week strip

Seven chips from the posts query: `dayTint(dow)` surfaces, Playfair 24 date,
mono weekday, count badge, 5px ready bar (`ready/total` per day, same rule as
the week columns), `hover:-translate-y-[5px]` (skip the mock's `rotateX` — not
worth a 3D context here). "OPEN CALENDAR →" mono link top-right → `/calendar`.
Clicking a chip → `/calendar` (week view already opens on the current week).

### Row 3 — grid `minmax(0,1.35fr) minmax(0,1fr)`, 14px gap

**Needs attention** (left) — replaces the cut pipeline-load block, and per
Ruling 1 is the only publish-health surface in the app:

- **Failed** rows: posts where `derivePublishState(post) === 'failed'` —
  red-brown `#8a2b12` accent, title + `publish_error` clamp-1, mono time;
  row links to `/pipeline?post=<id>` (deep link already works).
- **Overdue** rows: `scheduled_at < now()` and `stage !== 'published'` —
  amber `#8a4b06` accent, same row shape, same deep link.
- Cap the list at 5 rows + `+n more` (mono 9.5) linking to `/pipeline`.
- Both empty → single line "All clear — nothing needs attention." 12.5/500
  `INK.tertiary`. **Do not hide the panel** (its absence would be ambiguous).

**Right column:** in Phases A–B, `Upcoming events` lives here (see Row 4).
In Phase C, ReadyReel takes this slot and Upcoming events moves to full-width
Row 4 below. Build the blocks as standalone components so the swap is a
layout-only change.

### Row 4 (Phase B) — Events: create + see

One glass panel, two parts:

1. **AI event input**: mount the existing `AIEventInput`
   (`onEventParsed={handleParsed}`). Next to it, a small "manual" button
   opening `EventDialog` (needs the `calendars` query; `defaultDate: new Date()`).
2. **Upcoming events list**: next 5 events across **visible** calendars
   (`is_visible`), Today-pane agenda row treatment — time mono 11 in a 42px
   column, 4px calendar-color bar, title 12/500 truncated,
   `hover:translate-x-1`. Group header "TODAY" / "THIS WEEK" optional; a flat
   list is fine.
3. After a successful create: refetch the events query and show an inline
   confirmation line under the input (mono 10: `Added · <title> · Tue 18:00 ·
   <calendar name>`) for ~5s. No toast library — inline state only.

#### The extraction — load-bearing, not tidying

This is the single most consequential item in Phase B, and it does not look
like it. It is not cleanup and it is not stylistic: `src/lib/events.ts` is the
one file Stage 9 (two-way Google sync) patches to push app-created events to
Google. **Every app-side write to `calendar_events` must go through it.** Route
some but not all and Stage 9 has two places to patch and will miss one — the
missed path then writes events that silently never reach Google, which is
precisely the class of invisible-failure bug Ruling 3 exists to close.

**Verified inventory of app-side write paths**, run on `main` at `13b027e`;
`src/lib/events.ts` does not exist yet. This is the **writes only** — a plain
`grep -rn "from('calendar_events')" src/` also returns a `.select()` read at
`CalendarView.tsx:221` and the pull-side `upsert` at `google-calendar.ts:209`,
neither of which is in scope. See the done-check below for the exact command:

| Path | Location | Operation |
|---|---|---|
| `EventDialog` save | `src/components/calendar/EventDialog.tsx:115` | `update` |
| `EventDialog` save | `src/components/calendar/EventDialog.tsx:116` | `insert` |
| `CalendarView.handleAIEvent` | `src/components/calendar/CalendarView.tsx:380` | `insert` |
| `CalendarView` delete | `src/components/calendar/CalendarView.tsx:326` | `delete` |

The fourth row is **not** in the consolidated handoff, which enumerates only
the two create/update paths. It matters for the same reason they do: a
deletion that never reaches Google leaves a ghost event in Kevin's calendar
after Stage 9 lands. Route it through the choke point now — the helper is
three lines — even though Phase B itself has no delete UI.

The only write deliberately **out of scope** is
`src/lib/google-calendar.ts:209`, the pull-side `upsert` of `source: 'google'`
rows. That is Google→app, not app→Google. Leave it alone.

Move `CalendarView.handleAIEvent`'s body (~20 lines: default-calendar
resolution, all-day ISO conversion, insert with `source: 'app'`) into
`src/lib/events.ts` as:

```ts
export async function createEventFromParsed(
  supabase: SupabaseClient, parsed: ParsedEvent, calendars: Calendar[]
): Promise<void>
```

`CalendarView` and `HomeView` both call it. In the same file add the siblings
covering the remaining rows — `createEvent(supabase, fields)`,
`updateEvent(supabase, id, fields)`, `deleteEvent(supabase, id)` — and route
`EventDialog`'s internal insert/update and `CalendarView`'s delete through
them. `EventDialog` keeping its private insert is the specific failure mode to
avoid.

**Done-check for this item.** Two properties matter and a naive grep gets both
wrong, so use this command:

```bash
rg -U -l "from\('calendar_events'\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(" src/
```

- **Run it BEFORE you start.** On `main` at `13b027e` it must list exactly
  three files: `EventDialog.tsx`, `CalendarView.tsx`, `google-calendar.ts`. If
  it lists something else, the pattern is wrong — fix the pattern, not the
  code. A check you have not seen succeed is not a check.
- **Run it after the extraction.** It must list exactly two:
  `src/lib/events.ts` and `src/lib/google-calendar.ts`. Any component still
  listed means a write path was missed.

Two traps this command exists to avoid, both of which a simpler grep walks
into:

1. **It must not match reads.** `grep -rn "from('calendar_events')" src/`
   matches `.select()` too, and there is a legitimate read at
   `CalendarView.tsx:221` that stays in the component after the extraction —
   plus the one Phase B adds to `HomeView`. Against a plain grep a *correct*
   Phase B looks like a failure, which sends you either to churn or to route
   reads through `events.ts` to quiet it. Don't: `events.ts` is a write choke
   point because Stage 9 patches writes. Reads in components are expected and
   fine.
2. **It must match multi-line chains.** `.from('calendar_events')` and its
   `.insert(...)` are frequently on separate lines — `google-calendar.ts:209`
   already is, and a formatter will do the same to the helpers in `events.ts`.
   A single-line `grep … | grep -E "\.(insert|update|delete)\("` silently
   matches **nothing** in that case, so the check passes while verifying
   nothing at all. Hence `rg -U`. This is also why the before-run above is not
   optional: it is what distinguishes "clean" from "broken pattern".

Preserve the existing error handling while moving it. `EventDialog`'s write
deliberately captures `error` and surfaces it (see its comment: both writes
used to discard the result, so an RLS refusal looked exactly like success).
The helpers must return or throw errors, never swallow them.

---

## Part 3 — Stage 9 (two-way Google sync): what this plan sets up

> Stage numbering note: Stage 8 = the pipeline board restyle, **merged as PR
> #28** (separate plan doc: `docs/design/pipeline/`). Stage 9 = two-way Google
> sync, referenced below.

Current state, verified in `src/lib/google-calendar.ts`: sync is **one-way
pull** — Google events are upserted into `calendar_events` with
`source: 'google'` keyed on `external_id`. App-created events
(`source: 'app'`, `external_id` null) **never reach Google** today.

Consequences for this plan — none of Stage 9 is built here, but don't paint
over its hooks:

1. **`src/lib/events.ts` is the Stage 9 hook point.** If Part 2's extraction
   is done properly (AI path *and* `EventDialog` path both writing through it),
   Stage 9 adds push-to-Google in exactly one file. If `EventDialog` keeps its
   private insert, Stage 9 has two places to patch and will miss one. This is
   why the extraction is required, not stylistic.
2. **The upcoming-events block is source-agnostic** (it queries
   `calendar_events` regardless of `source`), so it already shows pulled
   Google events today and needs zero changes when Stage 9 lands.
3. **Set expectations in UI copy:** until Stage 9, an event created on home
   lands in an app calendar and will NOT appear in Google Calendar. If the
   default calendar is `source: 'app'` this is implicit; do not add a
   "synced to Google" affordance of any kind before Stage 9 exists.
4. Leave `external_id` null on app-created events — Stage 9 will backfill it
   from Google's insert response. Don't invent values for it.

---

## Part 4 — Build phases

| Phase | Contents | Dependencies |
|---|---|---|
| **A** | Route + `HomeView`: header + greeting, next-publish hero (with empty state + auto/notify label rule), stat tiles, week strip, needs-attention (incl. problems-only health per Ruling 1) | None. One posts query. |
| **B** | Quick actions (`PostDialog`, `IdeaDialog`), events block (`AIEventInput`, `EventDialog`, upcoming-events list, inline confirmation). **Plus the `src/lib/events.ts` extraction — load-bearing, not tidying: all four app-side write paths route through it or Stage 9 misses one. See Part 2's extraction section for the verified inventory and the grep done-check.** **Re-add the `/home` sidebar nav entry in this commit.** | Calendars + events queries. |
| **C** | ReadyReel into Row 3 right; upcoming events moves to Row 4 full-width | Stage 5's thumbnail resolution — hard gate. |

One commit per phase, same convention as Stages 1–7.

## Part 5 — Implementation guardrails (same as the pipeline plan)

- All hover via Tailwind classes (v4 gates `hover:` behind `(hover:hover)` —
  fixes iOS sticky-hover for free). Never `onMouseEnter` style mutation.
- Backdrop blur on the **panels only** (hero, needs-attention, events panel) —
  never on rows, tiles, or chips.
- Mono face via `style={{ fontFamily: 'var(--font-mono-num)' }}`.
- No background on the page root — the app-layout wash already shows through.
- No edits to `globals.css` / `glass.ts` — every token and keyframe needed
  already exists on `main`.
- Do not touch `src/lib/publisher.ts`, `notifier.ts`, `ig-token.ts`, or cron
  routes.
- `npx tsc --noEmit` clean; lint only the new/changed files. **The baseline
  elsewhere is 37 problems (17 errors, 20 warnings)** — verified by running
  `npm run lint` on `main` at `13b027e`, not inherited. This file previously
  said 42; that number was wrong and so were the 38 and 42 in two other docs.
  Re-run it yourself before judging whether you regressed anything.

## Part 6 — Verification checklist

- Desktop ≥1024 and 390×844 (PWA safe-areas intact — the page scrolls under
  the existing `<main>` padding, no special handling needed).
- Hero: with a future scheduled auto post (pulse + NEXT PUBLISH), with only a
  notify post (static dot + NEXT POST), with nothing scheduled (empty state),
  with and without `media_dropbox_path`.
- Stat tiles: `queued` shows `—` when the query errors (test by breaking the
  column name temporarily, then restore).
- Needs attention: failed post renders red with error text and deep-links to
  the pipeline dialog; overdue renders amber; both empty shows "All clear".
- Events: AI-paste an event → appears in the upcoming list within one refetch,
  confirmation line renders; manual dialog path also lands in the list;
  `CalendarView`'s AI input still works after the extraction (regression
  check: create one event from the calendar top bar).
- Nav: `/home` entry active-state highlights; `/` still redirects to
  `/calendar`.
- After Phase B: tap-navigate on a phone — no element stuck in hover state.

## Part 7 — Suggested commit messages

```
Stage N (Phase A): /home dashboard — hero, stats, week strip, needs-attention

Client-side HomeView on the CalendarView pattern; one posts query. Publish
health is problems-only per ruling (token display cut). Hero labels adapt
to publish_mode; stated empty states throughout. No new endpoints.
```

```
Stage N (Phase B): /home events — create + upcoming list, shared write path

Extracts event creation into src/lib/events.ts (AI + dialog paths), mounts
AIEventInput/EventDialog/PostDialog/IdeaDialog on home, adds the upcoming-
events block so created events are immediately visible. Re-adds the /home
nav entry. Single write path is the Stage 9 (two-way Google sync) hook.
```
