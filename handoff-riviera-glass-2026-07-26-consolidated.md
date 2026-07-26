# Session Handoff — Riviera Glass redesign, Stages 1–4 and 8 merged

**Written 26 July 2026, evening. Consolidates two sessions. Updated later the
same evening** after Stages 4 and 8 merged. Supersedes
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

- **`main` is at `13b027e`.** Stages 1–4 and 8 merged, the design-review punch
  list fully discharged, plus the event-creation fixes. (This line read
  `1485c94` until #29 merged — re-check it with `git log origin/main -1`
  rather than trusting it.)
- **No open PRs. Only `main` exists on the remote.**
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
| #26 | Punch list: week-view drop lands where released + opens target, days fan independently, `PLATFORM_NEUTRAL`/`platformStyle()`, **12-hour times everywhere**. Preserved `docs/design/pipeline/`. |
| #27 | Month view: neutral `'any'`, failed-post `#8a2b12` left edge, `+n more` opens the day, `backdrop-filter` dropped from the 42 cells, **and phones tap-to-open-day** (below `sm:` the cells are dots, so the cell tap was the only interaction and it opened the create-event dialog). |
| #28 | Stage 8 — pipeline board. Depth planes **`xl:`+** (moved from `lg` — at 1024 six columns share ~110px each), empty-column recession + `EMPTY` marker, 15px/13px headers, resting shadows/colours as classes. Screenshots in `docs/screenshots/stage8-pipeline/`. |
| #29 | Docs — preserved `docs/design/home/riviera-glass-home-plan.md`, brought this handoff current. |

### Design specs preserved on `main`

Both exist **only** in the repo — they were session uploads and would have been
lost otherwise. Preserving them before implementing is the rule, not a nicety.

- `docs/design/riviera-glass/` — the v2 bundle (README, code, mock, screenshots).
- `docs/design/pipeline/riviera-glass-pipeline-plan.md` — Stage 8's spec. Built.
- `docs/design/home/riviera-glass-home-plan.md` — the `/home` dashboard plan.
  **Not built.** Rulings from it are folded into the decisions table below.

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
| **Content pipeline is in scope** | Kevin. Spec in `docs/design/pipeline/`. **Built and merged (#28).** |
| **Week view is a content board — permanently** | Kevin, and formalized as Ruling 2 of the home plan. `WeeklyBoard` builds columns from posts and ideas only; calendar events have never rendered there and **now never will**. The model is: week = production cockpit, month = everything, home = where events are created and seen. This closes the long-running "should the week view show events" question — the answer is no. |
| **No time-grid week view** | Kevin, asked directly about an Apple-Calendar-style layout: "It's more useful to have it as a content board." `TimeGrid.tsx` already does the one-day version and stays in the right panel. |
| **Token-expiry display is cut** | Home plan Ruling 1. `app_credentials` is service-role only, `expires_at` is often null, and `PublishHealth`'s `live` state asserts a running cron with **no heartbeat to verify it**. Publish health becomes problems-only. `PublishHealth.tsx` stays in the tree unused — do not delete, do not wire. |
| **Event creation moves to home, with a visible outcome** | Home plan Ruling 3. The "new event dialog does nothing" report was really the visibility gap: the dialog saves correctly, the week view just can't show the result. Home gets the AI input *and* an upcoming-events list, shipped together or not at all. |
| **Pipeline load / stage counts cut** | Kevin — "not useful". Takes the CONGESTED / overdue-per-stage / oldest-days machinery with it. |
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
2. **An inline style beats a Tailwind class — including `hover:`.** Cost time
   five times now. Three were breakpoints: inline `minWidth: 0` collapsing the
   mobile snap columns, then `minHeight` and `fontSize` in the month cell. Two
   were pseudo-classes, found in review of Stage 8: an inline `boxShadow`
   alongside `hover:shadow-[…]` left every pipeline card lifting without
   deepening, and inline `color` alongside `hover:text-[…]` killed the hover
   colour on three controls (the underline still worked, which masked it).
   **If a value has any variant — breakpoint or state — it must be a class.**
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
   Prefer classes for new work; the week board's gated handlers are phone-tested
   and not worth churning.
8. **Screenshots cannot verify hover or touch.** Stage 8 shipped two dead hover
   styles past a screenshot pass. If a change is a hover state, drive it with
   Playwright's `.hover()` and compare computed styles; if it is touch, say
   plainly that it is untested.
9. **A responsive breakpoint is not verified until the boundary is.** Stage 8's
   planes were checked at 1440 and 390 and were worst at 1024. Test the width
   either side of the switch.
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
| **/home** | Dashboard | **Ready to build.** Spec: `docs/design/home/riviera-glass-home-plan.md`, verified against the code (see its errata below). Three phases, one commit each. **Phase A** — route + `HomeView`: greeting, next-publish hero, stat tiles, week strip, needs-attention. One posts query, no new endpoints. **Phase B** — quick actions, the events block, **the `src/lib/events.ts` extraction**, and re-adding the `/home` nav entry. **Phase C** — ReadyReel into Row 3; hard-gated on Stage 5. |
| 5 | ReadyReel | **Blocked.** Verify `/2/files/get_thumbnail_v2` returns thumbnails for large videos with real credentials before building. Fallback needing no thumbnail API: a muted `<video preload="metadata" src={temporaryLink}#t=0.1>` face shows the first frame; `getTemporaryLink()` already exists. Expect the **n=1** state. Also: cylinder radius is fixed at 104px but needed radius is `(FACE_W/2)/tan(π/n)` — faces interpenetrate past ~8, so cap at 8 or compute it. And its copy promises drag that isn't wired (only `onPick` exists) — ship click-to-schedule and reword. |
| 6 | Today pane | **Blocked on Kevin:** merge (keep Calendars toggles + TimeGrid, restyle) vs replace (README §4, losing per-calendar toggles and the day time-grid) vs defer. Recommended: defer, then merge. Note the home plan may absorb part of its purpose. |
| 7 | Dashboard home | Superseded by the `/home` plan above. |
| 8 | Content pipeline | **Done** (#28). |
| 9 | Two-way Google Calendar sync | **After the last stage**, Kevin's call — but he has restated he wants it: *"I would still want the new event dialogue to actually work alongside 2-way sync."* Sync is one-way pull today; `google-calendar.ts` has **no function that creates anything in Google**, so nothing the app has ever made has reached it. **No re-consent needed** — the OAuth scope is already `auth/calendar`. |

### Stage 9's hook point — why the home plan's extraction matters

There are **two** app-side event write paths today, verified: `EventDialog.tsx`
lines 115–116 (its own insert/update) and `CalendarView.tsx` line 388
(`handleAIEvent`, 23 lines). `src/lib/events.ts` does not exist yet.

Phase B of the home plan routes **both** through `src/lib/events.ts`
(`createEventFromParsed` + `createEvent`/`updateEvent`). Do that properly and
Stage 9 adds push-to-Google in one file. Skip it and Stage 9 has two places to
patch and will miss one. Leave `external_id` null on app-created events — Stage
9 backfills it from Google's insert response.

The care in Stage 9 is not the insert. It is: the local row saving while the
Google push fails (don't leave the user thinking it synced), preventing the two
ends duplicating on the next sync, and deciding which side wins when both
changed.

### Errata in the home plan — now corrected IN the file

The plan is accurate about the codebase; these three were stale or since
settled. **All three are now fixed in
`docs/design/home/riviera-glass-home-plan.md` itself**, under a "Corrections"
banner at the top, because a session that opens the plan directly never sees
this handoff:

1. **Lint baseline is 37**, not the 42 it quoted. Third document with a wrong
   number — check, don't inherit. Re-verified by running `npm run lint`.
2. **Stage 8 is merged**, not "PR #28, under review".
3. **Time format is settled: 12-hour `h:mm a`.** The plan said "match whatever
   Kevin ruled" — he ruled, and every calendar surface already complies.

Also corrected in the plan: the `src/lib/events.ts` extraction now reads as
load-bearing rather than tidying, with a verified write-path inventory and a
grep done-check.

**A fourth app-side write path exists that the table above misses:**
`CalendarView.tsx:326`, a `delete`. It must route through `events.ts` too —
otherwise Stage 9 pushes creates and updates to Google but not deletions,
leaving ghost events in Kevin's calendar. The full inventory is now in the
plan.

Verified present, as the plan assumes: `IdeaDialog` at
`src/components/ideas/IdeaDialog.tsx`, `media_dropbox_path` on `SocialPost`,
`/` redirecting to `/calendar`, and `source: 'app'` on both write paths.

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
