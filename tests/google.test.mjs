// Stage 9: proves the Google payload conversion, especially all-day dates.
import assert from 'node:assert/strict'
const { toGoogleEvent } = await import('../src/lib/google-calendar.ts')

let pass = 0
const ok = (n) => { pass++; console.log(`  ✓ ${n}`) }

const ev = (o) => ({ id: 'evt-1', title: 'T', description: null, location: null, ends_at: null, all_day: false, external_id: null, source: 'app', ...o })

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
console.log(`\n${pass + p2} checks passed.\n`)
