// Stage 9: proves the Google payload conversion, especially all-day dates.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { toGoogleEvent } = await import('../src/lib/google-calendar.ts')
const { formatInZone } = await import('../src/lib/zoned-time.ts')
const { isUtcPlaceholder } = await import('../src/lib/google-calendar.ts')

let pass = 0
const ok = (n) => { pass++; console.log(`  ✓ ${n}`) }

// `time_zone: null` by default on purpose: the assertions below it were written
// before the column existed, and a null keeps them testing the fallback path —
// the caller's zone — which is exactly the behaviour that had to survive step 5.
const ev = (o) => ({ id: 'evt-1', title: 'T', description: null, location: null, ends_at: null, all_day: false, time_zone: null, external_id: null, source: 'app', ...o })

console.log('\nall-day dates survive the timezone round trip:')
// An all-day event is stored as LOCAL midnight converted to UTC. For a user
// east of UTC that instant falls on the PREVIOUS calendar day in UTC, which is
// exactly the off-by-one this must not have.
for (const [zone, localMidnightUTC, expected] of [
  ['Europe/Monaco',    '2026-05-23T22:00:00.000Z', '2026-05-24'], // UTC+2
  ['Europe/London',    '2026-05-23T23:00:00.000Z', '2026-05-24'], // UTC+1 (BST)
  ['UTC',              '2026-05-24T00:00:00.000Z', '2026-05-24'],
  ['America/New_York', '2026-05-24T04:00:00.000Z', '2026-05-24'], // UTC-4
  ['Asia/Tokyo',       '2026-05-23T15:00:00.000Z', '2026-05-24'], // UTC+9
  ['Pacific/Auckland', '2026-05-23T12:00:00.000Z', '2026-05-24'], // UTC+12
]) {
  const g = toGoogleEvent(ev({ all_day: true, starts_at: localMidnightUTC }), zone)
  assert.equal(g.start.date, expected, `${zone} start`)
  ok(`${zone}: ${localMidnightUTC} -> ${g.start.date}`)
}

console.log('\nGoogle’s exclusive all-day end:')
{
  // Single-day: our ends_at is that day 23:59 local; Google wants the NEXT day.
  const g = toGoogleEvent(ev({ all_day: true, starts_at: '2026-05-23T22:00:00.000Z', ends_at: '2026-05-24T21:59:59.000Z' }), 'Europe/Monaco')
  assert.equal(g.start.date, '2026-05-24')
  assert.equal(g.end.date, '2026-05-25', 'single-day end must be start+1')
  ok('single-day 24 May -> start 2026-05-24, end 2026-05-25 (exclusive)')
}
{
  // Multi-day 13-14 June.
  const g = toGoogleEvent(ev({ all_day: true, starts_at: '2026-06-12T22:00:00.000Z', ends_at: '2026-06-14T21:59:59.000Z' }), 'Europe/Monaco')
  assert.equal(g.start.date, '2026-06-13')
  assert.equal(g.end.date, '2026-06-15')
  ok('multi-day 13-14 Jun -> start 2026-06-13, end 2026-06-15')
}
{
  // No end at all: must still produce a valid single day, not undefined.
  const g = toGoogleEvent(ev({ all_day: true, starts_at: '2026-05-23T22:00:00.000Z' }), 'Europe/Monaco')
  assert.equal(g.end.date, '2026-05-25')
  ok('all-day with null ends_at still yields an exclusive end')
}
{
  // Month and year boundaries are where naive +1 arithmetic breaks.
  const g = toGoogleEvent(ev({ all_day: true, starts_at: '2026-12-30T23:00:00.000Z', ends_at: '2026-12-31T22:59:59.000Z' }), 'Europe/Monaco')
  assert.equal(g.start.date, '2026-12-31')
  assert.equal(g.end.date, '2027-01-01', 'must roll the year')
  ok('31 Dec -> end rolls to 2027-01-01')
}
{
  const g = toGoogleEvent(ev({ all_day: true, starts_at: '2028-02-28T23:00:00.000Z', ends_at: '2028-02-29T22:59:59.000Z' }), 'Europe/Monaco')
  assert.equal(g.start.date, '2028-02-29')
  assert.equal(g.end.date, '2028-03-01', 'leap day must roll to March')
  ok('29 Feb 2028 (leap) -> end rolls to 2028-03-01')
}

console.log('\ntimed events:')
{
  const g = toGoogleEvent(ev({ starts_at: '2026-08-03T17:30:00.000Z', ends_at: '2026-08-03T20:00:00.000Z' }), 'Europe/Monaco')
  assert.equal(g.start.dateTime, '2026-08-03T17:30:00.000Z')
  assert.equal(g.end.dateTime, '2026-08-03T20:00:00.000Z')
  assert.ok(!('date' in g.start), 'timed events must not send a bare date')
  ok('timed event keeps its exact instants')
}
{
  // Google rejects an event with no end; we must invent one rather than fail.
  const g = toGoogleEvent(ev({ starts_at: '2026-08-03T17:30:00.000Z' }), 'UTC')
  assert.equal(g.end.dateTime, '2026-08-03T18:30:00.000Z')
  ok('timed event with no end gets a nominal hour, not undefined')
}

console.log('\nthe echo tag:')
{
  const g = toGoogleEvent(ev({ id: 'abc-123', starts_at: '2026-08-03T17:30:00.000Z' }), 'UTC')
  assert.equal(g.extendedProperties.private.socialCalendarEventId, 'abc-123')
  ok('every pushed event carries its app id, so the pull can skip it')
}
{
  // Optional fields must be omitted, not sent as null — Google 400s on null.
  const g = toGoogleEvent(ev({ starts_at: '2026-08-03T17:30:00.000Z' }), 'UTC')
  assert.equal(g.description, undefined)
  assert.equal(g.location, undefined)
  ok('null description/location are omitted rather than sent as null')
}

console.log(`\n${pass} checks passed.\n`)

// ── the pull must skip what the push sent ───────────────────────────────
const { isAppPushedEvent, toGoogleEvent: tge } = await import('../src/lib/google-calendar.ts')
console.log('echo filter (pull skips our own pushes):')
let p2 = 0
const ok2 = (n) => { p2++; console.log(`  ✓ ${n}`) }

// Round trip: what toGoogleEvent produces must be recognised on the way back.
const pushed = tge(ev({ id: 'round-trip', starts_at: '2026-08-03T17:30:00.000Z' }), 'UTC')
assert.equal(isAppPushedEvent(pushed), true)
ok2('an event we just built for Google is recognised as ours — round trip holds')

for (const [name, e, expected] of [
  ['a genuine Google event', { id: 'g1', summary: 'Dentist' }, false],
  ['extendedProperties present but empty', { extendedProperties: {} }, false],
  ['private present but empty', { extendedProperties: { private: {} } }, false],
  ['a different private key', { extendedProperties: { private: { other: 'x' } } }, false],
  ['our tag', { extendedProperties: { private: { socialCalendarEventId: 'abc' } } }, true],
  ['our tag alongside others', { extendedProperties: { private: { other: 'x', socialCalendarEventId: 'abc' } } }, true],
]) {
  assert.equal(isAppPushedEvent(e), expected, name)
  ok2(`${name} -> ${expected ? 'skipped by the pull' : 'imported normally'}`)
}

// ── the pull's row mapping, incl. per-event timezone (step 1) ───────────
// Extracted from syncGoogleCalendar so it can be tested at all. It decides what
// day an event lands on, and had no coverage before.
const { toAppEventRow } = await import('../src/lib/google-calendar.ts')
console.log('\ntoAppEventRow — zone capture from Google:')
{
  const withZone = toAppEventRow(
    { id: 'g1', summary: 'Dinner', start: { dateTime: '2026-08-01T20:00:00+02:00', timeZone: 'Europe/Monaco' }, end: { dateTime: '2026-08-01T22:00:00+02:00' } },
    'cal-1', 'America/New_York')
  assert.equal(withZone.time_zone, 'Europe/Monaco')
  ok2("the event's own zone wins over the calendar's")

  const noZone = toAppEventRow(
    { id: 'g2', summary: 'Recce', start: { date: '2026-08-01' }, end: { date: '2026-08-02' } },
    'cal-1', 'Europe/Monaco')
  assert.equal(noZone.time_zone, 'Europe/Monaco')
  ok2('an all-day event carries no zone, so the calendar\'s is used')

  const neither = toAppEventRow({ id: 'g3', start: { date: '2026-08-01' } }, 'cal-1', undefined)
  assert.equal(neither.time_zone, null)
  ok2('neither present -> null, not a fabricated UTC')

  // Everything else must be byte-identical to the pre-extraction mapping.
  assert.equal(neither.source, 'google')
  assert.equal(neither.title, '(No title)')
  assert.equal(neither.all_day, true)
  assert.equal(withZone.all_day, false)
  assert.equal(withZone.starts_at, '2026-08-01T20:00:00+02:00')
  ok2('the rest of the mapping is unchanged by the extraction')

  // ── Step 3: the two all-day off-by-ones, now fixed ───────────────────
  // Was '2026-08-01T00:00:00Z' — UTC midnight, which reads as 31 July anywhere
  // west of Greenwich. Now the instant the day begins in the event's own zone.
  assert.equal(noZone.starts_at, '2026-07-31T22:00:00.000Z')
  assert.equal(formatInZone(noZone.starts_at, noZone.time_zone, 'yyyy-MM-dd'), '2026-08-01')
  for (const device of ['UTC', 'America/Los_Angeles', 'Pacific/Auckland']) {
    // The point of the fix: the day no longer depends on who is looking.
    assert.equal(
      new Intl.DateTimeFormat('en-CA', { timeZone: noZone.time_zone, dateStyle: 'short' })
        .format(new Date(noZone.starts_at)),
      '2026-08-01',
      `all-day start read from ${device}`
    )
  }
  ok2('all-day starts at midnight in its OWN zone -> 1 Aug everywhere, not 31 July in the US')

  // Google's all-day end.date is EXCLUSIVE — 2 Aug for an event on the 1st.
  // Copied across verbatim it made a one-day event span three.
  assert.equal(noZone.ends_at, '2026-08-01T21:59:59.000Z')
  assert.equal(formatInZone(noZone.ends_at, noZone.time_zone, 'yyyy-MM-dd'), '2026-08-01')
  ok2("Google's exclusive end.date is decremented — a one-day event covers one day")

  // A genuine multi-day span must keep its length.
  const span = toAppEventRow(
    { id: 'g4', summary: 'Race weekend', start: { date: '2026-05-22' }, end: { date: '2026-05-25' } },
    'cal-1', 'Europe/Monaco')
  assert.equal(formatInZone(span.starts_at, span.time_zone, 'yyyy-MM-dd'), '2026-05-22')
  assert.equal(formatInZone(span.ends_at, span.time_zone, 'yyyy-MM-dd'), '2026-05-24')
  ok2('a 22-24 May span still covers exactly those three days')

  // With no zone at all the arithmetic falls back to UTC, which is byte-for-byte
  // the old mapping — so those rows are untouched in either direction.
  assert.equal(neither.starts_at, '2026-08-01T00:00:00.000Z')
  assert.equal(neither.time_zone, null)
  ok2('no zone anywhere -> UTC midnight exactly as before, and still a null zone')

  // ── The round trip the plan asks for: push -> pull -> unchanged ──────
  // This was broken before step 3: a single-day all-day event came back
  // spanning 24-26 May because the exclusive end was never decremented.
  const ZONE = 'Europe/Monaco'
  const original = {
    id: 'rt', title: 'Race day', description: null, location: null,
    starts_at: '2026-05-23T22:00:00.000Z',   // 24 May 00:00 Monaco
    ends_at: '2026-05-24T21:59:59.000Z',     // 24 May 23:59:59 Monaco
    all_day: true, external_id: 'g-rt', source: 'app',
  }
  const pushed = toGoogleEvent(original, ZONE)
  const pulled = toAppEventRow(
    { id: 'g-rt', summary: original.title, start: pushed.start, end: pushed.end }, 'cal-1', ZONE)
  assert.equal(pulled.starts_at, original.starts_at, 'round trip moved the start')
  assert.equal(pulled.ends_at, original.ends_at, 'round trip moved the end')
  ok2('an all-day event survives push -> pull byte-identically, span included')
}

// ── Step 5: the push sends the zone ─────────────────────────────────────
console.log('\nstep 5 — an app event reaches Google as a wall clock:')
{
  const MONACO = 'Europe/Monaco'
  const FROM_NY = 'America/New_York'   // the pushing browser's zone

  // A timed event now carries its zone on both ends. `dateTime` already fixed
  // the instant; the zone is what stops Google rendering it in the target
  // calendar's default zone instead of the one it was meant in.
  const timed = toGoogleEvent(ev({
    all_day: false, time_zone: MONACO,
    starts_at: '2026-07-29T18:00:00.000Z', ends_at: '2026-07-29T20:00:00.000Z',
  }), FROM_NY)
  assert.equal(timed.start.timeZone, MONACO)
  assert.equal(timed.end.timeZone, MONACO)
  // The instant must NOT move — this step adds information, it does not reinterpret.
  assert.equal(timed.start.dateTime, '2026-07-29T18:00:00.000Z')
  assert.equal(timed.end.dateTime, '2026-07-29T20:00:00.000Z')
  ok('a timed event sends its zone on start and end, with the instant untouched')

  // No zone: no key. Google then applies the calendar's own, which is today's
  // behaviour — sending the pusher's device zone would assert what we do not know.
  const unzoned = toGoogleEvent(ev({
    all_day: false, time_zone: null, starts_at: '2026-07-29T18:00:00.000Z',
  }), FROM_NY)
  assert.ok(!('timeZone' in unzoned.start), 'a null zone must send no timeZone key')
  assert.ok(!('timeZone' in unzoned.end))
  ok('a row with no zone sends no timeZone at all, rather than a fabricated one')

  // ── The all-day bug step 4 made reachable ─────────────────────────────
  // Since step 3 an all-day row sits at midnight in ITS zone, so deriving the
  // date in the pusher's zone is off by one whenever they differ. Reachable
  // without the picker: create it in Monaco, lose the wifi, and the sweep
  // retries from wherever you are by then.
  const allDay = ev({
    all_day: true, time_zone: MONACO,
    starts_at: '2026-07-31T22:00:00.000Z',   // 1 Aug 00:00 Monaco
    ends_at: '2026-08-01T21:59:59.000Z',     // 1 Aug 23:59:59 Monaco
  })
  const pushedFromNY = toGoogleEvent(allDay, FROM_NY)
  assert.equal(pushedFromNY.start.date, '2026-08-01', 'was 2026-07-31 — a day early')
  assert.equal(pushedFromNY.end.date, '2026-08-02', 'exclusive end for a one-day event')
  ok('an all-day event pushed from another zone keeps its own date — was a day early, and a two-day span')

  // And the date must not depend on where it is pushed from at all.
  const dates = new Set(
    ['UTC', FROM_NY, 'Asia/Singapore', 'Pacific/Auckland', 'America/Los_Angeles']
      .map((tz) => toGoogleEvent(allDay, tz).start.date)
  )
  assert.equal(dates.size, 1, `date varied by pusher: ${[...dates].join(' | ')}`)
  assert.equal([...dates][0], '2026-08-01')
  ok('the same all-day event pushes as 1 August from all five pushing zones')

  // ── Round trip, now with the zone included ────────────────────────────
  const original = ev({
    id: 'rt2', all_day: false, time_zone: MONACO, external_id: 'g-rt2',
    starts_at: '2026-07-29T18:00:00.000Z', ends_at: '2026-07-29T20:00:00.000Z',
  })
  const body = toGoogleEvent(original, FROM_NY)
  const back = toAppEventRow(
    { id: 'g-rt2', summary: original.title, start: body.start, end: body.end },
    'cal-1', 'Some/Other_Zone')
  assert.equal(back.starts_at, original.starts_at)
  assert.equal(back.ends_at, original.ends_at)
  // The zone survives, and comes from the EVENT rather than the calendar
  // fallback — which is what proves the push actually carried it.
  assert.equal(back.time_zone, MONACO)
  ok('a timed event survives push -> pull with its instant AND its zone intact')
}

// ── A UTC zone from a feed is a placeholder, not an intention ───────────
// Kevin's TripIt calendar is a subscription whose default zone is UTC, so every
// flight arrived labelled UTC and rendered as a UTC wall clock: "1:04 AM GMT+0"
// where Google shows "9:04pm". Faithful to the field and useless to a person.
console.log('\nUTC from a feed is dropped on timed events:')
{
  const NY = 'America/New_York'

  // The real event, with the instants Google reports for it.
  const flight = toAppEventRow({
    id: 'b6841', summary: 'B6841 JFK to DUB',
    start: { dateTime: '2026-08-07T01:04:00Z', timeZone: 'UTC' },   // 9:04pm EDT
    end: { dateTime: '2026-08-07T08:00:00Z', timeZone: 'UTC' },     // 4:00am EDT
  }, 'cal-1', 'UTC')

  assert.equal(flight.time_zone, null, 'a UTC zone on a timed event must be dropped')
  // The instants are untouched — this changes what we claim to know, not the data.
  assert.equal(flight.starts_at, '2026-08-07T01:04:00Z')
  assert.equal(flight.ends_at, '2026-08-07T08:00:00Z')
  // And a null zone reads in the reader's zone, which is what Google shows.
  assert.equal(formatInZone(flight.starts_at, NY, 'h:mm a'), '9:04 PM')
  assert.equal(formatInZone(flight.ends_at, NY, 'h:mm a'), '4:00 AM')
  ok2('the JFK-DUB flight now reads 9:04 PM - 4:00 AM, matching Google exactly')

  // The calendar-level fallback is the door this actually came through: the
  // event declared no zone of its own, and the subscription's UTC leaked in.
  const viaCalendar = toAppEventRow({
    id: 'dl5316', summary: 'DL5316 RIC to JFK',
    start: { dateTime: '2026-08-06T15:42:00Z' },
    end: { dateTime: '2026-08-06T17:08:00Z' },
  }, 'cal-1', 'UTC')
  assert.equal(viaCalendar.time_zone, null)
  assert.equal(formatInZone(viaCalendar.starts_at, NY, 'h:mm a'), '11:42 AM')
  ok2("a UTC calendar default is dropped too — 11:42 AM, not the 3:42 PM GMT+0 we showed")

  // A real zone is untouched. This is the whole per-event feature; it must not
  // be collateral damage.
  const dinner = toAppEventRow({
    id: 'g9', summary: 'Dinner',
    start: { dateTime: '2026-07-29T18:00:00Z', timeZone: 'Europe/Monaco' },
    end: { dateTime: '2026-07-29T20:00:00Z', timeZone: 'Europe/Monaco' },
  }, 'cal-1', 'UTC')
  assert.equal(dinner.time_zone, 'Europe/Monaco')
  assert.equal(formatInZone(dinner.starts_at, dinner.time_zone, 'h:mm a'), '8:00 PM')
  ok2('a genuine zone survives — the Monaco dinner still reads 8:00 PM in Monaco')

  // Every spelling, since feeds are inconsistent about it.
  for (const alias of ['UTC', 'utc', 'GMT', 'Etc/UTC', 'Etc/GMT', 'Zulu', 'Universal', ' utc ']) {
    assert.ok(isUtcPlaceholder(alias), `${alias} should count as UTC`)
  }
  // Matched by NAME, never by current offset: London is GMT+0 all winter and is
  // a zone someone can genuinely mean.
  for (const real of ['Europe/London', 'Europe/Dublin', 'Atlantic/Reykjavik', 'Africa/Abidjan']) {
    assert.ok(!isUtcPlaceholder(real), `${real} is a real zone, not a placeholder`)
  }
  assert.ok(!isUtcPlaceholder(null) && !isUtcPlaceholder(undefined) && !isUtcPlaceholder(''))
  ok2('8 spellings of UTC are placeholders; Europe/London and friends are not, despite being GMT+0 in winter')

  // ── The regression this deliberately does NOT cause ───────────────────
  // An all-day row KEEPS its UTC zone. There the zone is not a wall clock, it
  // only decides which local day the stored midnight falls on. Dropping it would
  // leave UTC midnight to be read in the device zone — the day-early bug step 3
  // fixed, back again on the very same feed rows.
  const allDayFeed = toAppEventRow({
    id: 'gp', summary: 'Zandvoort Grand Prix',
    start: { date: '2026-08-06' }, end: { date: '2026-08-07' },
  }, 'cal-1', 'UTC')
  assert.equal(allDayFeed.time_zone, 'UTC', 'an all-day row must KEEP its zone')
  assert.equal(allDayFeed.starts_at, '2026-08-06T00:00:00.000Z')
  assert.equal(formatInZone(allDayFeed.starts_at, allDayFeed.time_zone, 'yyyy-MM-dd'), '2026-08-06')
  // Which is the point: it reads 6 August from anywhere, including west of Greenwich.
  assert.equal(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', dateStyle: 'short' })
      .format(new Date(allDayFeed.starts_at)), '2026-08-06')
  ok2('an all-day feed row keeps UTC, so it still reads 6 August everywhere rather than the 5th in the US')
}

// ── The binding constraint on step 5 ────────────────────────────────────
// The plan states as an absolute that this work never modifies an event in
// Google, and names what makes it true: every calendar-mutating path is behind
// a `source === 'app'` check. "It must not be relaxed, and no new push path may
// be added that skips it."
//
// Nothing enforced that but attention, and step 5 is the step that writes to
// Google — so this is a tripwire in the same spirit as the write-choke-point
// grep documented in src/lib/events.ts. It is deliberately structural: it does
// not prove a new path would be unguarded, it refuses to let one be added
// quietly without someone re-reading the guarantee.
console.log('\nthe guarantee that this never modifies a Google event:')
{
  const src = await readFile(new URL('../src/lib/google-calendar.ts', import.meta.url), 'utf8')

  assert.match(src, /if \(event\.source !== 'app'\) throw/,
    'pushEventToGoogle lost its source guard — the plan makes this binding')
  ok("pushEventToGoogle still refuses anything that is not source: 'app'")

  assert.match(src, /\.eq\('source', 'app'\)/,
    'the unpushed sweep lost its source filter')
  ok('the sweep still queries only app-sourced rows, so it cannot feed the push a Google row')

  // Every write to a Google endpoint. Three touch a calendar (PATCH an event,
  // POST an event, DELETE an event) and one is the OAuth token exchange, which
  // is not a calendar write at all.
  const writes = src.match(/method: '(POST|PATCH|PUT|DELETE)'/g) ?? []
  assert.equal(writes.length, 4,
    `expected 4 write calls (3 calendar + 1 OAuth token), found ${writes.length}: ${writes.join(', ')}. ` +
    'If you added a Google write, confirm it is behind the source guard and update this count.')
  ok('there are still exactly three calendar-mutating paths, plus the OAuth token exchange')

  // Step 5 adds a field to a body, not a request.
  assert.ok(!/method: 'PUT'/.test(src), 'step 5 must not introduce a new HTTP verb')
  ok('step 5 added a field to an existing body rather than a new request')
}


// ── The sync lease ──────────────────────────────────────────────────────
// Focus-sync makes overlapping syncs ordinary — a phone and a laptop waking to
// the same calendar share no browser state to throttle against. Two runs both
// see the same unpushed row and both create it in Google, leaving an orphan
// duplicate that has to be cleaned up by hand.
console.log('\nthe sync lease:')
{
  const { acquireSyncLease, SYNC_LEASE_MS } =
    await import('../src/lib/google-calendar.ts')

  // Minimal stand-in for the two calls the lease makes.
  const leaseClient = ({ value = null, selectError = null, upsertError = null, throwOn = null } = {}) => {
    const calls = []
    return {
      calls,
      from(table) {
        if (throwOn === table) throw new Error('table exploded')
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => {
                    calls.push('select')
                    return { data: value ? { value } : null, error: selectError }
                  },
                }
              },
            }
          },
          async upsert(row) {
            calls.push('upsert')
            this._row = row
            return { error: upsertError }
          },
        }
      },
    }
  }

  const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString()

  assert.equal(await acquireSyncLease(leaseClient()), true)
  ok2('no lease held -> acquired')

  assert.equal(await acquireSyncLease(leaseClient({ value: iso(1000) })), false)
  ok2('a lease taken a second ago -> refused, which is what stops the double push')

  assert.equal(await acquireSyncLease(leaseClient({ value: iso(SYNC_LEASE_MS + 1000) })), true)
  ok2('a stale lease -> acquired, so a crashed run cannot wedge sync permanently')

  // Fail open, in all three ways it can fail. A duplicate event is recoverable;
  // a calendar that silently stops syncing is not.
  assert.equal(await acquireSyncLease(leaseClient({ selectError: { message: 'no such table' } })), true)
  ok2('unreadable marker table -> proceeds unguarded rather than refusing to sync')

  assert.equal(await acquireSyncLease(leaseClient({ upsertError: { message: 'RLS' } })), true)
  ok2('un-writable marker -> still proceeds, rather than blocking on bookkeeping')

  assert.equal(await acquireSyncLease(leaseClient({ throwOn: 'app_credentials' })), true)
  ok2('a thrown client error -> proceeds; the lease is a guard, never a gate')

  // A garbage value must not be read as a fresh lease and lock sync out.
  assert.equal(await acquireSyncLease(leaseClient({ value: 'not a date' })), true)
  ok2('an unparseable timestamp is treated as no lease, not as one held forever')
}


// ── Deletions in Google must reach the app ──────────────────────────────
// The pull upserts and only upserts, so deleting an event in Google left its row
// here forever — Kevin hit this on 28 July. `staleEventIds` is the diff that
// decides what to remove, kept pure because it is the only part of the sync that
// destroys data.
console.log('\nreconciling deletions:')
{
  const { staleEventIds } = await import('../src/lib/google-calendar.ts')
  const row = (id, ext) => ({ id, external_id: ext })

  // The plain case: Google returned two of the three we hold.
  assert.deepEqual(
    staleEventIds([row('a', 'g1'), row('b', 'g2'), row('c', 'g3')], new Set(['g1', 'g3'])),
    ['b']
  )
  ok2('a row Google no longer returns is marked for deletion')

  assert.deepEqual(staleEventIds([row('a', 'g1')], new Set(['g1'])), [])
  ok2('a row Google still returns is left alone')

  // A row with no external_id is not Google's to delete, whatever the set says.
  assert.deepEqual(staleEventIds([row('a', null), row('b', 'g2')], new Set([])), ['b'])
  ok2('a row without an external_id is never touched — it did not come from Google')

  // Everything deleted in Google: the honest answer is everything, and the
  // caller's guard is that this only runs after every page fetch SUCCEEDED.
  assert.deepEqual(staleEventIds([row('a', 'g1'), row('b', 'g2')], new Set([])), ['a', 'b'])
  ok2('an empty seen-set removes them all, which is only safe because a failed fetch throws before this')

  assert.deepEqual(staleEventIds([], new Set(['g1'])), [])
  ok2('nothing cached, nothing to remove')

  // The set is built from ALL pages. A one-page seen-set against two pages of
  // cached rows is exactly how a paging bug would become data loss.
  const twoPages = new Set(['g1', 'g2', 'g3', 'g4'])
  assert.deepEqual(
    staleEventIds([row('a', 'g1'), row('b', 'g4'), row('c', 'gone')], twoPages),
    ['c']
  )
  ok2('ids from every page are honoured, so paging cannot silently delete a later page')
}

console.log(`\n${pass + p2} checks passed.\n`)
