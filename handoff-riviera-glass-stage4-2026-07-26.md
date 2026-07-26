# Session Handoff — Riviera Glass redesign, Stages 1–3 done, Stage 4 next

**Written: July 26, 2026.** Supersedes `handoff-riviera-glass-2026-07-25.md`
for *current state* (that file is still the best record of the design bundle's
contents and the original assessment — keep reading it for those).

## ⚠️ Read first — which handoff governs what

| File | Governs |
|---|---|
| `HANDOFF.md` (repo root) | The **backend / publishing** workstream (B0–B7, Instagram auto-publish, cron, notifications). Still authoritative for that. Do not touch `src/lib/publisher.ts`, `notifier.ts`, `ig-token.ts`, or the cron routes. |
| `handoff-riviera-glass-2026-07-25.md` | The redesign's origin: design-bundle inventory, the original assessment, the seven-stage plan. Its "Current State" is now stale. |
| **This file** | Current state of the redesign and what to do next. |

---

## Goal

A presentation-only visual redesign ("Riviera Glass") of Kevin's Social
Calendar, landed in individually revertable stages on one branch. Kevin's
original safety requirement, in his words:

> "keep everything related to this redesign on a new branch so that it would be
> easy to return to the current production state if it blows up or I dont like it"

Kevin's three grievances driving it: cramped/visually static UI; light fonts on
light backgrounds (**nothing lighter than `#5d5660` for text**); month view too
cramped, week dates hard to read, Today pane needing scrolling.

## Immediate task for the new session

1. **WAIT for Kevin to supply Claude Design's content-pipeline redesign files.**
   He said: "I'm getting Claude design to create the content pipeline page
   redesign." Do not start pipeline work before those arrive.
   - When they arrive, **first action: copy them into `docs/design/` and commit**
     (e.g. `docs/design/pipeline/`). The original Riviera Glass upload was
     session-scoped and would have been lost; preserving it is why
     `docs/design/riviera-glass/` exists. Do not skip this.
   - `docs/**` is already excluded from `tsconfig.json` and `eslint.config.mjs`.
     Keep those exclusions — reference `.tsx` files import modules that may not
     exist yet and otherwise break `tsc`.
2. **Meanwhile, start Stage 4 (month view).** It does not depend on the
   pipeline files.
3. **Also required (new, from Kevin today): the calendar should default to
   `day` view on phones.** See "Day-view default" below.

---

## Where things stand

### Merged to `main`
- **PR #20 — Stage 1** (design tokens + JetBrains Mono). Merged.
- **PR #21 — Stage 2** (glass sidebar + `PublishHealth.tsx`). Merged.
- `main` is at `fee6250`.

### Open
- **PR #22 — Stage 3 (week view)** — https://github.com/kev124-hub/Social-Calendar/pull/22
  - Branch `claude/redesign-visual-elements-blxj78`, head `2693e7c`, **draft**,
    mergeable clean, Vercel green.
  - Four commits: `8a5555f` (week view), `4be9a52` (drag fixes), `2cb1ea8`
    (h-dvh + selection suppression), `2693e7c` (revert of the selection part).
  - **Kevin has tested it on a real phone and the last outstanding item was a
    confirmation pass that press-and-hold drags again after `2693e7c`.** If he
    hasn't confirmed, ask before merging.
  - An hourly self check-in on this PR was armed via `send_later`. If it fires
    and the PR is merged/closed, stop the loop.

### ⚠️ Branch auto-delete — this has bitten three times
The repo has **Settings → General → Automatically delete head branches**
enabled. After every merge the remote branch disappears and the local
remote-tracking ref goes stale, so the next push fails with
`! [rejected] ... (stale info)`.

**After PR #22 merges, do this before Stage 4 work:**
```bash
git fetch --prune origin
git checkout -B claude/redesign-visual-elements-blxj78 origin/main
```
Each stage therefore opens a **new PR**; never reuse a merged one.

---

## Key decisions & constraints (settled — do not re-litigate)

| Decision | Reasoning |
|---|---|
| **Branch + preview only; no feature flag** | Kevin chose this explicitly when asked how isolated Stage 3 had to be. Production is untouched until merge; one commit per stage means `git revert <sha>` is a one-command rollback. Do not build runtime toggles. |
| **Publish badge stays on the week card** | Stage and publish status are different axes. `derivePublishState` trusts `ig_media_id` over `publish_status` so a post that is live on Instagram is never shown as failed — the one wrong answer that could cause a double-publish. |
| **`/home` nav link stays out** | Route doesn't exist; would 404. The bundle's Sidebar still ships it. |
| **`counts` / `health` props exist but are never passed** | No endpoint reports them. Absent beats fabricated. `PublishHealth.tsx` ships unused; wiring it later is a one-line change. |
| **`PostCard.tsx` deleted** | Kevin approved. `GlassPostCard` (exported from `WeeklyBoard.tsx`) replaced it; `WeeklyBoard` was its only consumer. `PipelineBoard.tsx` has its own unrelated local `PostCard`. |
| **Content pipeline IS in scope** | Kevin decided today. Awaiting Claude Design files. The old bundle has a §6 pipeline spec (columns as depth planes) but the seven-stage plan omitted it. |
| **Phone defaults to `day` view** | Kevin decided today. |
| **Dashboard home (`/home`, Stage 7) out of scope** | Being respecced separately. |
| **No "published" celebration animation** | Design README line 65: explicitly not wanted. |
| **Dark mode is a non-issue** | `.dark` exists in globals.css but nothing sets the class. |

---

## Hard-won lessons — read before touching the week view

### 1. Never re-apply `user-select: none` to the cards
Kevin reported the media strip's `REEL` label highlighting during the
press-and-hold before a drag. Adding `select-none` +
`-webkit-touch-callout: none` removed the highlight **and broke dragging on iOS
entirely** — the board just scrolled and the card stayed put.

**Why:** the text selection was load-bearing. On a long press iOS begins
selecting, which suppresses panning, letting dnd-kit's 200 ms delay elapse and
claim the gesture. With selection disabled nothing holds the touch, the browser
claims it as a pan, and activation never happens.

Reverted in `2693e7c`; a comment in `SortablePostCard` warns against it. A real
fix means `touch-action`, but every value trades against swipe-to-scroll (cards
cover most of a column, so `touch-action: none` would kill the swipe). **Do not
attempt without a way to test real touch input.**

### 2. Inline styles silently kill Tailwind classes
The bundle set `minWidth: 0` inline on the week column, which beat
`min-w-[44vw]` and would have re-broken the mobile scroll-snap layout that
Workstream A shipped to fix. The bundle mixes `style` and `className` on the
same elements everywhere — **check for this collision in every bundle file**,
including the incoming pipeline ones.

### 3. `min-w` is only a floor
`shrink-0` columns still grew to their content: measured 424 / 189 / 197 / 200 /
172 px across one week, so one day filled the whole phone screen. Fixed with a
definite `w-[44vw] sm:w-auto`. Now uniform at 172 px.

### 4. Imperative hover handlers stick on touch
`mouseenter` fires on tap with no matching `mouseleave`, so a tapped card kept
its tilt transform and sat visibly skewed. All hover handlers in `WeeklyBoard`
are gated on `canHover()` = `matchMedia('(hover: hover) and (pointer: fine)')`.
Apply the same guard to any new imperative hover effect.

### 5. `h-screen` (100vh) overshoots on mobile
In mobile WebKit — including **Chrome on iOS**, which Kevin uses — `100vh` is
the *large* viewport height, excluding the URL bar and bottom toolbar. With
`overflow-hidden` the excess is unreachable and the bottom of every column
(including `+ post`) was cut off. Fixed by `h-dvh` in `src/app/(app)/layout.tsx`
and `Sidebar.tsx`. **Confirmed fixed by Kevin.** Use `h-dvh`, never `h-screen`.

### 6. scroll-snap vs dnd-kit auto-scroll
`snap-x snap-mandatory` and dnd-kit's auto-scroll fight: columns visibly
vibrated on a phone and cards landed on random days. Scroll-snap is now
suspended while `activeId` is set and restored on drop. **This was a
pre-existing production bug, not Stage 3 damage** — the old board had the same
combination.

### 7. `closestCorners` drops on the wrong day
It ranks droppables by corner distance, not containment; in tall sparse columns
it picks a neighbour. Reproduced with a mouse: a Monday post went to Thursday.
Replaced with `pointerWithin` + `rectIntersection` fallback.

---

## Verification technique (reusable — this is how everything got tested)

Every real screen sits behind Supabase auth and **this container has no
credentials** (only `.env.local.example` placeholders). The workaround, used for
Stages 2 and 3:

1. Create a temporary route outside the `(app)` group, e.g.
   `src/app/week-preview/page.tsx`, rendering the component with mock props.
2. Add a temporary exemption in `src/proxy.ts`'s `isPublicPath`.
3. Write `.env.local` with stub Supabase values so the proxy can construct its
   client (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9/stub`, any anon key).
4. `npm run dev`, drive with Playwright.
5. **Remove the route, the proxy exemption and `.env.local` before committing.**
   Verify with `git status` and `grep -c 'TEMP harness' src/proxy.ts`.

Gotchas learned the hard way:
- Use `http://localhost:3000`, **not** `127.0.0.1` — Next blocks cross-origin
  dev resources from `127.0.0.1`, hydration silently fails and nothing is
  interactive.
- Hide the dev overlay or it intercepts clicks:
  `page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })`.
- Playwright is **not** a project dependency; import from
  `/opt/node22/lib/node_modules/playwright/index.js` (CommonJS — use
  `import pkg from ...; const { chromium } = pkg`). Chromium at
  `/opt/pw-browsers/chromium`. Never run `playwright install`.
- Scope locators to a column. Filtering cards by text repeatedly matched the
  wrong card because badge text (`Queued`) collides with title text — this
  produced three separate false failures.
- Make mock `onMovePost` actually mutate `scheduled_at` in state; cards render
  from `posts`, not from local order, so a no-op handler makes drags look broken.

**Touch cannot be tested here.** CDP `Input.dispatchTouchEvent` events reach the
page (touchstart/touchmove/touchend/pointerdown all fire) but do not drive
Chromium's compositor scrolling, so neither swipe-to-scroll nor press-and-hold
drag can be exercised. Every touch bug this session was found by Kevin on a real
phone. **Say so honestly rather than claiming verification.**

---

## How Kevin previews on his phone

Preview URL (stable per branch):
`https://claude-social-calendar-git-clau-cfa248-kevins-projects-90f0c300.vercel.app`

**Solved this session:** logging in on the preview used to dump him on
production. Supabase only honours the `redirectTo` / `emailRedirectTo` the app
sends (both built from `window.location.origin`, which is correct) if the URL is
in its **Redirect URLs allowlist**; otherwise it falls back to the project's
Site URL. Kevin added wildcard entries in Supabase → Authentication → URL
Configuration:
```
https://claude-social-calendar-git-*-kevins-projects-90f0c300.vercel.app/**
https://claude-social-calendar-*-kevins-projects-90f0c300.vercel.app/**
```
It works now. **Important caveat to repeat to him:** the preview talks to the
**real production Supabase database**. Dragging a post in the preview genuinely
reschedules it.

Note: this sandbox's egress proxy blocks the Vercel preview URL (403), so the
preview cannot be fetched from here.

---

## Stage 4 — month view (start here)

**Spec:** `docs/design/riviera-glass/README.md` §3. **Code:**
`docs/design/riviera-glass/code/MonthGrid.tsx` — paste-ready, replaces the
`MonthGrid` function currently inside `src/components/calendar/CalendarView.tsx`
(~line 655). The handoff plan suggests extracting it to its own file.

Key spec points:
- `grid-template-columns: repeat(7, minmax(0,1fr))` and `min-width: 0` on cells
  are **required** — with plain `1fr` and nowrap titles the tracks blow past the
  container.
- Cell `min-height: 158px`, radius 15, `blur(10px)`, weekday/weekend tint,
  outside-month `rgba(214,222,231,.30)`, today `rgba(255,255,255,.88)` + dark
  border. Hover `translateY(-5px) scale(1.02)`.
- Header: Playfair 19/600 date; count badge mono 9/700.
- Max 3 rows per cell, 3px left border in the item's colour, `+n more` derived
  from the actual row count — never on an empty day.
- **Removed by design:** the 16px striped thumbnail squares.

### Two open design questions Kevin has never ruled on
1. **Month view stops fitting the viewport.** Today it's `auto-rows-fr` +
   `h-full` (no scroll). The spec's `min-height: 158px` × 6 rows ≈ 950px, which
   scrolls on most laptops. Less cramped per cell, but loses "whole month at a
   glance." Plan says: build to spec, show him, adjust if he dislikes it.
2. **Month-view type is very small** — 10.5px titles, 9.5px times, 9px overflow
   labels, 8.5px chips. Contrast is fine but small at 390px. Suggested raising
   the mobile floor to ~10px.

### Contrast — likely the thing Kevin will notice first
`CalendarView.tsx` contains **zero** glass-token references; month, day and list
views are entirely un-restyled and still use `#bcbcbc`, `text-gray-300/400` and
`text-muted-foreground` over the new violet wash. That is Kevin's grievance #2
reappearing. **Fix contrast first in Stage 4.**

(Earlier this session I guessed Kevin's "gray day numbers on white or violet"
report referred to the month view. It did not — he was on **production**, seeing
the *old week view*. Stage 3 already fixed that. The month view's grey text is a
separate, still-real problem.)

## Day-view default on phones (new requirement)

`src/components/calendar/CalendarView.tsx:168` — `const [view, setView] =
useState<ViewMode>('week')`, where `ViewMode = 'week' | 'month' | 'day' | 'list'`
(line 46).

Requirement: default to `'day'` when the viewport is < 640px **on first load
only** — it must remain a default, not a lock; Kevin must still be able to
switch to week/month and stay there. Beware SSR: reading `window.innerWidth`
during render will hydration-mismatch. Set it in an effect on mount, or read it
lazily in a `useState` initialiser guarded by `typeof window !== 'undefined'`
and accept the one-frame flash. The original plan (Stage A2) listed this as
optional; Kevin has now asked for it.

---

## Environment / setup

- Repo `kev124-hub/Social-Calendar`, working dir `/home/user/Social-Calendar`,
  deployed on Vercel (Hobby).
- **`node_modules` is empty in a fresh container — run `npm ci` first.**
- **`AGENTS.md` / `CLAUDE.md` require reading `node_modules/next/dist/docs/`
  before writing code.** Next.js 16.2.4 has breaking changes vs training data
  (async request APIs, `middleware` → `proxy`, Turbopack). Non-optional.
- Stack: Next 16.2.4, React 19.2.4, Tailwind v4, Supabase, shadcn/Base UI,
  @dnd-kit, date-fns, lucide-react.
- Scripts: `dev`, `build`, `start`, `lint`. **No typecheck script** — use
  `npx tsc --noEmit`. No test suite exists.
- **Lint baseline is now 38 problems (16 errors, 22 warnings)**, not the 42
  quoted in older docs. It moved twice: −5/+1 when `Sidebar.tsx` was rewritten
  (four "Cannot create components during render" errors vanished only because
  the rule can't trace through the `panel()` helper — a **blind spot, not a
  fix**), and net 0 in Stage 3 (PostCard's `<img>` warning left with the file,
  the week card's replaced it).
- After deleting a temp route, `npx tsc --noEmit` may fail on stale
  `.next/dev/types/validator.ts` references. `rm -rf .next` and re-run.

## Files changed by the redesign so far

| File | State |
|---|---|
| `src/app/globals.css` | Stage 1. Glass tokens, `glass-fade-up` / `glass-pulse` / `glass-reel-spin` / **`glass-float`** keyframes, `prefers-reduced-motion` block, `.glass-thumb-placeholder`. `--font-mono-num` under `:where(:root)` so next/font wins. `--shadow-card` deliberately supersedes an unused Gleap token. |
| `src/lib/glass.ts` | Stage 1. Verbatim from the bundle. `STAGE.published.label` is `'Live'` — intentional, don't "fix". |
| `src/app/layout.tsx` | Stage 1. JetBrains Mono as `--font-mono-num` (400/500/700); Inter gained weight 700. |
| `src/app/(app)/layout.tsx` | Stage 1 wash on the app container (not `body`); **`h-dvh`**. PWA `env(safe-area-inset-*)` handling preserved. |
| `src/components/layout/Sidebar.tsx` | Stage 2. Glass restyle; no `/home`; `counts`/`health` optional and unpassed; `RealPlatform = Exclude<Platform,'any'>` (the bundle's version does not compile); collapse toggle suppressed in the mobile drawer; `h-dvh`. |
| `src/components/ui/PublishHealth.tsx` | Stage 2. Four states incl. first-class `unknown`. **Not rendered yet.** |
| `src/components/calendar/WeeklyBoard.tsx` | Stage 3. Full glass rewrite, exports `GlassPostCard`. |
| `src/components/calendar/PostCard.tsx` | **Deleted** in Stage 3. |
| `docs/screenshots/stage2-sidebar/`, `docs/screenshots/stage3-week/` | Verification screenshots committed for PR review. |

## Remaining stages

| # | Stage | Status |
|---|---|---|
| 4 | Month view | **Next.** Fix contrast first. |
| 5 | ReadyReel (v2, sparse-first) | Blocked on the Dropbox thumbnail endpoint. Video thumbnails are proven to exist (pulled a real 640×480 JPEG for `Need a minute.mp4`), but that was via the Dropbox MCP connector, **not** the public `/2/files/get_thumbnail_v2` the app would call. `DropboxFile` has no thumbnail field and `src/lib/dropbox.ts` has no thumbnail fetch. Expect the **n=1** state — `/Social Media/Ready to Post/` holds exactly one file. |
| 6 | Today pane | **Blocked** on Kevin: (a) merge — keep the Calendars toggle list + TimeGrid, restyle in glass; (b) replace — follow README §4 exactly, losing per-calendar visibility toggling and the day time-grid; (c) defer. Recommended (c) then (a). |
| 7 | Dashboard home | Out of scope. |
| — | Content pipeline | **Awaiting Claude Design files.** |

## Notes on working with Kevin

- He decides scope; surface trade-offs with a clear recommendation and he
  answers quickly.
- He values honesty about verified vs assumed. Saying "I could not test touch in
  this container" landed better than a confident claim would have.
- Don't fabricate data to make a design look right — flag it instead.
- He reviews visually on his phone (Chrome on iOS). Push after each meaningful
  stage so he gets a preview.
- **Every touch bug this session came from him, not from testing.** Budget for a
  round-trip and don't burn his rounds on speculative fixes.

## Next steps

1. `npm ci`; read `node_modules/next/dist/docs/` per `AGENTS.md`.
2. Confirm PR #22's state. If merged: `git fetch --prune origin && git checkout
   -B claude/redesign-visual-elements-blxj78 origin/main`. If still open, check
   whether Kevin confirmed drag works after `2693e7c`.
3. Read `docs/design/riviera-glass/README.md` §3 and
   `docs/design/riviera-glass/code/MonthGrid.tsx` in full.
4. Build **Stage 4 (month view)**, fixing the grey-on-wash contrast first, and
   extract `MonthGrid` from `CalendarView.tsx` into its own file. Verify with the
   temp-route harness at 1440×900 and 390×844; remove the harness before
   committing.
5. Add the **phone day-view default** (see above). Can ride in the Stage 4 commit
   or go separately — separate is cleaner to revert.
6. One commit per stage, push, open a **draft PR**, tell Kevin the preview is up.
7. When Claude Design's pipeline files arrive: copy into `docs/design/`, commit
   that first, then assess against the real code before implementing — every
   bundle so far has contained bugs that only appeared when run.
