# Session Handoff — Stage 6: the Today pane (right panel) restyle

**Written 28 July 2026.** Scope: **one task only** — Stage 6.

> **This is a task brief, not a state document.** `HANDOFF.md` § CURRENT STATE is
> the source of truth for what this project is and what else is outstanding. Read
> it first, then this. **Delete this file when Stage 6 ships** — three overlapping
> handoffs were deleted on 28 July for exactly the confusion that accumulating
> them causes, and this one is not exempt.

---

## Goal

Restyle the right-hand **Today pane** (`src/components/calendar/RightPanel.tsx`)
into the riviera-glass idiom. It is the **last surface in the calendar still
wearing the old shadcn/semantic-token look** — the sidebar, month grid and week
board were all converted during the riviera-glass work; this one was deferred
pending a decision that has now been made.

Measured 28 July: `RightPanel.tsx` has **10** uses of old semantic tokens
(`border-border`, `bg-background`, `text-muted-foreground`) and **0** uses of the
glass tokens. That gap is the whole job.

---

## Key decisions & constraints

### SETTLED: Stage 6 is a MERGE, not a replace

The stage sat blocked on Kevin from 26 July with three options — **merge** (keep
the Calendars toggles + TimeGrid, restyle), **replace** (adopt README §4, losing
per-calendar toggles and the day time-grid), or **defer**.

**Kevin settled it by action on 28 July.** He asked for the panel to show whichever
day is selected in the week board, which presumes the panel keeps being a
day-detail surface. That is the merge option. **Do not re-litigate this, and do not
implement the replace design.**

### ⚠️ THE TRAP: `docs/design/riviera-glass/README.md` §4 is the REJECTED design

§4 ("Today pane (right panel) — fits without scrolling") specifies:

> Width 288px … header ("TODAY · SAT 25" mono 10 + Playfair 22 summary) → **three
> stat tiles** in a 3-col grid → **ReadyReel** → **agenda**, max 4 rows … Anything
> beyond 4 rows collapses into a "+n later" row rather than making the pane scroll.

**That has no per-calendar toggles and no TimeGrid — it is the replace option.**
Reading §4 as the spec and building it is the single most likely way to get this
stage wrong. Use §4 only for its *visual vocabulary* (type scale, mono numerals,
hover lifts, the 14px gap rhythm), not for its component list.

It also places **ReadyReel inside the Today pane**, which contradicts the `/home`
plan that puts ReadyReel in Row 3 of `/home`. ReadyReel is Stage 5 and **not this
session's job** — see below.

### ⚠️ UNRESOLVED TENSION — decide this early, and say which way you went

The stage exists to fix a specific complaint (riviera-glass README, problem #3):

> right-hand Today pane required scrolling

But the merge decision keeps the **TimeGrid**, which is 6am–10pm at
`HOUR_PX = 56` — about **896px of content**. It cannot fit a viewport-height pane
without scrolling. **"Fits without scrolling" and "keeps the TimeGrid" are
incompatible as literally stated.**

Nobody has ruled on this. Reasonable resolutions, roughly in order of how well
they honour both:

1. **Let the TimeGrid be the one scrolling region**, with everything above it
   (Calendars, day nav) fixed. The pane as a whole does not scroll; the grid does.
   This is close to today's structure and is probably what "merge" means in
   practice.
2. **Collapse the TimeGrid to the day's occupied hours** rather than a fixed
   6am–10pm window, so a light day genuinely fits.
3. **Ask Kevin.** He is responsive and has strong opinions about this pane.

Whichever you pick, **write it down in the commit and in `HANDOFF.md`** — this is
the second decision on this pane that would otherwise be lost.

### Must not be lost in the restyle

- **Per-calendar visibility toggles** (colour swatch, strikethrough when hidden,
  the gear for app-owned calendars) — explicitly the reason merge beat replace.
- **The TimeGrid**, showing the selected day's events positioned by hour.
- **The day nav arrows** (‹ ›) and the heading.
- **The icon rail** on the right edge, including the close button.

### Design rules that are load-bearing, from `src/lib/glass.ts`

- `INK.tertiary` (`#5d5660`) is the **lightest text allowed on glass — never go
  paler.** The old `text-muted-foreground` is paler than this; that substitution
  is most of the restyle.
- `TODAY_BORDER` — "today = dark outline, **never its own hue**".
- `SELECTED_RING` — the selected day's outer ring. Added 28 July. Today is named
  in words and selection is ringed, deliberately: a day can be both at once, so
  two treatments competing for one border leaves neither readable.
- `dayTint(dow)` — weekend vs weekday tints, already used by the week board and
  month grid.
- `GLASS.wash` goes on the app container, **not** on `body`.
- `MOTION.ease` + the documented hover lifts (`translateY(-4px)` /
  `translateX(3–4px)`, `.20s`).

Reference implementations in the same idiom, all already shipped:
`src/components/calendar/WeeklyBoard.tsx`, `MonthGrid.tsx`,
`src/components/layout/Sidebar.tsx`. Design-time originals (documentation, not
build inputs, and excluded from tsconfig/eslint) are in
`docs/design/riviera-glass/code/`.

---

## Current state — what `RightPanel.tsx` is today

Converted on 28 July from self-owned date state to **controlled**:

```tsx
interface Props {
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  date: Date                        // controlled by CalendarView
  onDateChange: (date: Date) => void
  calendars: Calendar[]
  onToggleCalendar: (cal: Calendar) => void
  onEditCalendar: (cal: Calendar) => void
  onClose: () => void
}
```

**The date lives in `CalendarView`** as `panelDate`, derived through
`effectivePanelDate`, and is shared with the week board so the two cannot
disagree about which day is selected. Clicking a day column header in
`WeeklyBoard` calls `onSelectDay`, which sets `panelDate` and force-opens the
panel.

`effectivePanelDate` snaps the selection into the visible week — **and it MUST
stay declared below `const weekStart`** in `CalendarView`. It originally sat with
the other state, ~200 lines above `weekStart`, and crashed `/calendar` with a
temporal dead zone `ReferenceError`. `tsc` and `next build` both pass that,
because the read is inside a closure. There is a comment on it saying so; do not
"tidy" it back up to the top.

Renders, top to bottom: **Calendars** (collapsible, per-calendar toggles) → **day
nav** (‹ `EEE d MMM` · today ›) → **TimeGrid** → **icon rail** (right edge).

Filtering is zone-correct already:
`formatInZone(e.starts_at, e.time_zone, 'yyyy-MM-dd') === dateKey`. **Keep
`formatInZone`** — reverting to `format(new Date(...))` reintroduces a bug the
whole timezone workstream existed to remove.

### Files you will touch

- `src/components/calendar/RightPanel.tsx` — the work.
- `src/components/calendar/TimeGrid.tsx` — likely, if the scrolling question
  changes its hour window. Already zone-correct (`partsInZone` for position);
  keep it that way.
- `src/lib/glass.ts` — only if a genuinely new token is needed. Prefer reusing.
- `src/app/globals.css` — has `@keyframes glass-float` at line 251 already.
- `CalendarView.tsx` — only if the pane's width changes (it renders the
  `w-[268px]` wrapper; README §4 says 288px).

---

## What is NOT this session's job

- **Stage 5 / ReadyReel.** Its gate — Kevin's *"super useful, but only if the
  thumbnails show"* — **was resolved on 28 July: the thumbnails show.** Dropbox
  returned a real frame for the 84 MB `Need a minute.mp4` (a beach/pool still, not
  a grey placeholder), confirmed visually by Kevin. So Stage 5 is unblocked, and
  `HANDOFF.md` carries its three pre-diagnosed defects and the `<video>` fallback.
  **Leave it alone unless Kevin redirects you.**
- The `deleteEventFromGoogle` source guard, the all-day `date`-column question,
  and the other open items in `HANDOFF.md`. All out of scope here.

---

## Errors / blockers

**None.** `main` is green at `cddfd69`; 208 checks pass, `tsc` clean, `next build`
compiles, lint at its 37-problem baseline.

---

## Environment / setup

- Next.js **16.2.4**, React 19.2.4, Tailwind v4, `@base-ui/react`, date-fns v4.
- **`npm ci` first** — `node_modules` is absent in a fresh container, and
  `AGENTS.md` requires reading `node_modules/next/dist/docs/` before writing code.
  **This is not the Next.js in your training data.**
- `npm test` → **208 checks**, no framework, `node --experimental-strip-types`.
  **Run it under a non-UTC `TZ`** (`TZ=America/New_York npm test`) — several
  guarded bugs are invisible at UTC+0. See `tests/README.md`.
- `npm run lint` → **37 problems (17 errors, 20 warnings)** on `main`, all
  pre-existing. **Re-measure rather than trusting this number** — it has been
  carried wrongly by five documents (42 until 26 July, 36 in three commit
  messages on 27 July).
- After a merge: `git fetch --prune origin && git checkout -B <branch> origin/main`.
  Without `--prune`, the stale remote ref makes the stop hook report GitHub's
  merge commit as your own unverified work. See `AGENTS.md`.

### Verification limits — plan around these, they are not negotiable

- **No database credentials.** No `.env.local`; the app cannot run against real
  data in this container.
- **The Vercel preview URL and `dropboxusercontent.com` both 403** through the
  egress proxy. You cannot fetch either.
- **Touch is untestable.** CDP touch events reach the page but do not drive
  Chromium's compositor. Every phone bug this project has had was found by Kevin.
- **`tsc` clean + a compiling build does NOT mean the page renders.** Proven on
  28 July: `/calendar` shipped white from a TDZ error that passed both. **For UI
  work the Vercel preview is the gate.** Say plainly what you did and did not
  verify; do not present green local checks as visual confirmation.

---

## Open questions

1. **The scrolling tension above** — the one real decision to make.
2. **Pane width**: 268px today, README §4 says 288px. Trivial, but it affects the
   calendar's remaining width; worth a deliberate choice.
3. **Animated counters.** §4/§ "Today pane" mentions `{ready, behind, queued}`
   rAF-ramped counters (1100ms). Those belong to the *replace* design's stat
   tiles. If the merge keeps no stat tiles, they are out of scope — but if you add
   a compact summary line, that is where they would go.

---

## Next steps

1. Read `HANDOFF.md` § CURRENT STATE, then `AGENTS.md`, then this file.
2. `npm ci`, then `TZ=America/New_York npm test` to confirm a green baseline
   before changing anything.
3. Read `RightPanel.tsx` alongside `WeeklyBoard.tsx` — the second is the idiom to
   match, and it is the panel's new sibling in behaviour as well as looks.
4. **Resolve the scrolling question** (pick one of the three options, or ask
   Kevin) before writing styles. It determines the layout.
5. Restyle, preserving the four must-keep elements.
6. Open a draft PR, and **ask Kevin to check the preview** — naming what you could
   not verify yourself. Weekend (amber) columns and dark-on-tint contrast are
   where this design has been least trustworthy unseen.
7. When it ships: fold anything durable into `HANDOFF.md` and **delete this file.**
