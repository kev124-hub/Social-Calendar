# Per-event timezones — plan

**Status: complete. All five steps shipped.** Written 27 July 2026.

Events read in their own zone, with a `GMT+2` marker when that differs from the
device. The zone is editable, it round-trips through Google, and three all-day
off-by-ones are gone — one this plan predicted and two it did not.

**Migration 008 has been applied** (confirmed by Kevin, 27 July). Earlier notes
here and in commit messages said it was hand-applied and unverified; that is no
longer true and the caveat is withdrawn.

| Step | State |
|---|---|
| 1. Migration + capture on every write path | shipped (#39); migration 008 applied |
| 2. The render helper, `src/lib/zoned-time.ts` | shipped |
| 3. Convert the render sites, view by view | shipped — the first visible change; fixed **two** all-day off-by-ones, see below |
| 4. The zone picker in `EventDialog` | shipped — searchable, recents first; see the ruling on what a zone change does |
| 5. Send `timeZone` on the push | shipped — and fixed a third all-day off-by-one on the way out |

Ruled on by Kevin, 27 July — **do not re-litigate these:**

- **Per-event timezones** (option 3), not a single home timezone (option 2).
- **No backfill.** Existing rows keep a null zone and behave exactly as they do
  today. In practice this is close to a non-issue: Kevin's events are all
  Google-sourced, and the pull re-reads them, so recording `start.timeZone`
  populates them on the next sync without anyone guessing anything.
- **`social_posts.scheduled_at` stays an absolute instant.** Only
  `calendar_events` gains a zone.

---

## The decision, and why option 2 was dropped

`starts_at` is a `timestamptz` — an absolute instant, stored as UTC and
rendered in whatever zone the device is set to. So an event created as "dinner
8pm" in New York reads as 2:00 AM once the phone is set to Paris. Nothing is
corrupted: 8pm in New York genuinely *is* 2am in Paris. But the intent was a
**wall clock** — "dinner at 8, wherever I am" — and a wall clock is not what a
`timestamptz` can hold.

Three options were put up. Option 1 (do nothing) was rejected outright: Kevin
is in a different timezone 200+ days a year, so this is the normal case, not an
edge.

**Option 2 — one "home timezone" setting — was rejected on inspection.** It
renders everything in a chosen zone regardless of device, which stops times
jumping. But it makes the app *pretend you are always at home*: standing in
Monaco, typing "dinner 8pm" would record 8pm New York — 2am Monaco. The app
stays self-consistent because it always displays 8pm, but what it pushes to
Google, and what any invitee sees, is 2am. For 200 travel days that is not a
curiosity, it is most of the year.

It was also initially recommended as "a fraction of the risk", which was wrong.
The expensive part of both options is identical: every site that renders a date
must stop using the device zone. Option 2 points those at a setting, option 3
at `event.time_zone`. The work unique to option 3 — a migration, capturing the
zone on write, a fallback for existing rows — is small beside the render-path
change they share. Option 2 buys very little and costs nearly the same.

## Guarantee: this work never modifies an event in Google

Asked for as an absolute, so it is stated as one, with the verification behind
it rather than an assurance.

**There are exactly three code paths in this app that mutate a Google
calendar.** (`getValidAccessToken`'s `POST` is the OAuth token endpoint, not a
calendar write.)

| Path | Method | Guard |
|---|---|---|
| `pushEventToGoogle` | `PATCH` / `POST` | `if (event.source !== 'app') throw` — google-sourced rows are refused outright |
| `sweepUnpushedEvents` | via the above | doubly guarded: the query filters `.eq('source','app')`, and the push would throw anyway |
| `deleteEventFromGoogle` | `DELETE` | **none** — see below |

Every step in this plan is therefore safe by construction:

- Steps 1–4 write only to **our** database. The pull is a read from Google.
- Step 5 adds a `timeZone` field to the body `pushEventToGoogle` already sends,
  on a path that already refuses anything not `source: 'app'`. It cannot reach a
  Google-sourced event, because that function returns before building a body.
  **Shipped as described** — a field on an existing body, no new request and no
  new HTTP verb, both asserted in `google.test.mjs`.

**Constraint on step 5, binding:** the `source !== 'app'` guard is what makes
this true. It must not be relaxed, and no new push path may be added that skips
it. If step 5 ever needs to touch a google-sourced row, that is a different
change requiring its own ruling.

### What *will* change, so it is not mistaken for a regression

- **How the app displays Google events.** That is the entire feature. A Monaco
  event currently reads in your device's zone; afterwards it reads in its own,
  with a `GMT+2` marker when they differ. The event in Google is untouched — the
  app simply stops mis-stating it.
- **The stored `starts_at` of all-day Google rows**, when step 3 replaces the
  `T00:00:00Z` mapping. This rewrites a row in **our** database, not in Google,
  and the value is re-derived from Google's `start.date` on every sync — so
  Google stays authoritative and nothing is destroyed. A wrong result here is
  recoverable by syncing again.

### One pre-existing path this plan does not touch

`deleteEventFromGoogle` has **no source guard**. It takes an `external_id`, and
`deleteEvent()` reads that off whatever row is being deleted — including a
google-sourced one. So **deleting a synced event inside this app also deletes it
from Google.**

That is existing behaviour, it predates this work, and it is arguably correct:
deleting an event in any Google client deletes it everywhere. But it is the one
way this app can destroy something in a Google calendar, and it deserves to be
written down rather than discovered.

Worth knowing alongside it: making `/home`'s event rows open the edit dialog
(#38) put a Delete button on a second surface. The behaviour is unchanged; the
number of places it can be reached from went from one to two.

If that should be guarded — deletions staying local for synced events — it is a
small change, and a separate decision from this plan.

## The model

Store both:

| Column | Meaning |
|---|---|
| `starts_at` (`timestamptz`) | the instant, unchanged — keeps ordering, range queries and the publish path working |
| `time_zone` (`text`, IANA) | the zone the wall clock was meant in |

Render `starts_at` **in `time_zone`**, not in the device zone. The instant and
the zone together reconstruct the wall clock exactly, and the instant on its own
still answers "is this before that". Nothing about the existing queries changes.

This is what Google does, which is why Google events do not wander and app
events do.

## Choosing the zone — it is picked, not only detected

**Raised by Kevin, and a hole in the first draft of this plan.** That draft
captured `Intl.DateTimeFormat().resolvedOptions().timeZone` on write and stopped
there. Detection is a sound *default* and a bad *only option*: it is correct
when you create an event where you are standing, and wrong for the case that
matters most here — sitting in New York in October arranging a Monaco dinner for
May. The device says `America/New_York`. The event is in `Europe/Monaco`.

So the zone is an editable field, defaulted rather than derived:

- **`EventDialog` gets a zone control**, next to the date and time inputs and
  above `location`. Defaults to the device zone for a new event; shows the
  event's own zone when editing.
- **A null zone displays as "device zone"** and is only written when the field
  is actually touched — so existing rows stay null per the ruling above, and
  opening a dialog to look at something does not silently stamp a zone on it.
  This matters: the drift bug that started all of this was caused by a dialog
  writing something nobody typed.
- **AI-parsed events take the device zone**, and the `/home` confirmation line
  names it when it differs from the device — the same line that already names
  the destination calendar. The model is *not* asked to infer a zone from the
  text. It already proved it will guess a weekday wrong and move an event a day;
  handing it "Monaco → Europe/Monaco" invites the same failure in a field where
  the error is silent.

**Store IANA names (`Europe/Monaco`), never fixed offsets.** An offset is not a
zone: New York is GMT-5 in January and GMT-4 in July. Storing `GMT-4` would be
correct until the clocks changed and then quietly wrong for half the year.

Picker usability is a real question — there are ~600 IANA zones and this is used
on a phone. Suggested: a short list of recently-used zones plus a search field,
not a 600-row `<select>`. Worth deciding when we get to it rather than now.

`location` stays free text for humans. Deriving a zone from it would need
geocoding and a network dependency, and would be wrong for "the Hotel de Paris"
as often as it was right.

## Showing the zone

**Raised by Kevin: will events show which zone they are in?**

Yes, but **only when it differs from the device's current zone.** Marking every
event when almost all of them are local is noise, and noise is how a genuinely
important marker gets ignored. When they differ, the difference is the whole
point.

- **Compact rows** (month chip, `/home` upcoming, list view): append a short
  offset — `8:00 PM GMT+2`. Unambiguous without knowing that CEST is a thing.
- **Detail surfaces** (day view, the dialog): show both readings, because when
  they differ the second one is the question you actually have — `8:00 PM GMT+2
  · 2:00 PM your time`.

**Compute the offset from the event's own instant, not from today.** The offset
for a zone is a function of the date: an event in New York reads GMT-5 in
January and GMT-4 in July. Formatting "now" and reusing it would be right for
about half the year, which is the most annoying kind of wrong.

`Intl.DateTimeFormat` does all of this natively via `timeZoneName: 'shortOffset'`
— no library, and it accounts for DST on the formatted date.

## A note on all-day events

An all-day event is arguably a *date*, not an instant, and the tidiest model
would store it in a `date` column with no zone at all — which is what Google
does. This plan keeps it as `timestamptz` + zone to avoid a second column type
and a second migration in the same change.

The consequence: an all-day event still has a zone, used only to decide which
local day it falls on. That is enough to fix the bug below, and the date-column
question is a reasonable follow-up rather than a blocker.

---

## A live bug this fixes on the way

The Google pull maps an all-day event as:

```ts
starts_at: e.start?.dateTime ?? (e.start?.date ? e.start.date + 'T00:00:00Z' : null)
```

`T00:00:00Z` is **UTC** midnight. The app's own all-day writes use **local**
midnight (`createEventFromParsed`). So the same calendar day is stored two
different ways depending on where the row came from, and:

| Device zone | Google all-day event on 1 Aug renders as |
|---|---|
| Europe/Monaco | Sat 1 Aug ✓ |
| America/New_York | **Fri 31 Jul** ✗ |
| America/Los_Angeles | **Fri 31 Jul** ✗ |

Every all-day event pulled from Google shows a day early anywhere west of
Greenwich. It is invisible in Europe, which is likely why it has survived.

`scripts/scan-drifted-times.mjs` already flags these as CERTAIN — an all-day row
not sitting at local midnight — so the scan will light up with them before this
work starts. **That is expected and is not the dialog drift.** Do not confuse
the two when triaging.

---

## Blast radius

Everything below currently derives a wall clock from `starts_at` using the
device zone. Each must take the event's zone instead.

### Rendering a time

| File | What it does |
|---|---|
| `components/calendar/MonthGrid.tsx:96` | `h:mm a` per event chip |
| `components/calendar/CalendarView.tsx:695-696` | day view start–end range |
| `components/calendar/CalendarView.tsx:785` | list view time |
| `components/home/EventsPanel.tsx:37,50` | `/home` upcoming row time and date |
| `components/calendar/EventDialog.tsx:73-74` | prefilling the edit inputs |

### Deciding which day a row belongs to — the dangerous ones

Bucketing is where a wrong zone moves an event to another day rather than just
mislabelling it.

| File | What it does |
|---|---|
| `lib/calendar-utils.ts:12-13` | `eventCoversDay` — `startOfDay(parseISO(...))` |
| `components/calendar/CalendarView.tsx:745` | list grouping key, `yyyy-MM-dd` |
| `components/calendar/RightPanel.tsx:33` | `format(new Date(...), 'yyyy-MM-dd')` |
| `components/calendar/TimeGrid.tsx:30,60-62` | `.getHours()` for vertical position |

`TimeGrid` is the subtlest: it positions events by hour, so a zone error slides
an event up or down the grid rather than off it, which looks like a layout bug
rather than a data one.

### Writing

| File | What it does |
|---|---|
| `lib/events.ts` | `createEvent` / `updateEvent` / `createEventFromParsed` must capture the zone |
| `components/calendar/EventDialog.tsx:110-111` | `starts.toISOString()` from a local-parsed input |

### Google sync

| File | What it does |
|---|---|
| `lib/google-calendar.ts:224-229` | push sends `dateTime` with **no** `timeZone` — Google falls back to the calendar's default |
| `lib/google-calendar.ts:413-414` | pull **discards** `e.start.timeZone`, which Google sends |

Sync gets *simpler*, not harder: the data already exists on both sides and is
currently being thrown away.

---

## Existing rows

`time_zone` is nullable. A null means "we do not know", and the renderer falls
back to the device zone — i.e. exactly today's behaviour. So the migration is
inert on existing data and nothing shifts on deploy.

**Ruled: no backfill — and Kevin's follow-up makes it close to a non-issue.**

He has created no real events in the app; his calendar lives in Google, so
essentially every row is `source: 'google'`. That changes the character of the
problem completely. The earlier framing — "there is no record of where any
existing row was created, so a backfill would be a guess" — is true only of
app-created rows. **For a Google row the record exists, in Google**, and the
pull re-reads it:

- the pull `upsert`s on `external_id`, so a re-sync overwrites the mapped fields
  of rows that already exist;
- therefore, once the pull records `start.timeZone`, **a sync populates the zone
  for every Google event by itself.** No backfill script, no guessing, and the
  authoritative answer comes from the system that has always known it.

Two caveats, neither fatal:

1. **The sync window is `now − 30d` to `now + 90d`.** Events outside it are not
   re-read, so a race weekend booked eight months out keeps a null zone until it
   drifts into the window — and then fixes itself. Until then it falls back to
   the device zone, which is exactly today's behaviour, so nothing regresses. A
   one-off widened sync would close the gap sooner if it ever matters.
2. **Google does not guarantee `start.timeZone` on every event.** When it is
   absent, fall back to the calendar's own `timeZone`, which
   `listGoogleCalendars` already returns in the calendarList entry and which we
   currently discard. Only if both are missing does the row stay null.

So the only rows genuinely needing a human answer are app-created ones, and
there are none worth keeping. **The ruling stands, but the reason is now "the
data repairs itself from Google" rather than "we accept permanently null rows".**

Still true, and still the constraint on step 3: **null is a permanent state, not
a migration window.** Rows outside the sync window, rows on calendars later
disconnected, and any future app-created event before its zone is set will all
be null. The device-zone fallback is a supported path forever and must stay
tested — not treated as a stopgap that can quietly stop being exercised.

---

## Staging

Each step ships and is verifiable on its own. No step leaves the app in a state
where an event can move.

1. **Migration + capture on every write path, no behaviour change.** Add
   `time_zone`; populate it from the device zone on app-side writes **and from
   `start.timeZone` on the Google pull** (falling back to the calendar's zone).
   Keep rendering exactly as now. Completely inert — the column is written and
   ignored — and verifiable by inspecting rows.

   **The pull belongs here rather than at the end.** Kevin's real events are
   all Google-sourced, so the pull is what puts a zone on essentially every row
   he has. Left until last, steps 2–4 would be built and shipped against data
   that is uniformly null, and the feature would appear to do nothing until the
   final step. Populating first means each later step is visible on real data
   the moment it lands.
2. **A single render helper**, used nowhere yet: `formatInZone(iso, zone, fmt)`
   falling back to the device zone when `zone` is null, plus `offsetLabel(iso,
   zone)` for the `GMT+2` marker. Unit-tested hard, under several `TZ` values,
   before anything depends on it.

   **Shipped as `src/lib/zoned-time.ts`.** It also exports `partsInZone`, which
   is what the bucketing sites in the blast radius actually need — deciding
   which day a row falls on, or where it sits on an hour grid, is a question
   about numbers rather than a formatted string — and `deviceTimeZone`, moved
   here from `events.ts` so the write side capturing a zone and the read side
   falling back to one cannot drift apart.

   Two things were settled while building it, both worth knowing before step 3:

   - **It is built on `Intl`, not on a shifted `Date`.** The usual trick for
     formatting in another zone is to read the target zone's wall-clock fields
     and rebuild a `Date` from them. That loses an hour, silently, whenever the
     reconstructed wall clock does not exist in the *device's* zone — a Monaco
     2:30 AM event on a New York phone on a US spring-forward morning. The test
     for this reports what the discarded approach would have printed, so the
     reason the code looks indirect stays legible.
   - **An unsupported pattern token throws.** The token table covers what this
     app formats instants with; anything else fails at the first render rather
     than emitting a plausible wrong string. Adding a token is two lines.

   The helper is byte-identical to date-fns whenever the event's zone is the
   device's, which is what makes step 3 safe to land one view at a time: for a
   row whose zone matches the device, converting a call site is a visible no-op,
   so anything that *does* move on screen is a row that was genuinely being
   mis-stated before.
3. **Convert the render sites, one view at a time** — day, then list, then
   month, then week, then `/home`, then the dialog. Bucketing sites (above) get
   converted with their view, never separately, or an event renders one day and
   files under another. The zone marker goes in with each view, since it is the
   same call site and splitting it would mean touching every row twice.

   **Shipped.** Converted: `eventCoversDay`, the day view, the list view and its
   grouping key, the month chip, `TimeGrid`'s vertical position, `RightPanel`'s
   day filter, `/home`'s upcoming rows, and the dialog. The week board needed no
   change — it renders posts and ideas only, never events.

   Presentation follows the ruling above: compact rows get `8:00 PM GMT+2`,
   detail surfaces get `8:00 PM GMT+2 · 2:00 PM your time`, and a local event
   reads exactly as it did before.

   **The dialog's write path had to move with its read path.** Prefilling the
   inputs in the event's zone while still reading them back as device-local
   would have turned every open-and-save of a foreign-zone event into a silent
   move — the exact bug this workstream began with, reintroduced from the other
   direction. Both now use the event's zone, and a test walks 72 zoned events
   through prefill-then-save to prove the instant is unchanged. The dialog also
   names the zone it is editing in, because otherwise the fields are actively
   misleading; making it *editable* is step 4.

   **A second all-day off-by-one turned up here, which this plan had not
   found.** Google's all-day `end.date` is exclusive — the push has always known
   this and adds a day — but the pull copied it across and appended `23:59:59`.
   A one-day event came back spanning **three**: 24 May began at 02:00 Monaco on
   the 24th and ended at 01:59 on the 26th. Unlike the UTC-midnight bug this one
   was visible in Europe too, so it is not the same bug wearing a different hat.
   Both are fixed, and `push → pull` is now byte-identical, span included.

   **The drift scan had to be re-aimed, not left alone.** It flags an all-day row
   that is not at local midnight as CERTAIN. Now that such a row sits at midnight
   in *its own* zone, reading every row in a single `--tz` would have reported a
   five-hour drift on every correctly-synced Monaco event — as CERTAIN, the one
   verdict there that is meant to be beyond doubt. It now prefers the row's own
   zone, falling back to `--tz` for posts and unzoned rows.

   **The all-day `T00:00:00Z` fix lands here, not in step 1.** It is tempting to
   treat it as an independent bug fix, but it cannot be corrected by storage
   alone: an all-day Monaco event stored at midnight *in its own zone* still
   renders a day early when a New York device formats it. Only rendering it in
   its own zone fixes it, so the mapping change and the view change have to
   arrive together or the bug simply moves.
4. **The zone picker in `EventDialog`.** Deliberately after step 3: until the
   views honour a zone, a control that sets one would let you pick a value with
   no visible effect — and an event whose stored zone and displayed time
   disagree is precisely the bug class this whole exercise exists to remove.

   **Shipped.** `ZonePicker`, above `location` as planned. The usability question
   this plan deferred — "~600 IANA zones and this is used on a phone" — is
   answered as suggested: a search field with recently-used zones kept at the top,
   never a 418-row `<select>`. Each row shows the event's own time in that zone
   alongside the offset, because an offset alone still leaves you doing
   arithmetic. Ordering and matching live in `src/lib/zone-list.ts` so they are
   testable rather than a screenshot.

   **Ruled while building, and not covered by this plan: changing an event's zone
   keeps the entered wall clock and moves the instant.** Typing 8pm in New York
   for a Monaco dinner and then setting the zone to Monaco gives 8pm *Monaco* —
   the motivating case in the section above. The alternative, holding the instant
   and letting the display change, would turn that same act into "you typed 8pm,
   we stored 2am", which is what option 2 was rejected for doing.

   **`zoneTouched` is the safety mechanism**, and it is the no-backfill ruling
   made mechanical: an untouched dialog sends no `time_zone` at all, so a null row
   stays null and looking at an event cannot pin it to wherever it was read. A
   zone written by accident would be the original drift bug with a quieter
   symptom.

   Two things found while implementing, both fixed:

   - **`Intl.supportedValuesOf('timeZone')` contains no `UTC`** — 418 canonical
     names and no `Etc/*` entry of any kind — while `Intl.DateTimeFormat` accepts
     `UTC` happily. Left alone, the one zone a technical user reaches for first
     would have been unpickable. It is added by hand.
   - **Google returns legacy aliases** (`US/Eastern`, `Asia/Calcutta`) that every
     engine resolves but the canonical list omits. Validity is therefore tested by
     what `Intl` accepts, not by membership of that list, or an event's own zone
     would have had no row to check.

   **The `/home` confirmation line needed no change.** This plan says an
   AI-parsed event takes the device zone and the confirmation should name it "when
   it differs from the device" — which cannot happen: `createEvent` stamps the
   device zone, so for an AI-parsed event the two are the same by construction.
   Recorded rather than silently skipped.
5. **The push side** — send `timeZone` with `dateTime` so an app-created event
   reaches Google as a wall clock rather than inheriting the target calendar's
   default zone.

   **Shipped.** `dateTime` already fixed the instant, so this adds information
   rather than reinterpreting anything: the instant is byte-identical before and
   after, and a row with no zone sends no `timeZone` key at all — Google then
   applies the calendar's own, which is the previous behaviour. Sending the
   *pusher's* device zone instead would assert something we do not know.

   **A third all-day off-by-one, and the one closest to doing real damage.** The
   push derived its all-day `date` from the **caller's** zone —
   `localDate(starts_at, timeZone)`, where `timeZone` is the pushing browser's.
   Since step 3 an all-day row sits at midnight in *its own* zone, so the two
   disagree whenever the event is not local: a 1 August Monaco event pushed from
   New York went **to Google** as 31 July, and as a two-day span.
   
   Worse than the other two, because the pull's mistakes were confined to our
   own database and self-repaired on the next sync, whereas this one wrote a
   wrong date into Google. It is also reachable without anyone touching the zone
   picker: create the event in Monaco, lose the wifi, and `sweepUnpushedEvents`
   retries it later from wherever you are by then. Now derived in the event's own
   zone, and pinned by a test that pushes the same event from five zones and
   requires one answer.

   **The binding constraint is now enforced rather than merely stated.** This plan
   makes it absolute that the work never modifies an event in Google, resting on
   the `source !== 'app'` guard, and says no new push path may skip it. Nothing
   checked that but attention. `google.test.mjs` now carries a structural
   tripwire — the guard must be present, the sweep's `source` filter must be
   present, and the count of calendar-mutating requests must stay at three. It
   does not prove a new path would be guarded; it refuses to let one be added
   without someone re-reading the guarantee.

Steps 1 and 2 change nothing observable. The first step a user can see is 3.

## Testing

The existing `tests/` harness applies: no framework, `node --experimental-strip-types`,
run under a non-UTC `TZ`. Add to it —

- `formatInZone` across zones either side of Greenwich, both DST transitions,
  and the year boundary
- the all-day invariant: a row written all-day must render as its own date in
  its own zone, and **must not** move when the device zone changes
- the property that matters most: **the same row rendered under three different
  device zones must produce the same wall clock**, which is the whole point and
  is exactly what no current test asserts
- Google round-trip: push → pull → the wall clock is unchanged
- the offset label is computed from the **event's** date, so the same New York
  event reads GMT-5 in January and GMT-4 in July — a label formatted from "now"
  passes in one season and fails in the other
- the marker appears only when the zones differ, and disappears when the device
  moves into the event's zone

Every one of these is invisible at UTC. See `tests/README.md`.

## Settled — a scheduled post is not an event

**Ruled: `social_posts.scheduled_at` stays an absolute instant.** The two cases
genuinely differ. For an event the intent is a wall clock — "dinner at 8,
wherever I am". For a Reel it is a moment — "publish at 9am Eastern, for the
audience", which does not become 9am Singapore because that is where the phone
happened to be when it was scheduled.

So `calendar_events` gains `time_zone` and `social_posts` does not, and the
publish worker and notifier stay out of scope entirely.

Two consequences worth stating, because the asymmetry will look like an
oversight to anyone reading later:

- The two tables deliberately use **different time models**. A future change
  that "makes them consistent" would be undoing this ruling, not tidying up.
- `scan-drifted-times.mjs` still checks posts, and should. They were subject to
  the same dialog drift — that bug moved the stored instant, which is wrong
  under either model.
