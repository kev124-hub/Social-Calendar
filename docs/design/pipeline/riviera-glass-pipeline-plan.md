# Plan: Riviera Glass restyle of the Content Pipeline board

> Hand-off plan for the implementing session (Riviera Glass workstream).
> Written 2026-07-26 from an independent review of the v2 design bundle and the
> repo state on `main` (post Stage 1–2). Everything below was verified against
> the actual code — nothing needs re-deriving.

## Context (read first)

- **Why this exists:** The design README's §6 ("Pipeline board — styling only,
  same six stages") has **no code file in the bundle** and **no stage in the
  current 7-stage plan** — it fell through the cracks. This plan fills that
  gap. Treat it as its own stage with its own commit.
- **Exactly one file changes:** `src/components/pipeline/PipelineBoard.tsx`
  (393 lines). Do **not** touch `globals.css`, `glass.ts`, or any shared file —
  every token and keyframe this plan needs already exists on `main` from
  Stage 1.
- **Prerequisites already verified on `main`:**
  - `src/lib/glass.ts` exists and matches the bundle (exports `INK`, `GLASS`,
    `STAGE`, `PLATFORM`, `MOTION`).
  - `--font-mono-num` (JetBrains Mono) is on `<html>` via `src/app/layout.tsx`.
  - Keyframe `glass-fade-up` and class `.glass-thumb-placeholder` are in
    `globals.css`.
  - The glass wash is painted by `src/app/(app)/layout.tsx` on the app
    container. **Therefore: do NOT add a background to the pipeline root — the
    wash already shows through.** (Adding it again would restart the gradient
    origin mid-page.)
- **Functionality is untouched.** This is presentation-only. The full
  must-not-change list is in section 6.

## 1. Source spec values

From README §6 plus the mock's pipeline markup (extracted from
`mock/Calendar Redesign.dc.html`, the `PIPE` data block and the §2a pipeline
strip — the README is silent on surface values, the mock supplies them):

### Depth planes (kanban columns)

| Property | Value |
|---|---|
| Container | `perspective: 1500px; perspective-origin: 50% 40%`, flex, `gap: 14px` (mock uses 18px in a cramped strip; 14px matches the app's panel gap rhythm — either is acceptable, pick 14) |
| Column translateZ | stepped across idea→published: `-90, -70, -50, -30, -10, +10` px (README's "-90px → +10px"; the mock's smaller -45→+5 values were for a compressed footer strip — use the README's) |
| Column hover | `translateZ(70px)`, transition `.35s cubic-bezier(.2,.8,.2,1)` |
| Column surface, stages 1–4 (idea…editing) | `background: rgba(255,255,255,.42)`, `border: 1px solid rgba(255,255,255,.70)` |
| Column surface, stages 5–6 (scheduled, published) | `background: rgba(255,255,255,.78)`, `border: 1px solid rgba(20,16,20,.50)` |
| Column chrome | radius 16, `backdrop-filter: blur(12px)`, padding 10px, internal gap 8px, `box-shadow: 0 16px 28px rgba(63,43,80,.16)` |
| Column header | stage name 12px/700 `INK.primary`; count right-aligned, mono 11px/600 `INK.tertiary`; keep the existing `+` (new post in stage) button, colored `INK.tertiary`, hover `INK.primary` |

### Kanban card

| Property | Value |
|---|---|
| Container | radius 12, `background: var(--glass-card)` (.88 — the mock's .86 loses to the README token table, which is declared exact), `border: 1px solid var(--glass-hairline)`, `box-shadow: var(--shadow-card)` |
| Hover | `translateY(-4px) scale(1.02)`, `box-shadow: 0 14px 22px rgba(63,43,80,.2)`, transition ~.25s |
| Thumbnail | 30×38, radius 7, `shrink-0`; `<img src={post.media_url}>` object-cover when present, else `.glass-thumb-placeholder` (same pattern as the week's `GlassPostCard`) |
| Title | 11.5px/600, `INK.primary`, line-height 1.3, `line-clamp-2` |
| Meta line | mono (`var(--font-mono-num)`) 9.5px — platform code in the platform's ink color at 600, then `· Jul 24` (or post type, or `no date`) in `INK.tertiary` |
| Load-in | wrap card in a div with `animation: glass-fade-up .55s cubic-bezier(.2,.8,.2,1) both`, `animation-delay: Math.min(index, 8) * 45ms` (cap the stagger — columns can hold dozens of cards) |

**Blur discipline:** blur the **6 column panels only**. Never put
`backdrop-filter` on cards. (This is the design's own rule and the month-view
perf lesson.)

## 2. Responsive strategy — depth planes are desktop-only

This is the one place the mock can't be copied naively: the mock's pipeline is
a 6-column strip that fits its container; the real kanban is `w-64` columns in
`overflow-x-auto`. Perspective + horizontal scrolling produces skew that
changes as you scroll, and looks broken.

- **`lg` and up:** columns become `flex-1 min-w-0` so all six fit the viewport
  with no horizontal scroll; the wrapper gets the perspective; each column
  plane gets its translateZ and hover-Z.
- **Below `lg`:** keep today's behavior exactly — `w-64` fixed columns,
  `overflow-x-auto`, **no perspective, no translateZ, no hover-Z** (flat glass
  columns). Cards keep their hover lift (harmless) but it's hover-gated anyway
  (see §3).

## 3. Implementation technique (Tailwind v4 specifics — follow these, they encode the review fixes)

1. **All hover effects are CSS classes, never `onMouseEnter`/`onMouseLeave`
   style mutation.** Tailwind v4's `hover:` variant is automatically gated
   behind `@media (hover: hover)`, which fixes the sticky-hover-on-iOS-tap
   problem for free. The bundle's week-view code uses JS mouse handlers — do
   not copy that pattern here.
2. **Column plane transform via CSS var + arbitrary property**, so the hover
   override works in pure CSS:

   ```tsx
   <div
     style={{ '--plane-z': `${PLANE_Z[i]}px` } as React.CSSProperties}
     className="transition-transform duration-[350ms] ease-[cubic-bezier(.2,.8,.2,1)]
                lg:[transform:translateZ(var(--plane-z))]
                lg:hover:[transform:translateZ(70px)]
                w-64 lg:w-auto lg:flex-1 lg:min-w-0"
   >
   ```

   with `PLANE_Z = [-90, -70, -50, -30, -10, 10]` indexed by stage order, and
   the wrapper container:

   ```tsx
   className="flex gap-[14px] p-[18px] h-full min-w-max lg:min-w-0
              lg:[perspective:1500px] lg:[perspective-origin:50%_40%]"
   ```

3. **Card hover uses `hover:-translate-y-1 hover:scale-[1.02]` utilities**, not
   `hover:[transform:…]`. In Tailwind v4, `translate`/`scale` are separate CSS
   properties, so they compose with (and don't clobber) the `glass-fade-up`
   keyframe's `transform` — but keep the entry animation on the **wrapper div**
   and the hover on the **card** anyway, mirroring `GlassPostCard`'s structure.
4. **Arbitrary shadows** need underscores:
   `hover:shadow-[0_14px_22px_rgba(63,43,80,.2)]`.
5. **Mono face:** `style={{ fontFamily: 'var(--font-mono-num)' }}` (matches how
   Stage 2's sidebar does it).

## 4. Component-by-component changes

### 4a. Constants (top of file)

- Replace the `STAGES` array's `color`/`dot` fields (dead after restyle) with
  nothing — keep `{ key, label }` only. Column labels stay
  `Idea / Scripted / Shot / Editing / Scheduled / Published` (chips say "Live";
  the **column** stays "Published", and the Move: buttons stay "Published" —
  clearer as an action target).
- Replace `PLATFORM_CONFIG` with a glass-token version **including the neutral
  `'any'` fallback** (review finding: the bundle silently renders `'any'` as
  Instagram — don't repeat that):

  ```ts
  import { GLASS, INK, STAGE, PLATFORM } from '@/lib/glass'

  const PF: Record<Platform, { code: string; ink: string; fill: string }> = {
    instagram: { code: 'IG',  ink: PLATFORM.instagram.ink, fill: PLATFORM.instagram.fill },
    tiktok:    { code: 'TT',  ink: PLATFORM.tiktok.ink,    fill: PLATFORM.tiktok.fill },
    linkedin:  { code: 'LI',  ink: PLATFORM.linkedin.ink,  fill: PLATFORM.linkedin.fill },
    any:       { code: 'ANY', ink: '#3d3743',              fill: '#e5e1e6' }, // neutral, never IG purple
  }
  ```

- Keep `POST_TYPE_LABELS` as-is.

### 4b. Header (inside `PipelineBoard`)

Keep all logic (filter state, view mode state, New Post). Restyle only:

- Header bar: `bg-[rgba(255,255,255,.46)] backdrop-blur-[14px]`, bottom border
  `var(--glass-hairline)`. Title keeps `font-heading text-2xl` but
  `color: INK.primary`.
- Platform filter + view toggle become glass segmented controls (mock's
  `viewsC` treatment): container
  `rounded-[13px] p-[3px] bg-[rgba(255,255,255,.50)] border border-[rgba(255,255,255,.9)]`;
  each button `rounded-[10px] px-3 py-1.5 text-xs font-semibold
  transition-colors`; active = `bg-[rgba(255,255,255,.92)]` + `INK.primary`;
  inactive = transparent + `rgba(27,20,31,.6)`, `hover:text-[#150f19]`.
- `New Post` stays the shadcn `Button` (its dark fill matches the `#141014`
  "Scheduled" chip family). No change.

### 4c. `KanbanView`

- Outer wrapper stays `flex-1 overflow-x-auto` (needed below `lg`; harmless
  above).
- Inner container + column plane wrapper per §3 item 2.
- Inside the plane wrapper, the column itself:
  `flex flex-col h-full rounded-[16px] p-[10px] gap-2 backdrop-blur-[12px]
  shadow-[0_16px_28px_rgba(63,43,80,.16)]` with per-stage `background`/`border`
  from §1 (compute `const elevated = index > 3`).
- Column header per §1 table. The card list keeps `flex-1 overflow-y-auto` +
  `space-y-2`.

### 4d. Kanban `PostCard` — restyle, preserve every behavior

New layout, top to bottom:

1. **Header row** (`flex gap-2`): 30×38 thumb (§1) + `min-w-0 flex-1` column
   holding title (11.5/600, clamp-2) and meta line (mono 9.5:
   `<span style={{color: pf.ink, fontWeight: 600}}>{pf.code}</span> ·
   {post.scheduled_at ? format(parseISO(post.scheduled_at),'MMM d') :
   POST_TYPE_LABELS[post.post_type] ?? 'no date'}` in `INK.tertiary`).
2. **Caption** (if present): keep it — `line-clamp-2`, 10.5px, `INK.tertiary`.
   (Spec says "styling only"; dropping the caption would remove information.)
3. **Status row**: `<PublishStatusBadge post={post} />` + the existing
   `ig_permalink` / `media_url` `ExternalLink` anchors, **unchanged including
   `stopPropagation`**. Permalink icon color can move to `#7b2f9e` (glass IG
   ink) from the old `#8b3fb0`.
4. **`publish_error` line**: keep exactly, recolor to `#8a2b12` (glass error
   ink), 11px, clamp-2. This is the "why it didn't go out" safety feature — do
   not drop it.
5. **Move: row**: keep the full mechanism (`stopPropagation` on the row, one
   button per other stage). Restyle: top border `rgba(21,15,25,.08)`, label +
   buttons 10px, `INK.tertiary`, `hover:text-[#150f19] hover:underline`.

Card container + hover per §1/§3. Wrap in the stagger div (`index` = position
within the column, delay capped at 8).

### 4e. `GridView` / `GridSection` / `GridCard`

- Section titles: Playfair (`font-heading`) 19px/600 `INK.primary`; count in
  mono 11 `INK.tertiary`. "Overdue" title color → `#8a2b12` (replaces
  `text-destructive`).
- `GridCard`: `rounded-[14px]`, `background: var(--glass-card)`, hairline
  border, `shadow-card`, hover `-translate-y-1 scale-[1.02]` + hover shadow
  (same classes as the kanban card). **No backdrop blur.**
- Thumbnail area: keep the aspect-square block and the `media_url`
  external-link overlay behavior exactly. Replace the emoji placeholder with
  `.glass-thumb-placeholder` plus the post type (or platform code) in mono 10
  `INK.tertiary` — matches the week card's placeholder language.
- Top-right stage **dot** becomes a stage **pill** using `STAGE[post.stage]`
  tokens (9px/600, filled, radius 99) — this is where "Live" (not "Published")
  appears, consistent with the week view. Keep `PublishStatusBadge` top-left
  unchanged.
- Bottom row: platform code mono 9.5 in `pf.ink` + date/type mono 9.5
  `INK.tertiary` (replaces the old colored chip).

## 5. Explicit decisions already made (don't re-open)

- **Time/date format:** kanban/grid cards show `MMM d` today — keep that. If a
  time is ever shown, use whatever format Kevin ruled for week/month (the 12h
  vs 24h question from the review) — consistency beats the mock.
- **`'any'` platform** renders neutral grey `ANY`, never Instagram purple.
- **No drag-and-drop added.** The board's stage moves stay button-based
  (`Move:` row). dnd is out of scope for this stage.
- **No `/home`, no fake data, no new endpoints** — same rules as Stages 1–2.
- **Card background** = `--glass-card` (.88), overriding the mock's .86.

## 6. Must-not-change checklist (verify each survives)

1. `?post=<id>` deep link auto-opens the dialog once (`openedFromUrl` ref
   logic).
2. Platform filter (`all/instagram/tiktok/linkedin`) filters both views.
3. Kanban ⇄ Grid view toggle.
4. `openNew(stage)` from each column's `+`, and header New Post.
5. `moveStage` optimistic update + Supabase write.
6. `PublishStatusBadge` on both card types; `derivePublishState`-gated
   `publish_error` line on kanban cards.
7. `ig_permalink` / `media_url` external links with `stopPropagation`.
8. `handleDelete` / `handleSave` → `PostDialog` wiring untouched.
9. Grid grouping logic (Overdue / This Week / Upcoming / In Progress /
   Published) untouched.

## 7. Verification

```bash
npx tsc --noEmit         # must stay clean
npm run lint             # check ONLY this file; 42-problem baseline exists elsewhere
npm run dev
```

Visual passes:

- **Desktop ≥1024:** six planes visible without horizontal scroll; idea column
  sits visibly "deeper" than published; hovering a column pulls it forward
  smoothly; hovering a card lifts it without the column jumping.
- **~1024 boundary:** resize across `lg` — layout flips between planes and flat
  scroll without artifacts.
- **390×844:** flat columns, horizontal scroll works, tapping a card opens the
  dialog and the card does **not** stay stuck in a hover state afterward.
- **Data states:** a column with 10+ cards scrolls internally; an empty column
  renders; a `failed` post shows badge + error line; a `stage='published'`
  post shows the "Live" pill in grid view; an `'any'`-platform post shows grey
  `ANY`.
- Grid view: all five sections render styled; Overdue heading is red-brown.

## 8. Commit

One commit, matching the existing stage convention:

```
Stage N: Riviera Glass pipeline board

Depth-plane kanban per design README §6 — six glass columns stepped
translateZ(-90 → +10px), elevated surfaces for scheduled/published, glass
cards with 30×38 thumbs, restyled grid view. Presentation only: stage
moves, publish badges, error lines, deep links and filters unchanged.
Planes are lg+ only; below lg the board keeps flat horizontally-scrolling
columns. All hover via CSS (hover-gated), no backdrop blur on cards.
```

---

## Appendix: notes for the product owner (not the implementing session)

1. This plan touches one file no other stage touches, so there is zero
   shared-file conflict risk with Stages 1–6.
2. §6 of the design README never mentions the pipeline's **grid view** or
   **header**; sections 4b/4e above are an extrapolation of the glass system
   onto them — flagged so the session knows it's interpretation, not designer
   intent. The kanban is the mandatory part; the grid/header can land in the
   same commit or be trimmed.
