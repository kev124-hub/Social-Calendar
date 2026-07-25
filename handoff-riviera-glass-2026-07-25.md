# Session Handoff — "Riviera Glass" Visual Redesign

**Written: July 25, 2026.** Scope: the visual redesign workstream only.

## ⚠️ Relationship to `HANDOFF.md` — read this first

`HANDOFF.md` at the repo root is the project's source of truth for the
**backend / publishing** workstream (B0–B7, the Instagram auto-publish
pipeline, cron, notifications). It declares itself authoritative and it still
is, for that work. **This file does not supersede it.**

This file covers a **separate, parallel workstream**: a presentation-only
redesign living on its own branch. The two do not overlap. If you find a
conflict about anything backend, `HANDOFF.md` wins. If you find a conflict
about anything visual on this branch, this file wins.

**Do not touch** `src/lib/publisher.ts`, `src/lib/notifier.ts`,
`src/lib/ig-token.ts`, or the cron routes. This is presentation work.

---

## Goal

Kevin asked to make "major design element changes (mostly visual)" to the
Social Calendar, with an explicit safety requirement in his own words:

> "keep everything related to this redesign on a new branch so that it would
> be easy to return to the current production state if it blows up or I dont
> like it"

He then supplied a design handoff produced by Claude Design — the "Riviera
Glass" redesign — as a zip. The task became: assess that handoff against the
real codebase, then implement it in stages that are individually revertable.

Kevin's three stated grievances that drove the design (from the design README):

1. Cramped, visually static, "no UI/UX appeal"
2. Light fonts on light backgrounds — unreadable. **Nothing lighter than
   `#5d5660` for text.**
3. Month view too cramped to be useful; week-view dates hard to read;
   right-hand Today pane required scrolling

---

## Branch & Git State

- **Working branch: `claude/redesign-visual-elements-blxj78`** — all redesign
  work goes here. Never push to `main`.
- Branch was created from and is identical to `main` at commit `8e415a4`.
- `main`, `origin/main`, and the branch head were all `8e415a4` at session
  start. Verified, not assumed.
- **The design bundle was written against `8e415a4`** — i.e. exactly this
  commit. There is zero drift to reconcile. The `code/` files' imports, props
  and types match the real repo as-is.
- No redesign commits exist yet. The only uncommitted work is described under
  "Current State" below.

Rollback story (already explained to Kevin, don't re-derive): `git checkout
main` reverts everything; Vercel gives a preview URL per push so production is
never touched; per-stage commits allow partial revert.

---

## The Design Bundle

**Preserved in-repo at `docs/design/riviera-glass/`** (this session copied it
there — the original upload was session-scoped and would be lost).

```
docs/design/riviera-glass/
├── README.md                        the full spec — READ THIS FIRST
├── code/
│   ├── globals.additions.css        append to src/app/globals.css
│   ├── glass.ts                     new: src/lib/glass.ts
│   ├── Sidebar.tsx                  replaces src/components/layout/Sidebar.tsx
│   ├── WeeklyBoard.tsx              replaces src/components/calendar/WeeklyBoard.tsx
│   ├── MonthGrid.tsx                replaces the MonthGrid fn in CalendarView.tsx
│   └── ReadyReel.tsx                new: src/components/calendar/ReadyReel.tsx
├── mock/Calendar Redesign.dc.html   HTML prototype (design reference only)
└── screenshots/                     week, month, dashboard-home
```

`code/` is **paste-ready TypeScript** written against real repo types
(`@/types/database`, `@/lib/utils`). `mock/` is a **prototype, not production
code** — recreate its look using repo patterns, don't port it.

Design fidelity is **high** — the README's colours, type sizes, radii,
shadows, easings and durations are final and exact. Match them.

**Note:** `docs/**` is excluded from `tsconfig.json` and `eslint.config.mjs`
(this session added both). The reference `.tsx` files import `@/lib/glass`,
which does not exist until Stage 1 lands, so without the exclusion they break
`tsc`. Do not remove those exclusions.

---

## Key Decisions & Constraints

### Settled — do not re-litigate

| Decision | Reasoning |
|---|---|
| **Publish-status badge STAYS on the week card** | Kevin agreed explicitly. See "Findings" #1 — this is the most important one. |
| **`/home` nav link stays OUT until the route exists** | Kevin agreed explicitly. The handoff's Sidebar.tsx adds it; it would 404. |
| **Platform balance is CUT from the home page** | Kevin: "platform balance is unnecessary. I can remove that." |
| **ReadyReel is only worth building if thumbnails render** | Kevin: "super useful, but only if the thumbnails show." |
| **Token expiry display is nice-to-have, not essential** | Kevin's words. Must not ship as a hardcoded placeholder. |
| **Home page (`/home`, Stage 7) is NOT in this workstream** | Kevin is having Claude Design produce a revised spec in parallel. |
| **Steps 1–6 and the home page proceed in parallel** | They barely touch. Only shared surface is `glass.ts` + `ReadyReel`, both built in 1–6 first. |
| **No "published" celebration animation** | Design README line 65: "Explicitly not wanted." |
| **Dark mode is a non-issue** | `.dark` exists in globals.css but nothing sets the class and there is no theme toggle. Light-only glass tokens are fine. |

### Rejected / ruled out

- **Direction 1a (dark)** was rejected during design. Don't revive it.
- **The 16px striped thumbnail squares in month cells** — removed by design;
  they carried no information at that size.
- Do **not** blind-copy `mock/` files into the app.

---

## Findings from the Assessment (all verified against real code)

The design README claims "**No functionality changes.**" **That claim is wrong
in four places.** These were verified by reading the real files, not inferred.

### 1. The week card drops publish status — REGRESSION, must fix

`code/WeeklyBoard.tsx`'s `GlassPostCard` renders a **stage pill only**. The
current `src/components/calendar/PostCard.tsx` renders **both** a stage label
and `<PublishStatusBadge>`.

These are **different axes**. A post can be `stage: 'scheduled'` with
`publish_status: 'failed'`.

`src/components/ui/PublishStatusBadge.tsx` → `derivePublishState()` carries
deliberate safety logic, quoted from its own comment:

> An `ig_media_id` is the only unambiguous proof the post is live, so it
> outranks `publish_status`: the worker writes the id first and can fail to
> update the status afterwards (see publisher.ts publishFinished). Trusting
> the status alone could show "failed" for a post that is actually on
> Instagram — **the one wrong answer that might make someone publish twice.**

Given B4/B5/B6 built the auto-publish worker, a failed publish silently
vanishing from the week view is a real regression.

**Required fix:** keep the stage pill, and add `<PublishStatusBadge>` back
into the card's meta row. The row already uses `flex-wrap` + `shrink-0`, so
there is room. **Kevin has agreed to this.** Build it in from the start.

Side note: `src/components/calendar/PostCard.tsx` becomes orphaned once
`GlassPostCard` replaces it — its only consumer is `WeeklyBoard`.
(`PipelineBoard.tsx` has its own *local* `PostCard` function, unrelated.)
Decide whether to delete it or leave it; deleting is cleaner.

### 2. The "Today pane" spec doesn't match the real component — OPEN QUESTION

README §4 describes: header → 3 stat tiles → ReadyReel → agenda (max 4 rows).

The **actual** `src/components/calendar/RightPanel.tsx` is: a collapsible
**Calendars list** (props `calendars`, `onToggleCalendar`, `onEditCalendar`)
→ `<TimeGrid>`.

Implementing §4 literally would **delete per-calendar visibility toggling and
the day time-grid**. Unlike every other screen, there is **no code file** for
this — README §4 is prose only.

**This is unresolved — see Open Questions.**

### 3. Sidebar has a dead link and two fake numbers

- Adds `/home` to nav; route doesn't exist → 404. **Agreed: omit it.**
  (Note the screenshots don't show a Home item either — the code file drifted
  from the mock.)
- `IG token 41d · queue 2` is **hardcoded**, with the file's own comment
  admitting it: *"Wire to the token expiry + queue depth you already compute
  in the cron routes."* That data is server-side; surfacing it needs a new
  endpoint. **Do not ship the fake string.** Either wire it or omit the line.
- Platform counts (14 / 6 / 3) come from a new `counts` prop. The real
  `Sidebar()` takes **no props** and is rendered by a **server** layout
  (`src/app/(app)/layout.tsx`), so this is a new data path.

### 4. ReadyReel — thumbnails work, but the folder is nearly empty

**Verified empirically this session** against Kevin's real Dropbox:

- **Dropbox DOES generate thumbnails for video.** Pulled a working 640×480
  JPEG thumbnail for `Need a minute.mp4` out of the real Ready to Post folder.
  So Kevin's "only if thumbnails show" condition is **achievable**.
- **Caveat:** that came via the Dropbox MCP connector's preview endpoint, not
  the public `/2/files/get_thumbnail_v2` the app would call. This container
  has only `.env.local.example` (placeholders), so the exact endpoint was
  **not** verified. Settle this at Stage 5 with real credentials. It is a
  ~20-minute question, not a plan risk.
- **`/Social Media/Ready to Post/` contains exactly ONE file** —
  `Need a minute.mp4` (84 MB). The mock shows `READY REEL · 6 EXPORTS` and a
  solid six-face cylinder. The README's rule ("fewer than 6 items → cycle the
  list so the cylinder stays solid") would spin **the same clip six times**.
- Context: ~90 files sit in `/Social Media` proper, plus 18 in a
  `Freebird Flexseries` subfolder. The footage exists; the *staging* folder is
  one deep. So low count is a **real signal**, not a bug.
- Kevin was told this. The recommended read (not yet confirmed by him): the
  reel is a **queue-depth signal**, so the sparse state should be primary —
  1–3 real faces, no cloning to pad the cylinder.
- `DropboxFile` is currently `{name, path, size, modified}` — **no thumbnail
  field**. `src/lib/dropbox.ts` has no thumbnail fetch. Both need adding.
- `MEDIA_EXT` in `src/lib/dropbox.ts` is
  `/\.(mp4|mov|m4v|webm|jpg|jpeg|png|heic|heif)$/i` — heavily video.

### Verified as accurate (don't re-check these)

- **`WeeklyBoard` drag logic is genuinely unchanged.** `handleDragEnd` was
  diffed line by line: same column resolution, same local-reorder-vs-
  cross-column split, same optimistic update, same `onMovePost`/`onMoveIdea`
  calls. Reformatted, not rewritten.
- **`WeeklyBoard` and `MonthGrid` prop signatures are exact matches** to the
  real files. Drop-in compatible.
- **Fonts:** Playfair Display (400/600) and Inter (400/500/600) are already in
  `src/app/layout.tsx`. Only **JetBrains Mono** is new. ⚠️ The spec also wants
  **Inter 700**, which is not currently loaded — add it.
- **`/api/dropbox/ready`** exists, is session-authed, returns `{files}`.

### Two design concerns raised with Kevin (he hasn't ruled on either)

- **Month view stops fitting the viewport.** Today it's `auto-rows-fr` +
  `h-full` — fills the screen, no scroll. The spec's `min-height: 158px` × 6
  rows ≈ 950px + header, which scrolls on most laptops. Less cramped per cell,
  but loses "whole month at a glance." A genuine trade.
- **Month-view type gets very small** — 10.5px titles, 9.5px times, 9px
  overflow labels, 8.5px type-code chips. Contrast is fine (`#5d5660` on white
  ≈ 7.5:1), but at 390px wide that is small regardless of contrast. Suggested
  raising the month-view floor to ~10px on mobile.

---

## Current State

**Nothing from the redesign has been implemented.** No Stage 1–7 work exists.

Uncommitted changes in the working tree, all made this session:

| File | Change |
|---|---|
| `docs/design/riviera-glass/**` | **New.** The full design bundle, preserved from an ephemeral upload. ~2.1 MB. |
| `tsconfig.json` | Added `"docs/**"` to `exclude`. Was `["node_modules"]`. |
| `eslint.config.mjs` | Added `"docs/**"` to `globalIgnores`, with a comment. |
| `handoff-riviera-glass-2026-07-25.md` | **New.** This file. |

These are not yet committed. Commit them as a `docs:` / chore commit before
starting Stage 1, so Stage 1's diff stays clean.

---

## Environment / Setup

- **Working dir:** `/home/user/Social-Calendar`
- **Stack:** Next.js **16.2.4**, React **19.2.4**, Tailwind **v4**, Supabase,
  shadcn/ui (style `base-nova`, baseColor `neutral`, CSS-variables mode,
  `rsc: true`)
- **⚠️ `node_modules` is EMPTY.** Run `npm ci` before anything. `tsc` and
  `next build` will fail confusingly until you do.
- **⚠️ `AGENTS.md` / `CLAUDE.md` require reading `node_modules/next/dist/docs/`
  before writing code.** This Next.js has breaking changes vs. training data
  (async request APIs, `middleware` → `proxy`, Turbopack). Do this first.
- **Lint:** `npm run lint` has a **known 42-problem baseline**. Check only
  your changed files; don't chase the baseline.
- **Scripts:** `dev`, `build`, `start`, `lint`. There is **no** typecheck
  script — use `npx tsc --noEmit`.
- **Env:** only `.env.local.example` is present (placeholder values). Real
  Dropbox / Supabase / Instagram credentials are **not** in this container.
  Env var names referenced by `src/lib/dropbox.ts`: `DROPBOX_APP_KEY`,
  `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`, `DROPBOX_READY_FOLDER`
  (defaults to `/Social Media/Ready to Post`).
- **Deploy:** Vercel. Pushing the branch produces a **preview URL** — this is
  how Kevin reviews without touching production.
- **PWA:** runs as an installed PWA. Keep `env(safe-area-inset-*)` handling.

### Relevant file map

```
src/app/layout.tsx                     fonts (Playfair, Inter, Geist) + PWA
src/app/(app)/layout.tsx               Sidebar + <main>; apply app wash HERE, not body
src/app/globals.css                    164 lines; shadcn tokens ("Gleap" palette)
src/lib/glass.ts                       ← Stage 1 creates this
src/lib/dropbox.ts                     listReadyFolder(), getTemporaryLink()
src/lib/utils.ts                       cn()
src/components/layout/Sidebar.tsx      252 lines
src/components/calendar/
  ├── CalendarView.tsx                 881 lines; MonthGrid fn at ~line 655
  ├── WeeklyBoard.tsx                  359 lines; dnd-kit
  ├── PostCard.tsx                     47 lines; orphaned after Stage 3
  ├── RightPanel.tsx                   138 lines; Calendars list + TimeGrid
  ├── TimeGrid.tsx                     85 lines
  └── IdeaCard.tsx                     25 lines
src/components/ui/PublishStatusBadge.tsx   derivePublishState() — read the comments
src/app/api/dropbox/ready/route.ts     GET → {files}
```

Note: all pages are one-liners (`calendar/page.tsx` is literally
`return <CalendarView />`). **All data fetching is client-side inside the big
components.** A future `/home` gets no free data layer.

---

## The Plan — Seven Stages

Order is the design README's own (§"Order to land it") and is correct:
smallest blast radius first. **One commit per stage**, so any stage can be
reverted alone.

| # | Stage | Risk | Notes |
|---|---|---|---|
| 0 | Read `node_modules/next/dist/docs/`; `npm ci` | — | Required by AGENTS.md |
| 1 | **Tokens + fonts** | Low | Purely additive; nothing re-renders yet |
| 2 | **Sidebar** | Low | Minus `/home` link; health block wired or omitted, never faked |
| 3 | **Week view + `GlassPostCard`** | **High** | The real payoff. **With publish badge restored.** |
| 4 | **Month view** | Medium | Extract `MonthGrid` out of `CalendarView.tsx` into its own file |
| 5 | **ReadyReel** | Low | Resolve the thumbnail endpoint here; sparse state matters |
| 6 | **Today pane** | **Blocked** | Needs Kevin's answer — see Open Questions |
| 7 | ~~Dashboard home~~ | — | **Out of scope.** Claude Design is respecking it. |

**Push after Stage 2**, so Kevin gets a Vercel preview and can react to the
visual tone before the expensive Stage 3 work. Then push after 3, 4, 5.

**Verification checklist for every visual stage** (from the design README):
390×844 **and** desktop width, in **both** week and month view, with a day
holding **4+ posts** (the stacked deck) and a day holding **none**.

---

## Open Questions

1. **Today pane (Stage 6) — BLOCKING for that stage only.** Three options put
   to Kevin, no answer yet:
   - **(a) Merge** — keep the Calendars toggle list + TimeGrid, restyle in
     glass, add stat tiles above. Nothing lost, less faithful to the mock.
   - **(b) Replace** — follow §4 exactly. Loses per-calendar visibility
     toggling and the day time-grid.
   - **(c) Defer** — land 1–5 and revisit once the rest is live.

   **Recommended to Kevin: (c) then (a).** Stages 1–5 do **not** depend on
   this. Do not block on it.

2. **ReadyReel shape given a 1-file folder** — is it a queue-depth signal
   (recommended: sparse state primary, no cloning) or a media picker (needs
   wider folder scope)? Kevin hasn't confirmed.

3. **Month view scroll vs. fit** — Kevin hasn't ruled. Build to spec
   (scrolling), show him, adjust if he dislikes it.

4. **Sidebar health block** — wire real token-expiry + queue-depth (needs a
   new API endpoint), or omit the line for now? Kevin called it "nice to have
   but not essential," which points to omitting for now.

---

## Next Steps

1. `npm ci` — `node_modules` is empty.
2. Read `node_modules/next/dist/docs/` per `AGENTS.md`. Non-optional.
3. Read `docs/design/riviera-glass/README.md` in full.
4. Commit the pending docs/config changes (see "Current State") as a single
   `docs:` commit.
5. **Execute Stage 1** — full instructions below.
6. Then Stage 2, then push both and tell Kevin the preview URL is up.

---

## Stage 1 — Detailed Instructions

**Goal:** land the design-token layer. Purely additive. When Stage 1 is done
the app should look **almost unchanged** except for the background wash. If
anything else moved, something is wrong.

**Reference:** `docs/design/riviera-glass/README.md` §"Order to land it" item
1, plus the token tables above it.

### 1a. Append the glass tokens to `src/app/globals.css`

Append the contents of `docs/design/riviera-glass/code/globals.additions.css`
to the **end** of `src/app/globals.css` (currently 164 lines).

- **Keep the existing shadcn token block intact.** This is additive. The
  existing "Gleap" brand palette stays; glass tokens layer on top.
- Adds: `--glass-wash`, `--glass-panel`, `--glass-panel-soft`, `--glass-card`,
  `--glass-hairline`, the `--day-*` tints, `--ink-1/2/3`, `--shadow-*`,
  `--font-mono-num`.
- Adds keyframes `glass-fade-up`, `glass-pulse`, `glass-reel-spin`.
- Adds a `prefers-reduced-motion` block — **keep it**, all motion depends on it.
- Adds `.glass-thumb-placeholder`.
- ⚠️ The file declares `--font-mono-num: 'JetBrains Mono', …` as a raw family
  string. Once `next/font` provides a real CSS variable in 1c, make sure the
  two don't fight — prefer the `next/font` variable and let this be the
  fallback.

### 1b. Create `src/lib/glass.ts`

Copy `docs/design/riviera-glass/code/glass.ts` verbatim to `src/lib/glass.ts`.

Exports: `INK`, `GLASS`, `dayTint()`, `TODAY_BORDER`, `PLATFORM`, `STAGE`,
`STAT`, `RADIUS`, `MOTION`. All `as const`.

⚠️ `STAGE.published.label` is **`'Live'`**, not "Published" — intentional,
per README line 47. Don't "fix" it.

### 1c. Add JetBrains Mono to `src/app/layout.tsx`

```ts
import { JetBrains_Mono } from "next/font/google";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-num",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});
```

Add `${jetbrainsMono.variable}` to the `<html>` className, alongside the
existing `geistSans / geistMono / playfair / inter` variables.

**Also add weight `"700"` to the existing `Inter(...)` call** — it currently
loads `["400","500","600"]` and the spec needs 700.

### 1d. Apply the app wash

In `src/app/(app)/layout.tsx`, apply `GLASS.wash` (or `var(--glass-wash)`) to
the **app container** — the `<div className="flex h-screen overflow-hidden">`
or the `<main>`.

⚠️ **Not on `<body>`.** README §"Order to land it" item 1 is explicit. The
`<main>` currently has `bg-background`; that's what the wash replaces.

Preserve the existing `env(safe-area-inset-*)` padding and the
`pt-[calc(3.5rem+env(safe-area-inset-top))] … md:pt-0` mobile-offset logic
exactly — it's PWA notch handling and unrelated to the redesign.

### 1e. Verify

```bash
npx tsc --noEmit          # clean (docs/** is excluded)
npm run lint              # only check files you changed; 42-problem baseline
npm run dev               # visual check
```

Expected: background is now the three-radial-gradient wash over `#e7ecf0`.
Everything else looks essentially as before. Check desktop **and** 390×844.

### 1f. Commit

```
Stage 1: Riviera Glass design tokens + JetBrains Mono

Additive only — glass surface/ink/shadow tokens, motion keyframes and the
mono numeral face. No component changes yet; the app wash is the only
visible difference.
```

Do **not** push yet — push after Stage 2, so Kevin's first preview shows the
tokens and the restyled sidebar together.

---

## Notes on Working With Kevin

- He decides scope; surface trade-offs and let him choose. He has been quick
  and decisive when given a clear recommendation.
- He values honesty about what's verified vs. assumed. The Dropbox folder
  finding and the publish-badge regression both landed well because they were
  checked against reality rather than asserted.
- Don't fabricate data to make a design look right — the hardcoded
  `IG token 41d · queue 2` is exactly the kind of thing to flag, not ship.
- Push after meaningful stages so he gets Vercel previews; he reviews visually.
