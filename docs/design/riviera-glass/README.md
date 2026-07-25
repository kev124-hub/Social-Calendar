# Handoff: Social Calendar — "Riviera Glass" redesign

## Overview
A visual and motion redesign of the Mustache Journey Social Calendar (Next.js 16 / React 19 / Tailwind v4 / Supabase). **No functionality changes.** The work is: replace the flat light-grey UI with a colour-washed frosted-glass system, make dates and status legible, rebuild the month grid so a month actually tells you what's happening, and add restrained 3D depth and motion (hover lift/tilt, staggered load-in, live status pulse, a rotating "ready reel" of Dropbox exports).

Three problems drove it, stated by the product owner:
1. Cramped, visually static, "no UI/UX appeal".
2. Light fonts on light backgrounds — unreadable. **Nothing lighter than `#5d5660` for text.**
3. Month view too cramped to be useful; week-view dates hard to read; right-hand Today pane required scrolling.

## About the design files
The files in `mock/` are **design references created in HTML** — a prototype of intended look and behaviour, not production code. Recreate the design in the existing Next.js codebase using its established patterns (React client components, Tailwind v4, `cn()`, shadcn primitives, dnd-kit, date-fns, lucide icons).

The files in `code/` are different: they are **paste-ready TypeScript/React**, written against the real repo's props, types and imports (`@/types/database`, `@/lib/utils`, `@/components/ui/PlatformIcon`). They are intended to replace the named files. Read them, don't blind-copy: they were written from the repo at commit `8e415a4` and may need reconciling if the files moved on.

## Fidelity
**High-fidelity.** Colours, type sizes, radii, shadows, easings and durations below are final and exact. Match them.

---

## Design tokens

Fonts (all already loaded in `layout.tsx` except the mono):
| Role | Family | CSS var |
|---|---|---|
| Display — day numbers, headings | Playfair Display 600 | `--font-playfair` |
| UI — labels, titles, body | Inter 400/500/600/700 | `--font-inter` |
| Numerals, times, meta labels | **JetBrains Mono** 400/500/700 (add to `next/font`) | `--font-mono-num` |

Colour:
| Token | Value | Use |
|---|---|---|
| App wash | 3 radial gradients over `#e7ecf0` (see `code/globals.additions.css`) | app container background |
| `--glass-panel` | `rgba(255,255,255,.60)` | large frosted panels |
| `--glass-panel-soft` | `rgba(255,255,255,.46)` | sidebar, header |
| `--glass-card` | `rgba(255,255,255,.88)` | post cards, month rows |
| `--glass-hairline` | `rgba(255,255,255,.90)` | borders on glass |
| `--day-weekday` / border | `rgba(74,152,206,.52)` / `rgba(9,66,94,.40)` | Mon–Fri columns and cells |
| `--day-weekend` / border | `rgba(252,222,130,.62)` / `rgba(140,98,10,.42)` | Sat + Sun |
| `--day-today-border` | `rgba(20,16,20,.62)` | today = dark outline, **never its own hue** |
| `--ink-1` | `#150f19` | titles, numerals, body |
| `--ink-2` | `#241f28` | labels |
| `--ink-3` | `#5d5660` | lightest permissible text |

Platform: Instagram `#f1ccff` fill / `#7b2f9e` ink / code `IG` · TikTok `#91e0ff` / `#0b4f6c` / `TT` · LinkedIn `#ffd8a8` / `#8a4b06` / `LI`.

Stage chips (filled pills, 10px/600, radius 99, padding 2px 7px): idea `#eae4de`/`#3d3743` · scripted `#efe1f7`/`#5f2a7e` · shot `#dceefa`/`#0b4f6c` · editing `#f7ebd8`/`#7a4c07` · scheduled `#141014`/`#f7f3ef` · published→**"Live"** `#dcf2e5`/`#0d5136`.

Stat tiles: ready `rgba(196,240,214,.55)`/`#0d5136` · behind `rgba(255,205,190,.55)`/`#8a2b12` · queued `rgba(145,224,255,.50)`/`#0b4f6c`.

Radii: cards 14 · month rows 9 · panels 20 · day columns/cells 15–18 · pills 99 · controls 13.
Shadows: card `0 3px 8px rgba(63,43,80,.10)` · card hover `0 26px 42px rgba(63,43,80,.28)` · panel `0 16px 32px rgba(18,52,72,.16)`.
Blur: `backdrop-filter: blur(12–18px)` on panels only (never on cards — it costs more than it gives).

Motion (transform/opacity only; all wrapped by `prefers-reduced-motion`):
| Name | Spec |
|---|---|
| Card hover tilt | `translateY(-7px) rotateX(7deg) rotateY(-5deg) scale(1.04)`, `.30s cubic-bezier(.2,.8,.2,1)`; parent needs `perspective:1400px` |
| Small lift (stat tiles, agenda rows, nav) | `translateY(-4px)` / `translateX(3–4px)`, `.20s` |
| Load-in stagger | `glass-fade-up .55s cubic-bezier(.2,.8,.2,1) both`, delay `index × 45ms` |
| Live pulse | `glass-pulse 2.4s ease-in-out infinite` on an 8px dot |
| Progress bars | `width .9s cubic-bezier(.2,.8,.2,1)` |
| Ready reel | `glass-reel-spin 22s linear infinite`, pauses on hover |
| Drag ghost | `rotate(2deg) scale(1.03)` + hover shadow; drop `220ms` |
| **Excluded** | No "published" celebration animation. Explicitly not wanted. |

---

## Order to land it

1. **Tokens + fonts** — append `code/globals.additions.css` to `src/app/globals.css`; add `src/lib/glass.ts`; add JetBrains Mono to `layout.tsx` (`variable: '--font-mono-num'`, weights 400/500/700) and put `--font-mono-num` on `<html>`. Apply the wash to the app container in `src/app/(app)/layout.tsx`, not to `body`.
2. **Sidebar** (`code/Sidebar.tsx`) — smallest blast radius, sets the visual tone everywhere. Collapse + localStorage + mobile drawer preserved.
3. **Week view** (`code/WeeklyBoard.tsx`) — biggest daily payoff. dnd-kit logic is byte-for-byte the current behaviour; only presentation changed.
4. **Month view** (`code/MonthGrid.tsx`) — replaces the `MonthGrid` function inside `CalendarView.tsx` (or extract to its own file and import).
5. **ReadyReel** (`code/ReadyReel.tsx`) — drop into `RightPanel.tsx` above the time grid, fed by the Dropbox "Ready to Post" listing you already fetch for the post dialog.
6. **Today pane fix** — see below; small change, removes a daily annoyance.
7. **Optional: dashboard home** (`/home`) — spec below. Only if wanted; the calendar stays the real destination.

---

## Screens

### 1. App shell / Sidebar
**Purpose:** navigation, platform filters, publishing health at a glance.
**Layout:** sticky, `h-screen`, 256px expanded / 60px collapsed, `transition-[width] 200ms`. Frosted `--glass-panel-soft` + `blur(18px)`, right border hairline. Vertical stack, 22px gaps: brand → platforms → nav (flex-1) → health → settings → collapse.
- Brand: 36px `rounded-[11px]` tile, `linear-gradient(150deg,#f1ccff,#91e0ff)`, "MJ" in Playfair 14/600; title Inter 14/600 `--ink-1`, subtitle 12 `--ink-3`.
- Platform rows: `rgba(255,255,255,.62)` chip, hairline border, radius 11, 8px/9px padding; 10px colour square (`box-shadow: 0 0 0 1px rgba(20,16,20,.12)`), label 13/500, count in mono 12/600. Hover `translateX(4px)`.
- Nav: active = `rgba(255,255,255,.86)` pill, `--ink-1`, 600, ink dot; inactive = `rgba(255,255,255,.28)`, `rgba(27,20,31,.68)`, 500. Hover `translateX(3px)`. Icons 18px lucide.
- Health block: mono 10 label, pulsing `#0b4f6c` dot, "Worker live" 13/500, then token days + queue depth 12 `--ink-3`.
- Mobile: same top bar and drawer as today, surfaces swapped to `rgba(255,255,255,.72)` + blur; drawer 288px, scrim `rgba(20,16,20,.28)` + `blur(4px)`.

### 2. Calendar — week view
**Purpose:** the daily driver. See the week, see what's ready, drag to reschedule.
**Layout:** app wash background, `perspective:1400px`, 14px padding, 7 flex columns (10px gaps) — on mobile `min-w-[44vw]` + scroll-snap, today scrolled into view.
- **Column:** radius 18, `blur(12px)`, tint by weekday/weekend, border = tint border, or `--day-today-border` for today.
- **Header:** day number Playfair **30px**/600 `--ink-1` (this is the fix for "dates hard to read"); weekday mono 11 `.14em` uppercase; total-count badge right, mono 10/700 on `rgba(255,255,255,.82)` pill.
- **Ready bar:** 4px track `rgba(255,255,255,.75)`, fill `--ink-1`, `width .9s`; caption `n/m ready` mono 10 `#4a4450`.
- **Card:** radius 14, `--glass-card`, hairline border, card shadow. 58px media strip on top (real thumbnail, else striped placeholder `repeating-linear-gradient(135deg,#ded5e2 0 7px,#ece5ee 7px 14px)` with the post type in mono 9); platform dot 8px top-right with a white ring. Body: title 12.5/600 `--ink-1` `overflow-wrap:anywhere`; meta row `flex-wrap` — time mono 10/500 `--ink-3`, stage pill `ml-auto shrink-0 whitespace-nowrap` (wrapping is required, or "Scheduled" clips in a narrow column). Hover = tilt + hover shadow + card goes opaque white.
- **Stacked deck:** only 2 cards show; the rest collapse into a 3-layer stack (offsets `inset-x-6/top-8`, `inset-3/4`, front `bottom-8`) labelled `+ n more` in mono 11/600; click fans the column open, label becomes `collapse`. One column open at a time.
- **Add:** dashed `rgba(27,20,31,.32)` button, `+ post`, 11/500; hover fills white and darkens the border.
- **Drag:** pointer distance 5px; touch press-and-hold 200ms/8px (so horizontal swipe still scrolls). Drop target gets `inset 0 0 0 2px rgba(20,16,20,.45)` + `rgba(255,255,255,.28)`. Ghost is the same card at `rotate(2deg) scale(1.03)`; source card `opacity .35`.

### 3. Calendar — month view (the rebuild)
**Purpose:** answer "what's happening this month" without clicking.
**Layout:** app wash, 14px padding; header row of mono-10 `.16em` day names; `grid-template-columns: repeat(7, minmax(0,1fr))`, 8px gaps. **`minmax(0,1fr)` and `min-width:0` on cells are required** — with plain `1fr` and nowrap titles the tracks blow past the container.
- **Cell:** `min-height:158px`, radius 15, `blur(10px)`, weekday/weekend tint; outside-month `rgba(214,222,231,.30)` with `rgba(27,20,31,.34)` numerals; today `rgba(255,255,255,.88)` + dark border. Hover `translateY(-5px) scale(1.02)` + panel shadow. Click = new event (unchanged).
- **Header:** Playfair 19/600 date; item-count badge mono 9/700 `#0b3a50` on `rgba(255,255,255,.80)`.
- **Rows (max 3):** radius 9, `rgba(255,255,255,.90)`, **3px left border in the item's colour** (calendar colour for events, platform ink for posts, `#8a4b06` for ideas). Line 1: time mono 9.5/700 `#0b3a50` + type code chip (`IG`/`TT`/`LI`/`EVT`/`IDEA`) mono 8.5/700 on `rgba(126,196,231,.45)`. Line 2: title 10.5/600 `--ink-1`, `-webkit-line-clamp: 2`. Click routes as today (`/pipeline?post=`, `/ideas?idea=`, or `onEventClick`).
- **Overflow:** `+n more` mono 9/600 `#0b3a50`, derived from the actual row count — never render it on an empty day.
- **Removed:** the 16px striped thumbnail squares. They carried no information at that size.

### 4. Today pane (right panel) — fits without scrolling
Width 288px, `--glass-panel` + `blur(18px)`, left hairline. Fixed vertical budget, 14px gaps: header ("TODAY · SAT 25" mono 10 + Playfair 22 summary) → **three stat tiles** in a 3-col grid (`repeat(3,minmax(0,1fr))`, 40px mono numerals, 12/600 label, tinted per stat, hover lift) → **ReadyReel** → **agenda**, max 4 rows (time mono 11 in a 42px column, 4px colour bar, title 12/500 truncated, hover `translateX(4px)`). Anything beyond 4 rows collapses into a "+n later" row rather than making the pane scroll.
Counters ramp from 0 to target over 1100ms with cubic ease-out on mount (rAF, ~`1-(1-p)³`).

### 5. ReadyReel
Six faces, `rotateY(i*60deg) translateZ(96px)`, face 76×118, radius 10, `border 1px solid rgba(21,15,25,.40)`, `box-shadow 0 10px 20px rgba(18,52,72,.30)`; container `perspective:620px`, `transform-style:preserve-3d`, `glass-reel-spin 22s linear infinite`, `rotateX(-9deg)` tilt, pauses on hover. Faces show the Dropbox thumbnail when available, else `repeating-linear-gradient(135deg,#3f7fa8 0 6px,#e5edf3 6px 12px)`. Panel: `linear-gradient(160deg, rgba(214,164,240,.60), rgba(104,180,220,.55))`, radius 17, hairline border, mono-10 caption `READY REEL · n EXPORTS`, footer 12 `#2b2530`. Fewer than 6 items → cycle the list so the cylinder stays solid; empty → a single line of copy, no cylinder. `onPick` should open the post dialog with that file preselected.

### 6. Pipeline board (styling only, same six stages)
Columns as **depth planes**: container `perspective:1500px; perspective-origin:50% 40%`, column `translateZ` stepping `-90px → +10px` across idea→published, hover `translateZ(70px)`, `.35s cubic-bezier(.2,.8,.2,1)`. Column surface `rgba(255,255,255,.42)` (later stages `.78`), hairline border (later stages `rgba(20,16,20,.50)`), radius 16. Cards: 30×38 thumbnail, title 11.5/600, meta mono 9.5 `--ink-3`, hover `translateY(-4px) scale(1.02)`.

### 7. Optional — dashboard home `/home`
Header: mono-11 date, Playfair 28 greeting, three quick-action tiles (label 13/600 + mono 9.5 hint, hover lift): New post / Capture idea / Paste an event.
Row 1 grid `minmax(0,1.55fr) minmax(0,1fr)`: **next-publish hero** (132px media, pulsing dot + `NEXT PUBLISH · in 3h 41m` mono 10 `#0b3a50`, Playfair 30 title, caption 13.5, pills for time / platform / publish mode (`#141014` fill for auto), Dropbox path in mono 9.5 truncated at the bottom) + the three stat tiles.
Row 2: **this week** — seven tinted chips, Playfair 24 date, mono weekday, count badge, 5px ready bar; hover `translateY(-5px) rotateX(6deg) scale(1.03)`; "OPEN CALENDAR →" link top-right.
Row 3 grid `1.15fr 1fr .8fr`: **pipeline load** (label 12/600 in a 76px column, 14px track, fill `linear-gradient(90deg,#4a98ce,#7ec4e7)`, count mono 11/700), **platform balance** (tinted card per platform with % bar and an uppercase note: on pace / light this week / underfed), **ReadyReel**.
Data: next post = earliest `social_posts` with `stage='scheduled'` and future `scheduled_at`; ready = scheduled+published this week; behind = past-due not published; queued = `publish_status in ('pending','processing')`.

---

## State
Only two new pieces of client state; everything else already exists.
- `WeeklyBoard`: `expanded: string | null` — dateKey of the fanned-out column deck.
- Today pane / dashboard: `{ready, behind, queued}` animated counters (rAF ramp, 1100ms).
- `ReadyReel`: `paused: boolean` on hover. Dropbox items come from the existing listing endpoint.

## Responsive
Desktop ≥1024: sidebar + calendar + 288px Today pane. 768–1023: Today pane hidden (as today). <768: mobile top bar + drawer; week columns `44vw` scroll-snap; month cells keep 158px and scroll vertically; dashboard stacks to one column. Keep the `env(safe-area-inset-*)` handling — this runs as an installed PWA.

## Accessibility
Every text/background pair here is ≥4.5:1 (`--ink-3` on the lightest glass is the floor). Keep the tilt on hover only, never on focus-visible; focus rings stay on the shadcn default. All motion is inside the `prefers-reduced-motion` block in `globals.additions.css`.

## Assets
None. All imagery is either a real Dropbox/Supabase thumbnail or a CSS striped placeholder. Icons stay lucide-react. Fonts are Google Fonts via `next/font`.

## Files in this bundle
```
code/globals.additions.css   append to src/app/globals.css
code/glass.ts                new: src/lib/glass.ts
code/Sidebar.tsx             replaces src/components/layout/Sidebar.tsx
code/WeeklyBoard.tsx         replaces src/components/calendar/WeeklyBoard.tsx
code/MonthGrid.tsx           replaces the MonthGrid function in src/components/calendar/CalendarView.tsx
code/ReadyReel.tsx           new: src/components/calendar/ReadyReel.tsx
mock/Calendar Redesign.dc.html   the HTML prototype (design reference)
mock/ios-frame.jsx, mock/support.js   runtime files the prototype needs
screenshots/2a-calendar-week.png     week view, desktop (1422px)
screenshots/2a-calendar-month.png    month view, desktop
screenshots/3a-dashboard-home.png    dashboard home, desktop
```

The screenshots are DOM re-renders: the pipeline depth planes at the bottom of
the calendar shots render with overlap/clipping artifacts that do **not** occur
in a browser (verified — no element actually clips). Open the prototype for the
real thing, and for anything involving hover, drag or the rotating reel.
Open the prototype in a browser: option **2a** is the calendar (week + month, toggle in its header), **3a** is the dashboard home, **1a/1b** are the two earlier directions kept for context — 1a (dark) was rejected.

## Notes for whoever implements this
- `AGENTS.md` in the repo requires reading `node_modules/next/dist/docs/` first — this is Next.js 16 (async request APIs, `middleware` → `proxy`, Turbopack).
- Don't touch `src/lib/publisher.ts`, `notifier.ts`, `ig-token.ts` or the cron routes. This is presentation work.
- `npm run lint` has a known 42-problem baseline; check only your changed files.
- Verify at 390×844 and at desktop width, in both week and month view, with a day holding 4+ posts (the deck) and a day holding none.
