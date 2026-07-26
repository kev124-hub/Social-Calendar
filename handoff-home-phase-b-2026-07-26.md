# Session Handoff — `/home` Phase B (events block + `src/lib/events.ts`)

**Written 26 July 2026, late evening.** Phases A of the `/home` dashboard is
built and merged. This file exists so a session with no memory of the previous
one can build **Phase B** without re-deriving anything.

## ⚠️ Read first — which document governs what

| File | Governs |
|---|---|
| `docs/design/home/riviera-glass-home-plan.md` | **The Phase B spec.** Start at its "⚠️ Corrections" banner — six items, several of which contradict the body below them. The banner wins. |
| `handoff-riviera-glass-2026-07-26-consolidated.md` | Redesign state, the settled-decisions table, the traps list. Still current. |
| `HANDOFF.md` (repo root) | **Backend / publishing** (B0–B7, Instagram auto-publish, cron). Untouched by this workstream. **Do not touch** `src/lib/publisher.ts`, `notifier.ts`, `ig-token.ts`, or the cron routes. |
| `AGENTS.md` / `CLAUDE.md` | **Next.js 16.2.4 — read `node_modules/next/dist/docs/` before writing code.** Non-negotiable project rule. |
| **This file** | What Phase B is, and everything Phase A learned the hard way. |

---

## Goal

Build **Phase B** of the `/home` dashboard, per Part 2 (Row 4) and Part 4 of
the home plan. Four deliverables, one commit:

1. **Quick actions** in the header — three tiles: *New post* (mounts
   `PostDialog`), *Capture idea* (mounts `IdeaDialog`), *Paste an event*
   (focuses the AI input in the events block; **not** a separate dialog).
2. **The events block** — `AIEventInput` + a small "manual" button opening
   `EventDialog`, plus an **upcoming-events list**, plus an inline
   confirmation line after a successful create (mono 10,
   `Added · <title> · Tue 6:00 PM · <calendar>`, ~5s, no toast library).
3. **`src/lib/events.ts` — the extraction.** Load-bearing. See below.
4. **Re-add the `/home` nav entry** to `src/components/layout/Sidebar.tsx`
   (`NAV_ITEMS`, around line 33). It is deliberately absent today, so Kevin
   currently has to type the URL.

Ruling 3 is why 1–2 ship together: the "new event dialog does nothing" bug was
never the dialog, it was that nothing on screen showed the result. **The input
and the upcoming list ship together or neither ships.**

---

## The extraction — do this properly or Stage 9 breaks

`src/lib/events.ts` **does not exist yet**. It is the single choke point that
Stage 9 (two-way Google Calendar sync) will patch to push app-created events
to Google. Route some but not all writes through it and Stage 9 has several
places to patch and will miss one — events that silently never reach Google,
which is the exact invisible-failure class Ruling 3 exists to close.

**All four app-side write paths must go through it** (verified on `ca2fa85`):

| Path | Location | Operation |
|---|---|---|
| `EventDialog` save | `src/components/calendar/EventDialog.tsx:115` | `update` |
| `EventDialog` save | `src/components/calendar/EventDialog.tsx:116` | `insert` |
| `CalendarView.handleAIEvent` | `src/components/calendar/CalendarView.tsx:399` | `insert` |
| `CalendarView` delete | `src/components/calendar/CalendarView.tsx:326` | `delete` |

The **delete** is the one both earlier documents missed. Without it, Stage 9
pushes creates and updates but not deletions, leaving ghost events in Google.

**Out of scope:** `src/lib/google-calendar.ts:209` — the pull-side `upsert` of
`source: 'google'` rows. That is Google→app. Leave it alone.

### Done-check (run it BEFORE you start, too)

```bash
rg -U -l "from\('calendar_events'\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(" src/
```

- **Before:** exactly three files — `EventDialog.tsx`, `CalendarView.tsx`,
  `google-calendar.ts`. **Confirmed on `ca2fa85`.** If you get something else,
  the pattern is wrong — fix the pattern, not the code.
- **After:** exactly two — `src/lib/events.ts` and `google-calendar.ts`.

Two traps this command avoids, both of which a simpler grep walks into:
a plain `grep "from('calendar_events')"` also matches **reads** (there is a
legitimate `.select()` at `CalendarView.tsx:221` that stays put, and Phase B
adds another to `HomeView`) — so a *correct* Phase B looks like a failure; and
a single-line `grep … | grep -E "\.(insert|update|delete)\("` matches
**nothing** when `.from(...)` and the write are on separate lines (which
`google-calendar.ts` already is, and a formatter will do to `events.ts`), so
it passes while verifying nothing.

### Shape

```ts
export async function createEventFromParsed(
  supabase: SupabaseClient, parsed: ParsedEvent, calendars: Calendar[]
): Promise<void>
```

plus siblings `createEvent`, `updateEvent`, `deleteEvent`. `CalendarView` and
`HomeView` both call `createEventFromParsed`.

**Preserve the existing error handling when moving it.** Both call sites
deliberately surface write errors — they used to discard the result, so an RLS
refusal looked exactly like success. Read the comments at
`EventDialog.tsx:111-113` and `CalendarView.tsx:407-409` before touching them.
The helpers must return or throw errors, never swallow them.

`handleAIEvent`'s body to move (`CalendarView.tsx:399`):

```ts
const defaultCalendar = calendars.find((c) => c.source === 'app') ?? calendars[0]
const toISO = (s: string, isEnd?: boolean) => {
  if (parsed.all_day) return new Date(s + (isEnd ? 'T23:59:59' : 'T00:00:00')).toISOString()
  return new Date(s).toISOString()
}
const { error } = await supabase.from('calendar_events').insert({
  title, description, location,
  starts_at: toISO(parsed.starts_at),
  ends_at: parsed.ends_at ? toISO(parsed.ends_at, true) : null,
  all_day: parsed.all_day,
  calendar_id: defaultCalendar?.id ?? null,
  source: 'app' as const,
})
if (error) throw new Error(`Could not save the event: ${error.message}`)
```

**Leave `external_id` null** on app-created events — Stage 9 backfills it from
Google's insert response. Do not invent values.

---

## Component props — verified, and the plan is incomplete here

The plan describes these dialogs as "self-contained, already does its own
insert" and lists only some props. **All four require `onDelete` and an entity
prop; none are optional.** Verified signatures:

```ts
AIEventInput({ onEventParsed })                         // (e: ParsedEvent) => void | Promise<void>
EventDialog({ open, onClose, onSave, onDelete, event, defaultDate, calendars })
PostDialog ({ open, onClose, onSave, onDelete, post, defaultStage, defaultScheduledAt? })
IdeaDialog ({ open, onClose, onSave, onDelete, idea })
```

```ts
interface ParsedEvent {
  title: string; starts_at: string; ends_at: string | null
  all_day: boolean; location: string | null; description: string | null
}
```

`AIEventInput` **awaits** `onEventParsed` and displays whatever it throws — so
throwing a useful message from `events.ts` is the whole error UX.

---

## Current state

**`main` is at `ca2fa85`.** No open PRs. Working branch:
`claude/repo-setup-t2sc5w` — its PRs are merged, so **start fresh**:

```bash
git fetch origin main && git checkout -B claude/repo-setup-t2sc5w origin/main
```

Merged this session: **#30** (plan errata), **#31** (Phase A + phone fixes),
**#32** (Phase A errata).

### Files Phase A added — all on `main`

- `src/app/(app)/home/page.tsx` — one-liner rendering `<HomeView />`.
- `src/components/home/HomeView.tsx` — the only data fetcher. One
  `social_posts` query, 12s `AbortController`, `failed` → stated error panel
  with a retry (`attempt` state re-runs the effect). Clock lives in `now`
  state (mount effect + 60s interval), and **everything clock-derived waits on
  it** — reading the clock during render breaks hydration.
- `src/components/home/NextPublishHero.tsx` — wrapped in a `Link` to
  `/pipeline?post=<id>`.
- `src/components/home/StatTiles.tsx` — rAF counter ramp with a **JS**
  reduced-motion guard; each tile is a `Link`.
- `src/components/home/WeekStrip.tsx` — chips link to
  `/calendar?date=YYYY-MM-DD&view=day`.
- `src/components/home/NeedsAttention.tsx` — failed + overdue rows, cap 5,
  `+n more`; deep-links to `/pipeline?post=<id>`.
- `src/components/home/glass-home.ts` — shared `MONO` and `PANEL`.
- `src/components/calendar/CalendarView.tsx` — **modified**: now reads
  `?date=` and `?view=` from the URL.
- `docs/screenshots/home-phase-a/` — desktop 1440 + phone 390.

### Layout note for Phase B

Row 3 currently renders `NeedsAttention` **full-width**. The plan's Part 2 says
the events block lives in Row 3's **right column** during Phases A–B (moving to
a full-width Row 4 in Phase C when ReadyReel takes that slot). So Phase B turns
Row 3 into the `minmax(0,1.35fr) minmax(0,1fr)` grid. Phase A shipped it
full-width deliberately — an empty column would have looked broken.

---

## Traps — every one of these cost real time

1. **An inline style beats a Tailwind class, including `hover:`.** Cost time
   seven times now. Phase A added two more: an inline `color` alongside
   `hover:text-[…]` silently killed the hover on two links. **If a value has
   any variant — breakpoint or state — it must be a class.**
2. **Tailwind v4 compiles translate utilities to the CSS `translate`
   property, not `transform`.** A hover audit probing `transform` reports
   every lift as dead. This wasted a full debugging round in Phase A.
3. **Screenshots cannot verify hover or touch.** Drive hover with Playwright's
   `.hover()` and compare computed styles. Say plainly when something is
   untested.
4. **`prefers-reduced-motion` in `globals.css` cannot reach a `requestAnimationFrame`
   loop.** It zeroes CSS `animation-duration`/`transition-duration` only. Any
   JS animation needs its own `window.matchMedia(...)` guard. The plan says
   otherwise and the plan is wrong (banner item 5).
5. **A bare `grid` sizes its auto column to min-content** — and `truncate`
   (`white-space: nowrap`) has a min-content of the *entire* untruncated
   string. That made a column 490px wide inside a 342px phone. Give
   single-column grids an explicit `[grid-template-columns:minmax(0,1fr)]`.
   `min-w-0` does **not** help; it governs shrinking after the column is
   sized, not the intrinsic measurement that sizes it.
6. **`h-dvh`, never `h-screen`.** In mobile WebKit `100vh` is the *large*
   viewport; with `overflow-hidden` the bottom of every column is unreachable.
7. **`select-none` breaks dragging on iOS outright.** Do not add it.
8. **A responsive breakpoint is not verified until the boundary is** — test
   the widths either side of the switch.
9. **Check `%G?` claims about signatures against the commit object.** With
   `gpg.format=ssh` and no `allowedSignersFile`, `%G?` returns `N` for
   correctly-signed commits. Commits here **are** signed.

---

## Verification technique (how everything gets tested)

Every real screen sits behind Supabase auth and **this container has no
credentials.**

1. Temp route outside the `(app)` group, e.g.
   `src/app/home-preview/page.tsx`, rendering components with mock props.
   (Sub-components take props; `HomeView` fetches its own data, so use the
   sub-components for visual work.)
2. Temp exemption in `src/proxy.ts`'s `isPublicPath`.
3. `.env.local` with stub values
   (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9/stub`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY=stub-anon-key`).
4. `npm run dev`, drive with Playwright.
5. **Remove all three before committing.** Verify: `git status` clean,
   `grep -c 'TEMP harness' src/proxy.ts` → 0, `git diff src/proxy.ts` empty.

Gotchas:
- Use `http://localhost:3000`, **not** `127.0.0.1` — Next blocks cross-origin
  dev resources and hydration fails silently.
- Playwright is not a project dependency — import from
  `/opt/node22/lib/node_modules/playwright/index.js` (CommonJS). Chromium at
  `/opt/pw-browsers/chromium`. **Never run `playwright install`.**
- Hide the dev overlay:
  `page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })`.
- Do **not** `pkill -f "next dev"` — it matches the calling shell and kills
  your own command. Start the server as a background task instead.
- A stub Supabase host **hangs** rather than failing; that is how Phase A's
  infinite-loading bug was found.

**Touch cannot be tested here.** CDP touch events reach the page but do not
drive Chromium's compositor. Every touch bug this project has seen was found
by Kevin on a real phone. Phase A shipped two tap bugs past a clean desktop
pass — say plainly what is unverified.

---

## Environment

- Next.js **16.2.4**, React 19.2.4, Tailwind **v4** (4.2.4), TypeScript.
- **No `cacheComponents`** in `next.config.ts` → the bundled docs'
  `unstable_instant` guidance does **not** apply. Every page is a
  `'use client'` component fetching client-side via `@/lib/supabase/client`.
- `(app)/layout.tsx` sets `export const dynamic = 'force-dynamic'` and owns
  the glass wash + `h-dvh` shell. **Do not put a background on the page root.**
- **Lint baseline: 37 problems (17 errors, 20 warnings).** Re-run
  `npm run lint` yourself — three documents have carried a wrong number.
  New files should add nothing.
- `npx tsc --noEmit` must be clean. `npm run build` compiles in ~8s.
- **No edits to `globals.css` or `src/lib/glass.ts`** — every token, keyframe
  (`glass-pulse`, `glass-fade-up`, `glass-float`) and helper already exists.
- Preview (per branch, stable):
  `https://claude-social-calendar-git-clau-2bbe7c-kevins-projects-90f0c300.vercel.app`
  — append `/home`. **The preview talks to the real production Supabase
  database**; Phase A is read-only but Phase B writes events, so a test event
  created there is a real row. The sandbox proxy blocks this URL (403), so it
  cannot be fetched from here.
- The stop hook (`~/.claude/stop-hook-git-check.sh`) was fixed this session:
  it now scopes to `HEAD --not --remotes` and reads the `gpgsig` header
  instead of `%G?`. It no longer false-positives after a merge-then-reset.

---

## Settled — do not re-litigate

- **12-hour times (`h:mm a`) everywhere.**
- **Week view is a content board, permanently** — posts and ideas only, never
  calendar events. week = production cockpit, month = everything, home =
  where events are created and seen.
- **Token-expiry display is cut.** Publish health is problems-only.
  `PublishHealth.tsx` stays in the tree unused — do not delete, do not wire.
- **Pipeline load / stage counts cut** ("not useful" — Kevin).
- **`/` keeps redirecting to `/calendar`.** `/home` is a nav entry, not the
  landing page.
- **Branch + preview only, no feature flag.** One commit per phase;
  `git revert <sha>` is the rollback.
- **Platform `'any'` renders neutral grey `ANY`**, never Instagram purple.
- **No "published" celebration animation. Dark mode is a non-issue.**

---

## Open questions — Kevin has not ruled

1. **The 24h window on failures.** Ruling 1 says failed posts "in the last
   24h"; `NeedsAttention` lists them regardless of age, on the reasoning that
   a failure from three days ago still needs fixing and a window would hide it
   from the only surface reporting problems. Flagged twice; not overruled.
2. **`/home` bounds its load (12s abort); every other page spins forever.**
   Deliberate asymmetry, flagged as worth a second opinion. May want applying
   to `CalendarView` / `PipelineBoard` too.
3. **Stage 5 (ReadyReel) is still blocked** on verifying Dropbox
   `/2/files/get_thumbnail_v2` with real credentials. Phase C is hard-gated on
   it — do not take that dependency in Phase B.

---

## Working with Kevin

- He decides scope. Surface trade-offs **with a recommendation**; he answers
  fast. **Don't over-ask** — he will tell you to just decide.
- He values honesty about verified vs assumed. "I could not test touch in this
  container" lands better than a confident claim.
- **Don't fabricate data to make a design look right** — flag it instead.
- He reviews visually on his phone (Chrome on iOS) and reports precisely.
  Push after each meaningful chunk so he gets a preview.
- He merges via GitHub; PRs are opened as drafts and he says when to merge.
- Don't push new work onto a PR he has marked ready for review.

---

## Next steps

1. `git fetch origin main && git checkout -B claude/repo-setup-t2sc5w origin/main`
2. Read the **Corrections banner** at the top of
   `docs/design/home/riviera-glass-home-plan.md` (six items), then Part 2
   Row 4 and Part 4.
3. Read the relevant guide under `node_modules/next/dist/docs/` — project rule.
4. `npm ci`, then `npm run lint` to confirm the 37 baseline for yourself.
5. Run the done-check **before** touching anything; confirm it lists exactly
   three files.
6. Build `src/lib/events.ts` first and re-point all four write paths, before
   any UI. Re-run the done-check → exactly two files.
7. Then the events block, quick actions, and the `/home` nav entry.
8. Verify with the harness at 1440 and 390; drive every hover with
   `.hover()`; **remove the harness**; screenshots into
   `docs/screenshots/home-phase-b/`.
9. Regression check the plan asks for explicitly: **`CalendarView`'s AI input
   still works after the extraction** — create one event from the calendar top
   bar.
10. Commit, push, open a **draft** PR, and tell Kevin what is unverified.
