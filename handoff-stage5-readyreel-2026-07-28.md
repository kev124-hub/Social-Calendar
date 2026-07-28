# Session Handoff — Stage 5: ReadyReel, the revolving reels display

**Written 28 July 2026.** Scope: **one task only** — build ReadyReel into `/home`.

> **This is a task brief, not a state document.** `HANDOFF.md` § CURRENT STATE is
> the source of truth for the project. Read it first, then this. **Delete this file
> when Stage 5 ships.**
>
> **Numbering, because it has already caused one wrong brief:** the revolving reels
> display is **Stage 5**. **Stage 6** is the Today pane / right panel restyle — a
> different, lower-priority job with its own brief
> (`handoff-stage6-today-pane-2026-07-28.md`). Kevin asked for "stage 6" meaning
> the reels; if he says a stage number, confirm which feature he means.

---

## Goal

Build the **ReadyReel** — a revolving 3D display of the videos sitting in Dropbox
ready to post — into the `/home` dashboard. This is **Phase C** of
`docs/design/home/riviera-glass-home-plan.md`. Phases A and B are shipped; this is
the last unbuilt piece of the riviera-glass redesign.

Kevin's words, 25 July: *"super useful, but only if the thumbnails show."*

---

## THE GATE IS MET — thumbnails work

This was blocked for three days on whether Dropbox would return a thumbnail for a
large video. **Resolved 28 July.**

- The ready folder holds **exactly one file**: `Need a minute.mp4`, **84 MB**,
  at `/Social Media/Ready to Post/`.
- Dropbox returned a **real frame** for it — a beach/pool/sun-loungers still at
  640×480, not a grey placeholder. **Kevin rendered it and confirmed visually.**

**One thing is still unproven, and it is not a blocker.** That frame came through a
user-account MCP connector and Dropbox's *preview* service. The app authenticates
as a **scoped app** and would call `/2/files/get_thumbnail_v2`. That a real
thumbnail exists server-side for this file is now certain; that the app's own auth
path reaches it is likely but untested. **Two ways forward, both viable:**

1. **Add a thumbnail call** to `src/lib/dropbox.ts`. Note it currently has **only**
   `listReadyFolder()` and `getTemporaryLink()` — there is no thumbnail function at
   all, so this is new code either way. Verify against production credentials early;
   if `get_thumbnail_v2` refuses mp4, fall back to (2) rather than fighting it.
2. **No thumbnail API at all** — a muted
   `<video preload="metadata" src={temporaryLink}#t=0.1>` face shows the first
   frame. `getTemporaryLink()` already exists and already works in production
   (confirmed: it resolves the team-namespace path with **no**
   `Dropbox-API-Path-Root` header). At n=1 this is trivially sufficient.

**Recommendation: build against (2) first.** It has no unknowns, it works today,
and it makes the feature shippable in one pass. Add (1) later as an optimisation if
video faces prove heavy.

---

## Where it goes

**`/home`, Row 3's right slot.** Not the Today pane.

`src/components/home/HomeView.tsx` around line 300 already anticipates it:

> *Row 3 — needs-attention + events. Phase A shipped this full-width because the
> right column had nothing in it yet; Phase B fills it. Both blocks are standalone,
> so Phase C moving the events panel down to a full-width Row 4 (ReadyReel takes
> this slot) stays a layout-only change.*

So the layout move is: **events panel → full-width Row 4; ReadyReel → Row 3's right
slot.** Keep the explicit `minmax(0,1fr)` on the single-column case — a bare `grid`
sizes an auto column to min-content, and `truncate` then reports the whole
untruncated string. That comment is load-bearing; don't drop it.

**⚠️ `docs/design/riviera-glass/README.md` §4 puts ReadyReel inside the Today
pane instead. That is the older, rejected layout.** The `/home` plan wins. §4 also
describes a Today pane with no per-calendar toggles and no TimeGrid, which was
ruled out — see the Stage 6 brief.

---

## The design: use v2, which is sparse-first

Reference implementation: **`docs/design/riviera-glass/code/ReadyReel.tsx`**
(documentation, not a build input — `docs/**` is excluded from tsconfig and eslint).
Target path: `src/components/calendar/ReadyReel.tsx`.

**v2 exists because v1 assumed a full folder.** It drives four modes off
`items.length` (line 92):

| `items.length` | mode |
|---|---|
| 0 | `empty` |
| 1 | `single` |
| 2–3 | `fan` |
| 4+ | `cylinder` |

**Expect the `single` mode.** n=1 is confirmed as today's reality — the whole reason
v2 was reworked. A design that only looks right with six faces would look broken in
production right now.

Header copy is already conditional (line 72–74):
`READY TO POST · {n} EXPORT{S}` with an `· OLDEST {age}` suffix, falling back to an
empty-state string at n=0.

### Three known defects — fix them as you build, they are pre-diagnosed

1. **The cylinder radius is hardcoded and wrong.** `FACE_W = 84` (line 31) and
   `RADIUS = 104` (line 33), but a regular n-gon needs
   `RADIUS = (FACE_W / 2) / tan(π / n)`. At n=8 that is ~101px, so 104 is fine; at
   n=9 it is ~115px and the faces **interpenetrate**. Either compute it from
   `items.length` or hard-cap the cylinder at 8 faces and overflow the rest into a
   count. `angle = 360 / max(items.length, 1)` (line 93) is already dynamic — only
   the radius is not.
2. **The copy promises drag that does not exist.** Line 227 reads *"Click one to
   open it in a new post, or drag it onto a day."* Only `onPick` is wired
   (lines 127, 166, 210) — there is no drag. **Ship click-to-schedule and reword
   the caption.** Do not half-wire a drag: the week board's dnd-kit setup already
   fights scroll-snap on mobile (see `WeeklyBoard.tsx`'s comment on suspending
   snap while dragging), and adding a second drag source is its own project.
3. **`@keyframes glass-float` is already in `src/app/globals.css`** (line 251). An
   older handoff tells you to add it. It is done — do not add a duplicate.

---

## Design rules that are load-bearing (`src/lib/glass.ts`)

- `INK.tertiary` (`#5d5660`) is the **lightest text allowed on glass — never go
  paler**.
- `GLASS.wash` belongs on the app container, **not** on `body`.
- `MOTION.ease` for transitions; documented hover lifts are
  `translateY(-4px)` / `translateX(3–4px)` at `.20s`.
- `platformStyle()` / `PLATFORM` for per-network colour. Note `'any'` is a real
  platform value and deliberately renders **neutral grey**, not Instagram purple —
  there is a comment explaining why; don't "fix" it.

Shipped surfaces in the same idiom to match against:
`src/components/calendar/WeeklyBoard.tsx`, `MonthGrid.tsx`,
`src/components/layout/Sidebar.tsx`, `src/components/home/HomeView.tsx`.

---

## What clicking a face should do

`onPick(item)` → open a new post prefilled from that Dropbox file. The pipeline
already has everything needed: `PostDialog` handles creation, `social_posts` has the
Dropbox path fields (migration 005), and the publish worker takes it from there.

**Do not invent a second write path.** Posts are created through the existing
pipeline components; events go through `src/lib/events.ts`, which is a deliberate
choke point (`rg -U -l "from\\('calendar_events'\\)[\\s\\S]{0,120}?\\.(insert|update|upsert|delete)\\(" src/`
must list exactly two files).

---

## Errors / blockers

**None.** `main` is green; 208 checks pass, `tsc` clean, `next build` compiles, lint
at its 37-problem baseline.

---

## Environment / setup

- Next.js **16.2.4**, React 19.2.4, Tailwind v4, `@base-ui/react`, date-fns v4.
- **`npm ci` first** — `node_modules` is absent in a fresh container, and
  `AGENTS.md` requires reading `node_modules/next/dist/docs/` before writing code.
  **This is not the Next.js in your training data.**
- `npm test` → **208 checks**, no framework, `node --experimental-strip-types`.
  **Run under a non-UTC `TZ`** — several guarded bugs are invisible at UTC+0.
- `npm run lint` → **37 problems (17 errors, 20 warnings)**, all pre-existing.
  **Re-measure rather than trusting this number**; it has been carried wrongly by
  five documents.
- After a merge: `git fetch --prune origin && git checkout -B <branch> origin/main`.
  Without `--prune` the stop hook reports GitHub's merge commit as your own
  unverified work. See `AGENTS.md`.
- Dropbox env vars (names only): `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`,
  `DROPBOX_REFRESH_TOKEN`, optional `DROPBOX_READY_FOLDER` (defaults to
  `/Social Media/Ready to Post`). Server-side only; the browser never sees them.

### Verification limits — these are not negotiable, plan around them

- **No database credentials** and no `.env.local`. The app cannot run against real
  data in this container, so **you cannot see this feature work locally.**
- **The Vercel preview URL and `dropboxusercontent.com` both 403** through the
  egress proxy. You cannot fetch a thumbnail to check it, and you cannot load the
  preview. Kevin can do both in seconds — ask him.
- **Touch is untestable.** CDP touch events reach the page but do not drive
  Chromium's compositor. Every phone bug this project has had was found by Kevin.
  A 3D transform carousel is *exactly* the kind of thing that behaves differently
  under a finger, so treat mobile as unverified until he says otherwise.
- **`tsc` clean + a compiling build does NOT mean the page renders.** Proven on
  28 July: `/calendar` shipped white from a temporal-dead-zone `ReferenceError`
  that passed both, because the read was inside a closure. **For UI work the
  preview is the gate.** State plainly what you did and did not verify.

---

## Open questions

1. **Which face source** — `get_thumbnail_v2` or the `<video>` first frame. The
   recommendation above is the video fallback; Kevin has not been asked to choose,
   and probably does not need to be if it looks right.
2. **Cylinder cap vs computed radius** for defect #1. Either is defensible; at n=1
   neither is observable today, so pick the simpler and comment it.
3. **Whether Row 4 needs anything else** once the events panel moves down
   full-width. The home plan treats it as layout-only.

---

## Next steps

1. Read `HANDOFF.md` § CURRENT STATE, then `AGENTS.md`, then this file.
2. `npm ci`, then `TZ=America/New_York npm test` for a green baseline.
3. Read `docs/design/riviera-glass/code/ReadyReel.tsx` in full, then
   `HomeView.tsx`'s Row 3 comment.
4. Decide the face source (recommend the `<video>` fallback) and fix the radius
   defect while porting, rather than after.
5. Move the events panel to full-width Row 4; put ReadyReel in Row 3's right slot.
6. Reword the drag caption. Wire `onPick` to the existing post-creation path.
7. Open a draft PR and **ask Kevin to check the preview** — naming what you could
   not verify. At n=1 the `single` mode is all he will see; say so, so a sparse
   display is not mistaken for a broken one.
8. When it ships: fold anything durable into `HANDOFF.md` and **delete this file.**
