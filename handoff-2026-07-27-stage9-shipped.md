# Session Handoff — Phase B and Stage 9 shipped

**Written 27 July 2026, early hours.** `/home` Phase B and Stage 9 (two-way
Google Calendar sync) are built, merged and in production. This file exists so a
session with no memory of the previous one can pick up without re-deriving
anything — and, more importantly, without re-learning the three bugs that only
showed up on a real phone.

## ⚠️ Read first — which document governs what

| File | Governs |
|---|---|
| **This file** | Current state, open work, and the traps. Start here. |
| `HANDOFF.md` (repo root) | **Backend / publishing** (B0–B7, Instagram auto-publish, cron). Untouched by this workstream. **Do not touch** `src/lib/publisher.ts`, `notifier.ts`, `ig-token.ts`, or the cron routes. |
| `handoff-riviera-glass-2026-07-26-consolidated.md` | Redesign state and the settled-decisions table. Still current for the design system. |
| `docs/design/home/riviera-glass-home-plan.md` | The `/home` plan. **Phases A and B are done.** Phase C (ReadyReel) is the only part left, and is hard-gated — see below. Its "⚠️ Corrections" banner still governs where it contradicts the body. |
| `AGENTS.md` / `CLAUDE.md` | **Next.js 16.2.4 — read `node_modules/next/dist/docs/` before writing code.** Non-negotiable project rule. |

`handoff-home-phase-b-2026-07-26.md` **was deleted in this commit.** Phase B is
built, so it was fully superseded — and it carried two facts that were actively
wrong and cost real time this session (see "Traps" 1 and 2). It is in git
history if provenance is ever needed.

---

## Current state

**`main` is at `63cd9ea`.** No open PRs. Merged this session: **#35** (Phase B),
**#36** (Stage 9 + three timezone fixes).

### What shipped

- **`src/lib/events.ts`** — the single choke point for every app-side write to
  `calendar_events`. All four write paths go through it. Stage 9 now pushes to
  Google from inside it. **Keep it that way**; the done-check below is the guard.
- **`/home` Phase B** — events block (`AIEventInput` + manual `EventDialog` +
  upcoming list + inline confirmation), three quick-action tiles, `/home` nav
  entry. Row 3 is the `1.35fr / 1fr` grid at `lg`.
- **Stage 9** — app events push to the **primary** Google calendar on create,
  follow edits, and are deleted from Google on delete.
  `/api/google-calendar/push` does the work (the browser cannot: Google tokens
  are service-role only). `sweepUnpushedEvents` catches anything a failed push
  left behind, on the next sync.
- **Three timezone/diagnostic fixes** — see "Bugs fixed" below. Two were
  pre-existing production bugs unrelated to Stage 9.

### Baselines — re-measure, do not inherit

- **Lint: 36 problems (16 errors, 20 warnings).** Changed this session (was 37;
  one `no-explicit-any` went away). Three documents have historically carried a
  wrong number. **Run `npm run lint` yourself.**
- `npx tsc --noEmit` clean. `npm run build` compiles in ~8s.
- `npm test` — 76 checks, no dependencies. **Run it under a non-UTC `TZ`** (see
  `tests/README.md`); several of these bugs are invisible at UTC+0.

---

## Open work, in the order it matters

### 1. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are not set for Preview

Vercel scopes environment variables per environment. Both are present in
Production and absent from Preview, so preview deployments send Google the
literal string `"undefined"` and get `401: invalid_client`.

Preview *appears* to work when production has recently refreshed the shared
access token, because previews read the same `user_integrations` row and
`getValidAccessToken` only reaches for the client credentials when the token is
within 5 minutes of expiry. That window closes roughly hourly.

**Fix:** add both for Preview in Vercel → Settings → Environment Variables, then
redeploy. **No Google Cloud changes are needed** — previews share production's
token and never run their own OAuth flow, so no redirect URI needs registering.

### 2. Rows already stored wrong are not repaired

None of the fixes touch existing data.

- Any event or scheduled post **edited through a dialog** on a non-UTC device is
  off by that device's UTC offset, **once per save** (it compounded).
- Any event created by AI paste **may** be off, if the model happened to append a
  `Z` that run. Intermittent by nature.

Kevin knows of at least one bad event (created 7:30pm, now stored 11:30pm).
Scheduled posts matter most — a shifted `scheduled_at` is a mis-timed publish.
Worth a scan for anything at an implausible hour.

### 3. Events have no timezone — undecided

`starts_at` is a `timestamptz`, an absolute instant, so an event reads
differently as you travel. Kevin means *"2:30pm wall clock"*; Google stores a
timezone per event so 2:30pm stays 2:30pm. Matching that is a schema change
(`time_zone` column, plus every read/write path). **Flagged, not scoped, not
ruled on.**

### 4. Touch is still unverified

CDP touch events reach the page but do not drive Chromium's compositor, so
nothing in this container can test tap. Phase A shipped two tap bugs past a
clean desktop pass. Unverified on a phone: the three quick-action tiles,
`manual +`, the AI sparkle button, and whether anything sticks in a hover state
after a tap.

### 5. Phase C is still hard-gated

ReadyReel remains blocked on verifying Dropbox `/2/files/get_thumbnail_v2` with
real credentials. **Do not take that dependency.**

### Smaller, open

- The upcoming-events list caps at 5 with **no `+n more` link**, unlike
  `NeedsAttention`. Deliberate (the nav has `/calendar` now); easy to add.
- An app-created event edited **in Google** does not come back. The app owns what
  it created. Full bidirectional conflict resolution was not attempted.
- The 24h window on failed posts, and `/home`'s 12s abort not being applied to
  `CalendarView` / `PipelineBoard` — both flagged twice, never ruled on.

---

## Bugs fixed this session — and why they hid

All three were found by Kevin on a phone. **None were findable in this
container**, and understanding why matters more than the fixes.

1. **AI-parsed times shifted by the user's UTC offset.** The parse prompt asked
   for "ISO 8601" and only *illustrated* the naive form, so the model was free to
   append a `Z`. `new Date()` then read a wall-clock reading as an absolute
   instant. Everything downstream was correct on a value that was already wrong,
   and both views agreed with each other. Now stripped client-side in
   `stripTimeZone` — a guarantee, not a request to the model.

2. **Edit dialogs shifted times on every save.** `starts_at` / `scheduled_at`
   arrive as UTC; `<input type="datetime-local">` is local by definition. Both
   dialogs prefilled with `iso.slice(0, 16)`, and saving read it back as local.
   **No edit was required** — opening the dialog and pressing Save was enough,
   and it compounded. Now `src/lib/datetime-local.ts`, shared so a third copy
   can't appear.

3. **A dropped connection reported as a definitive failure.** postgrest-js retries
   network failures only for `GET`/`HEAD`/`OPTIONS` and never for writes, so a
   flaky connection gives a page that loads perfectly and then refuses to save.
   The write's outcome is genuinely *unknown* in that case — the request may have
   committed before the response was lost — so the message now says so rather
   than inviting a duplicate.

---

## Traps — every one cost real time

1. **A branch preview URL outlives its branch.** The old handoff listed
   `…git-clau-2bbe7c…` as *"Preview (per branch, stable)"*. That branch merged
   and was deleted months of work ago; Vercel still serves its **last build
   forever**. It looks like a working app that is silently versions behind. An
   hour went into "the buttons have disappeared" before the truncated URL in a
   screenshot gave it away. **Always confirm the full preview URL matches the
   branch you are testing.** The URL slug is derived from the branch name.

2. **This container is UTC, so timezone bugs are structurally invisible here.**
   At UTC+0, `iso.slice(0, 16)` on a UTC timestamp is *accidentally correct*.
   Two production bugs survived exactly because every previous test ran at
   offset zero. **Run anything date-related under a non-UTC `TZ`.**

3. **`process.env.X!` is a compile-time assertion and does nothing at runtime.**
   With the variable unset it sends the literal string `"undefined"` downstream.
   That produced `401: invalid_client` **on Google's own domain**, which reads
   like the app's registration is broken rather than like a missing setting.
   Guard config explicitly; never rely on `!`.

4. **An inline style beats a Tailwind class, including `hover:`.** Cost time
   eight times now. If a value has any variant — breakpoint or state — it must
   be a class.

5. **Tailwind v4 compiles translate utilities to the CSS `translate` property,
   not `transform`.** A hover audit probing `transform` reports every lift as
   dead.

6. **Screenshots cannot verify hover or touch.** Drive hover with Playwright's
   `.hover()` and compare computed styles. Say plainly what is untested.

7. **`prefers-reduced-motion` in CSS cannot reach a `requestAnimationFrame`
   loop.** Any JS animation needs its own `window.matchMedia(...)` guard.

8. **A bare `grid` sizes its auto column to min-content** — and `truncate` has a
   min-content of the *entire* untruncated string. Give single-column grids an
   explicit `[grid-template-columns:minmax(0,1fr)]`. `min-w-0` does not help.

9. **`h-dvh`, never `h-screen`.** `select-none` breaks dragging on iOS outright.

10. **A responsive breakpoint is not verified until the boundary is** — test the
    widths either side of the switch.

11. **Grid children stretch by default.** Row 3's "All clear" panel became a
    340px empty box next to the taller events panel. `items-start` where panels
    should size to content.

---

## The write choke point — do not let this rot

`src/lib/events.ts` is the one file Stage 9 patches, and the reason Stage 9 was
a single-file change. Every app-side write to `calendar_events` must go through
it. Verify with:

```bash
rg -U -l "from\('calendar_events'\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(" src/
```

Must list **exactly two** files: `src/lib/events.ts` and
`src/lib/google-calendar.ts` (the pull-side `upsert`, deliberately out of scope).
Anything else means a write path escaped.

Two traps this command exists to avoid: a plain grep also matches **reads**
(there are legitimate ones in `CalendarView` and `HomeView`), so a *correct*
codebase looks broken; and a single-line grep matches **nothing** when `.from()`
and the write are on separate lines, so it passes while verifying nothing.
Hence `rg -U`.

---

## Verification technique

**No Supabase credentials in this container**, so real screens need a temporary
harness:

1. Temp route outside the `(app)` group, e.g. `src/app/home-preview/page.tsx`,
   rendering components with mock props.
2. Temp exemption in `src/proxy.ts`'s `isPublicPath`.
3. `.env.local` with stubs (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9/stub`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY=stub-anon-key`).
4. `npm run dev`, drive with Playwright.
5. **Remove all three before committing.** Verify: `git status` clean,
   `grep -c 'TEMP harness' src/proxy.ts` → 0, `git diff src/proxy.ts` empty.

Gotchas:
- Use `http://localhost:3000`, **not** `127.0.0.1` — Next blocks cross-origin dev
  resources and hydration fails silently.
- Playwright is not a project dependency — import from
  `/opt/node22/lib/node_modules/playwright/index.js`, which is **CommonJS**:
  `import pw from '...'; const { chromium } = pw`. Named imports fail.
  Chromium at `/opt/pw-browsers/chromium`. **Never run `playwright install`.**
- Hide the dev overlay:
  `page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })`.
- `[role=alert]` also matches Next's route announcer. Scope your selectors.
- Do **not** `pkill -f "next dev"` — it matches the calling shell. Use a
  background task and stop it by id.
- A stub Supabase host **hangs** rather than failing.
- `page.route()` can stub `/api/claude/parse-event`, which lets the whole AI
  create flow be driven end to end without an API key.
- Elements behind a modal overlay can't be clicked; use
  `page.evaluate(() => document.getElementById('x').click())`.

**Unit-testing library code without any framework** — the technique that found
two of this session's three bugs, and now `npm test`:

```bash
node --experimental-strip-types tests/events.test.mjs
```

Node 22 strips TypeScript in place, so a `.ts` module whose imports are all
type-only can be imported directly with no bundler and no config. `events.ts`,
`google-calendar.ts` and `datetime-local.ts` all qualify. Stub `globalThis.fetch`
to exercise the Google push paths. **Set `TZ` explicitly** — see trap 2.

**Touch cannot be tested here.** Every touch bug this project has seen was found
by Kevin on a real phone. Say plainly what is unverified.

---

## Environment

- Next.js **16.2.4**, React 19.2.4, Tailwind **v4** (4.2.4), TypeScript.
- **No `cacheComponents`** → the bundled docs' `unstable_instant` guidance does
  **not** apply. Every page is a `'use client'` component fetching client-side.
- `(app)/layout.tsx` sets `force-dynamic` and owns the glass wash + `h-dvh`
  shell. **Do not put a background on the page root.**
- **No edits to `globals.css` or `src/lib/glass.ts`** — every token and keyframe
  already exists.
- `createBrowserClient` from `@supabase/ssr` is a **singleton in the browser**.
  Calling `createClient()` repeatedly is free; it is the same client everywhere.
- Sync is **manual only** — no cron. Only `publish-posts` and
  `send-notifications` are scheduled.
- The preview **writes to the real production Supabase**. A test event created
  there is a real row.

---

## Settled — do not re-litigate

- **12-hour times (`h:mm a`) everywhere.**
- **Week view is a content board, permanently** — posts and ideas only.
- **Token-expiry display is cut.** Publish health is problems-only.
  `PublishHealth.tsx` stays unused — do not delete, do not wire.
- **Pipeline load / stage counts cut.**
- **`/` keeps redirecting to `/calendar`.** `/home` is a nav entry.
- **Branch + preview only, no feature flag.** `git revert <sha>` is the rollback.
- **Platform `'any'` renders neutral grey `ANY`**, never Instagram purple.
- **No "published" celebration animation. Dark mode is a non-issue.**
- **App-created events go to the primary Google calendar.** Chosen over a
  dedicated calendar and over a settings picker.
- **A failed Google push never fails the local write.** Save, warn, sweep later.

---

## Working with Kevin

- He decides scope. Surface trade-offs **with a recommendation**; he answers
  fast. **Don't over-ask** — he will tell you to just decide.
- **He often asks you to merge.** When he says "merge it", mark the PR ready and
  merge it yourself. Open PRs as drafts and otherwise leave the draft state
  alone until he says. *(The previous handoff said he merges via GitHub himself;
  that was wrong and cost a round trip.)*
- He values honesty about verified vs assumed. "I could not test touch in this
  container" lands better than a confident claim.
- **Don't fabricate data to make a design look right** — flag it instead.
- He reviews on his phone (Chrome on iOS) and reports precisely. Screenshots
  from him have found every bug that mattered. **Ask for the full URL** — a
  truncated one hid the answer for an hour this session.
- **His phone's timezone is set manually**, deliberately, and does not follow
  where he is. Don't assume a device zone tracks reality.
- Push after each meaningful chunk so he gets a preview.
- When a theory of a bug is wrong, say so plainly and re-diagnose. He corrected
  one bad theory this session and it was the fastest path to the real cause.

---

## Next steps

1. `git fetch origin main && git checkout -B <branch> origin/main`
2. `npm ci`, then `npm run lint` and `npm test` to confirm the baselines
   yourself. Run the tests under a non-UTC `TZ`.
3. Run the done-check before touching `calendar_events` anywhere.
4. Read the relevant guide under `node_modules/next/dist/docs/` — project rule.
5. Pick from "Open work" above. Items 1 and 2 are Kevin's to action, not code
   changes.
