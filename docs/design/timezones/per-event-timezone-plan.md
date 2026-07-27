# Per-event timezones — plan

**Status: proposed, not started.** Written 27 July 2026.

Ruled on by Kevin, 27 July — **do not re-litigate these:**

- **Per-event timezones** (option 3), not a single home timezone (option 2).
- **Existing rows are left alone.** No backfill; `time_zone` stays null and
  those rows keep behaving exactly as they do today.
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

**Ruled: no backfill.** Existing rows keep a null zone and go on behaving
exactly as they do today, gaining a zone only when one is next edited. There is
no record of where any existing row was created, so a backfill would be a guess
applied to every historical event at once — the same class of harm as the drift
being cleaned up, and harder to notice because it would look deliberate.

The practical consequence to keep in mind while converting views: **null is a
permanent state, not a migration window.** Rows from before this work will still
be null in a year, so the device-zone fallback is a supported path forever and
must be treated as such — not as a stopgap that can quietly stop being tested.

---

## Staging

Each step ships and is verifiable on its own. No step leaves the app in a state
where an event can move.

1. **Migration + capture, no behaviour change.** Add `time_zone`, populate it on
   every write from the device zone, keep rendering exactly as now. Completely
   inert — the column is written and ignored. Verifiable by inspecting rows.
2. **A single render helper**, used nowhere yet: `formatInZone(iso, zone, fmt)`
   falling back to the device zone when `zone` is null, plus `offsetLabel(iso,
   zone)` for the `GMT+2` marker. Unit-tested hard, under several `TZ` values,
   before anything depends on it.
3. **Convert the render sites, one view at a time** — day, then list, then
   month, then week, then `/home`, then the dialog. Bucketing sites (above) get
   converted with their view, never separately, or an event renders one day and
   files under another. The zone marker goes in with each view, since it is the
   same call site and splitting it would mean touching every row twice.
4. **The zone picker in `EventDialog`.** Deliberately after step 3: until the
   views honour a zone, a control that sets one would let you pick a value with
   no visible effect — and an event whose stored zone and displayed time
   disagree is precisely the bug class this whole exercise exists to remove.
5. **Google sync both directions** — send `timeZone` on push, keep it on pull,
   and fix the all-day `T00:00:00Z` mapping.

Steps 1 and 2 are safe in any order and change nothing observable. The first
step a user can see is 3.

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
