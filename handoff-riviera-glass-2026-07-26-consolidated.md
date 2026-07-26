# Session Handoff — Riviera Glass redesign, Stages 1–4 merged

**Written 26 July 2026, evening. Consolidates two sessions.** Supersedes
`handoff-riviera-glass-stage4-2026-07-26.md` entirely — that file says "Stage 4
next", which is no longer true and is exactly the stale picture that let two
sessions build Stage 4 twice.

## ⚠️ Read first — which handoff governs what

| File | Governs |
|---|---|
| `HANDOFF.md` (repo root) | **Backend / publishing** (B0–B7, Instagram auto-publish, cron, notifications). Still authoritative. Do not touch `src/lib/publisher.ts`, `notifier.ts`, `ig-token.ts`, or the cron routes — the redesign is presentation work. |
| `handoff-riviera-glass-2026-07-25.md` | The redesign's origin: design-bundle inventory, original assessment, the seven-stage plan. Its "Current State" is stale; the bundle inventory is still good. |
| `handoff-riviera-glass-stage4-2026-07-26.md` | **Superseded by this file.** |
| **This file** | Current state of the redesign and what to do next. |

---

## ⚠️ The session-duplication incident — read before starting work

Kevin's connection dropped mid-flight on 26 July and his session was
**duplicated**. Two Claude sessions then worked this repo in parallel for
several hours, neither aware of the other:

- Session `…363gr` built the numbered stages: PRs #20–#25.
- Session `…BAjj` built PR #26 (design-review punch list) and preserved
  Claude Design's content-pipeline plan.

**Both branched from the same commit (`4adb70f`), so no history was crossed and
nothing needs reverting.** This was verified independently by both sessions:
`main` is linear #20 → #21 → #22/#23 → #24 → #25, no duplicated commits.

**The cost was duplicated effort, not damage.** Session `…BAjj` began rebuilding
the month view without knowing Stage 4 had just merged, and discarded that work
uncommitted. Four review findings intended for Stage 4 were also missed, because
Stage 4 landed without the reviewing session's input (see "Outstanding" below).

**If a session ever resumes after a disconnect, do this first:**

```bash
git fetch --prune origin
git ls-remote --heads origin        # what branches actually exist
git log --oneline origin/main -10   # has main moved?
```

Then check open PRs. Nothing in the working tree reveals a parallel session —
only the remote does.

---

## Where things stand

- **`main` is at `c68bdc5`.** Stages 1–4 merged, plus the event-creation fixes.
- **PR #26 is open at `8713275`**, branch `claude/riviera-glass-punch-list-qhs5y8`.
  Conflict-free, CI green, `tsc` clean, preview deployed. Awaiting Kevin's merge.
- `tsc --noEmit` is clean on both. **Lint baseline is 37 problems (17 errors,
  20 warnings).** Older docs quote 38 and 42 — both stale. The error/warning
  split moved 16/21 → 17/20 in Stage 4: the phone day-view default costs one
  `set-state-in-effect` error, a rule that already fires three times in
  `CalendarView` for the same pattern. Not a regression.

### Merged to `main`

| PR | What |
|---|---|
| #20 | Stage 1 — design tokens (`src/lib/glass.ts`), JetBrains Mono |
| #21 | Stage 2 — glass sidebar, `PublishHealth.tsx` (ships unrendered) |
| #22 | Stage 3 — week view (`WeeklyBoard.tsx`), `PostCard.tsx` deleted |
| #23 | Event-creation fixes (off `main`, unrelated to the redesign) |
| #24 | Handoff docs |
| #25 | Stage 4 — month view extracted to `MonthGrid.tsx`, contrast pass, phone day-view default, `eventCoversDay` → `src/lib/calendar-utils.ts`, `canHover` → `glass.ts`. Screenshots in `docs/screenshots/stage4-month/`. |

### In PR #26, not yet on `main`

- `docs/design/pipeline/riviera-glass-pipeline-plan.md` — **Claude Design's
  content-pipeline spec. This is the only copy.** Merging #26 is what puts it
  on `main`.
- Week view: cross-column drops land where released and open the target column;
  day decks fan **independently** (a Set, not one dateKey — with one key,
  dragging a card out of a fanned day folded that day up behind you).
- `PLATFORM_NEUTRAL` + `platformStyle()` in `glass.ts` — neutral grey `ANY`
  instead of mislabelling `platform: 'any'` posts as Instagram.
- **12-hour times everywhere.** No `HH:mm` remains under
  `src/components/calendar`.

---

## Outstanding — four month-view items

All agreed in the design review, none started. Line numbers against
`src/components/calendar/MonthGrid.tsx` on `main`. Recommended as **one small
follow-up commit** after #26 merges, so it reverts on its own.

| Item | Line | Effect |
|---|---|---|
| `PLATFORM[…] ?? PLATFORM.instagram` | 91 | An `'any'` post gets an IG dot and code. `platformStyle()` already exists in `glass.ts` — the month view just doesn't call it. |
| Failed posts have no coloured edge | 98 | `edge: pf.ink` unconditionally. A failed post is invisible in month view; the row has no space for the week card's `PublishStatusBadge`, so the 3px left edge should carry it (`#8a2b12`, the glass error ink). |
| `+n more` lacks `stopPropagation` | ~232 | Clicking it falls through to the cell's `onDayClick` and opens the **create-event dialog** instead of showing the day. |
| `backdropFilter: blur(10px)` | 121 | On all 42 cells, against the design's own rule ("never on cards"). Cells sit on a flat wash so there is nothing to blur. Perf flag, not a bug — likeliest jank source in the installed PWA on iOS. |

Hover-gating from the same review is **already done** — `canHover()` is applied.

Note: below `sm:` the month cells render coloured dots, not text rows, so the
failed-edge and `+n more` fixes only affect ≥640px.

---

## Settled decisions — do not re-litigate

| Decision | Source |
|---|---|
| **12-hour times (`h:mm a`) everywhere** | Kevin, 26 Jul. Week view had drifted to `HH:mm` in Stage 3, month view shipped `HH:mm` in Stage 4; both corrected in #26. |
| **Month view: 158px cells that scroll**, rather than fitting six rows on one screen | Kevin, 26 Jul — "less cramped per day". |
| **Phones open on `day` view** | Kevin. Mount effect, not a lazy `useState` initialiser — reading `window` during render fails hydration. Default on first load only; switching to week/month sticks. |
| **Week drag: collapse-and-spread is correct as-is** | Kevin, 26 Jul, on a real phone. No mid-drag collapse feature. Changing column heights during a drag moves droppables under the finger — the cause of earlier wrong-day drops. |
| **Outside-month numerals use `INK.tertiary`** | The bundle's `rgba(27,20,31,.34)` composites to ~`#a8a5aa`, lighter than the design's own `#5d5660` floor — the exact complaint that started this redesign. |
| **Branch + preview only, no feature flag** | Kevin. One commit per stage; `git revert <sha>` is the rollback. |
| **Publish badge stays on the week card** | Stage and publish status are different axes. |
| **`/home` nav link stays out** | Route doesn't exist; would 404. |
| **`counts` / `health` props unpassed** | No endpoint reports them. Absent beats fabricated. |
| **Content pipeline is in scope** | Kevin. Spec is in `docs/design/pipeline/` (via #26). |
| **Dashboard home (Stage 7) out of scope** | Being respecced separately. |
| **No "published" celebration animation** | Design README line 65. |
| **Dark mode is a non-issue** | `.dark` exists but nothing sets the class. |

---

## Traps both sessions paid for — don't re-learn them

1. **`select-none` breaks dragging on iOS outright.** Added to stop the `REEL`
   label highlighting during a press (`2cb1ea8`), reverted after Kevin tested
   (`2693e7c`). The text selection is load-bearing: a long press starts iOS
   selection, which suppresses panning, which lets dnd-kit's 200 ms delay
   elapse and claim the gesture. Warning comment sits in `SortablePostCard`.
   The highlight is a deliberate open trade — a real fix needs `touch-action`,
   which trades against swipe-to-scroll.
2. **An inline style beats a Tailwind `sm:` variant.** Cost time three separate
   times: inline `minWidth: 0` collapsing the mobile snap columns, then
   `minHeight` and `fontSize` in the month cell. **If a value needs a
   breakpoint, it must be a class.**
3. **`h-dvh`, never `h-screen`.** In mobile WebKit (including Chrome on iOS)
   `100vh` is the *large* viewport; with `overflow-hidden` the bottom of every
   column was unreachable.
4. **scroll-snap fights dnd-kit auto-scroll.** Snap is suspended while
   `activeId` is set. Pre-existing bug, not Stage 3 damage.
5. **`closestCorners` drops on the wrong day** — it ranks by corner distance,
   not containment. Replaced with `pointerWithin` + `rectIntersection`.
6. **Tailwind v4 auto-gates `hover:` behind `@media (hover: hover)`** — verified
   against the installed 4.2.4 by compiling. So CSS hover classes are safe on
   touch; only *imperative* `onMouseEnter` handlers need the `canHover()` guard.
7. **`min-w` is only a floor** — `shrink-0` columns still grow to content. Week
   columns need a definite `w-[44vw] sm:w-auto`.

---

## Verification technique (this is how everything got tested)

Every real screen sits behind Supabase auth and **this container has no
credentials**.

1. Temp route outside the `(app)` group, e.g. `src/app/week-preview/page.tsx`,
   rendering the component with mock props.
2. Temp exemption in `src/proxy.ts`'s `isPublicPath`.
3. `.env.local` with stub Supabase values (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9/stub`).
4. `npm run dev`, drive with Playwright.
5. **Remove the route, the exemption and `.env.local` before committing.**
   Verify: `git status` clean and `grep -c 'TEMP harness' src/proxy.ts` → 0.

Gotchas:
- Use `http://localhost:3000`, **not** `127.0.0.1` — Next blocks cross-origin
  dev resources and hydration fails silently.
- Hide the dev overlay: `page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })`.
- Playwright is not a project dependency — import from
  `/opt/node22/lib/node_modules/playwright/index.js` (CommonJS). Chromium at
  `/opt/pw-browsers/chromium`. Never run `playwright install`.
- Make mock `onMovePost` really mutate `scheduled_at`; cards render from
  `posts`, so a no-op handler makes every drag look broken.
- Scope locators to a column — badge text collides with title text.
- Kill stale dev servers, or the next one silently takes port 3001.

**Touch cannot be tested here.** CDP touch events reach the page but do not
drive Chromium's compositor, so neither swipe-to-scroll nor press-and-hold drag
can be exercised. Every touch bug this project has seen was found by Kevin on a
real phone. **Say so honestly rather than claiming verification.**

---

## How Kevin previews

Preview URL is stable per branch (currently
`claude-social-calendar-git-clau-7247fa-kevins-projects-90f0c300.vercel.app`).
Supabase redirect wildcards are configured, so logging in on a preview works.

**Repeat this to him:** the preview talks to the **real production Supabase
database**. Dragging a post in a preview genuinely reschedules it.

This sandbox's egress proxy blocks the Vercel preview URL (403), so it cannot be
fetched from here.

---

## Remaining stages

| # | Stage | Status |
|---|---|---|
| 5 | ReadyReel | **Blocked.** Verify `/2/files/get_thumbnail_v2` returns thumbnails for large videos with real credentials before building. Fallback needing no thumbnail API: a muted `<video preload="metadata" src={temporaryLink}#t=0.1>` face shows the first frame, and `getTemporaryLink()` already exists. Expect the **n=1** state — the Ready folder holds one file. Also: the reel's cylinder radius is fixed at 104px but needed radius is `(FACE_W/2)/tan(π/n)` — faces interpenetrate past ~8. Cap at 8 or compute it. And its copy promises drag that isn't wired (only `onPick` exists) — ship click-to-schedule and reword. |
| 6 | Today pane | **Blocked on Kevin:** merge (keep Calendars toggles + TimeGrid, restyle) vs replace (follow README §4, losing per-calendar toggles and the day time-grid) vs defer. Recommended: defer, then merge. |
| 7 | Dashboard home | Out of scope. |
| 8 | **Content pipeline** | **Ready to build.** Spec: `docs/design/pipeline/riviera-glass-pipeline-plan.md` (arrives on `main` with #26). Touches only `src/components/pipeline/PipelineBoard.tsx`. Verified against the code: its Tailwind-hover claim holds, its must-not-change anchors all exist. **Two corrections to that plan:** its lint baseline of 42 is wrong (37), and `PLATFORM_CONFIG` is already `Record<Platform, …>` so the board never had the `'any'` bug — keep the exhaustive typing but source the neutral from `glass.ts`'s `PLATFORM_NEUTRAL` rather than restating literals. Its §4b/§4e (header, grid view) are acknowledged extrapolation, not designer intent. |
| 9 | Two-way Google Calendar sync | **After the last stage**, Kevin's explicit call. Sync is read-only today; nothing created in the app has ever reached Google. OAuth scope is already `auth/calendar`, so **no re-consent needed**. Care goes into: local row saving while the Google push fails, duplicate prevention on the next sync, and which side wins. |

---

## Open decisions awaiting Kevin

1. **The week view renders no calendar events at all.** `WeeklyBoard` has no
   `events` prop and never has; month, day and list all receive `visibleEvents`.
   An event created from the week toolbar's "+ New Event" can only be seen by
   switching view — Kevin hit exactly this. Proposal on the table: compact rows
   above the post cards using the calendar's colour as a left border, mirroring
   `MonthGrid`.
2. **Stage 6 Today pane** — merge vs replace vs defer (above).
3. **`IdeaCard` is still the old flat white/amber card**, unchanged, so ideas
   look like a different app inside the glass week columns. A ~20-line glass
   variant would close it.
4. **Stat-tile naming** — "ready to go" counts already-published posts, which
   reads inflated. Rename to "on track", or count scheduled only.
5. **Publish Health semantics** — the suggested server shape maps "any failed
   post in 24h" → `error` / "Publishing blocked", which overstates. Reserve
   `error` for config/token failure; one failed post is `warning`.

## Ideas worth proposing, not yet agreed

- **ReadyReel drag-to-day as a fast-follow.** The gesture the copy accidentally
  promised is genuinely good — dragging an export onto a day to create a
  pre-filled post is the core loop in one motion. Needs real scoping:
  `DndContext` lifted to `CalendarView`, a shared droppable id scheme, and a
  post-dialog prefill path.
- **Merged agenda in the Today pane** — the mock mixes calendar events with
  "Publish: …" rows. Arguably more useful than the raw TimeGrid for a creator.
- **"Oldest export" as a nudge** — tint the reel caption amber past a threshold
  (say 7 days), same philosophy as the CONGESTED chip.
- **Failed-post rollup in the sidebar** — `derivePublishState` and the posts are
  already client-side; a small red "1 post failed" line under the nav would
  surface the state that matters most without waiting for a Publish Health
  endpoint.

---

## Notes on working with Kevin

- He decides scope. Surface trade-offs with a clear recommendation and he
  answers fast. **Don't over-ask** — he will tell you to just decide.
- He values honesty about verified vs assumed. "I could not test touch in this
  container" lands better than a confident claim.
- Don't fabricate data to make a design look right — flag it.
- He reviews visually on his phone (Chrome on iOS). Push after each meaningful
  stage so he gets a preview.
- **Don't push new work onto a PR he has marked ready for review** — that reads
  as ignoring his signal to merge. Open a follow-up instead.
