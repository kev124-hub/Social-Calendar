// Which day does an event belong to?
//
// The dangerous half of the timezone work. Getting a *time* wrong mislabels a
// row; getting the *day* wrong files it under a date it does not belong to, so
// it vanishes from the day it does. `eventCoversDay` decides that for the month
// grid and the day view, and had no test at all before step 3.
//
// See docs/design/timezones/per-event-timezone-plan.md

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const { eventCoversDay } = await import('../src/lib/calendar-utils.ts')

// A calendar cell, as the grid builds them: device-local midnight, clock time
// meaningless. Constructed the same way date-fns' month arithmetic does.
const cell = (y, m, d) => new Date(y, m - 1, d)

const event = (o) => ({
  id: 'e1', title: 'T', description: null, location: null,
  starts_at: null, ends_at: null, all_day: false, time_zone: null,
  calendar_id: null, external_id: null, source: 'app', ...o,
})

if (process.env.CU_CHILD_PROBE) {
  console.log(JSON.stringify(probe()))
  process.exit(0)
}

let pass = 0
const ok = (n) => { pass++; console.log(`  ✓ ${n}`) }
const zone = process.env.TZ ?? 'UTC'
console.log(`\nwhich day an event belongs to  [TZ=${zone}]`)

// ── The case the device zone got wrong ──────────────────────────────────
// 00:30 in Monaco on 29 July. Read on a New York phone that instant is still
// 18:30 on the 28th, so the old device-zone bucketing filed it under the 28th —
// it disappeared from the day it is actually on.
const lateNightMonaco = event({
  starts_at: '2026-07-28T22:30:00.000Z',
  time_zone: 'Europe/Monaco',
})
assert.equal(eventCoversDay(lateNightMonaco, cell(2026, 7, 29)), true)
assert.equal(eventCoversDay(lateNightMonaco, cell(2026, 7, 28)), false)
ok('a 00:30 Monaco event covers 29 July and not the 28th, whatever the device is set to')

// The mirror image: early-morning UTC that is the previous evening in New York.
const morningNY = event({
  starts_at: '2026-07-29T03:30:00.000Z',   // 23:30 on the 28th in New York
  time_zone: 'America/New_York',
})
assert.equal(eventCoversDay(morningNY, cell(2026, 7, 28)), true)
assert.equal(eventCoversDay(morningNY, cell(2026, 7, 29)), false)
ok('a 23:30 New York event covers 28 July even though the instant is the 29th in UTC')

// ── Multi-day spans ─────────────────────────────────────────────────────
const raceWeekend = event({
  starts_at: '2026-05-21T22:00:00.000Z',   // 22 May 00:00 Monaco
  ends_at: '2026-05-24T21:59:59.000Z',     // 24 May 23:59:59 Monaco
  all_day: true,
  time_zone: 'Europe/Monaco',
})
for (const d of [22, 23, 24]) {
  assert.equal(eventCoversDay(raceWeekend, cell(2026, 5, d)), true, `should cover ${d} May`)
}
assert.equal(eventCoversDay(raceWeekend, cell(2026, 5, 21)), false, 'must not bleed to the 21st')
assert.equal(eventCoversDay(raceWeekend, cell(2026, 5, 25)), false, 'must not bleed to the 25th')
ok('a 22-24 May all-day span covers exactly three days, with no bleed either side')

// A single-day event with no end covers one day.
const single = event({ starts_at: '2026-07-31T22:00:00.000Z', all_day: true, time_zone: 'Europe/Monaco' })
assert.equal(eventCoversDay(single, cell(2026, 8, 1)), true)
assert.equal(eventCoversDay(single, cell(2026, 7, 31)), false)
assert.equal(eventCoversDay(single, cell(2026, 8, 2)), false)
ok('a null ends_at covers the start day only — 1 August, not 31 July')

// ── A null zone must behave exactly as it does today ────────────────────
// This is the permanently-supported path, not a migration window: rows outside
// the sync window and rows on disconnected calendars stay null forever.
const unzoned = event({ starts_at: new Date(2026, 6, 29, 12, 0).toISOString() })
assert.equal(eventCoversDay(unzoned, cell(2026, 7, 29)), true)
assert.equal(eventCoversDay(unzoned, cell(2026, 7, 30)), false)
ok('an unzoned row still buckets by the device zone — midday local is today, as before')

// ── Month and year boundaries ───────────────────────────────────────────
const newYear = event({
  starts_at: '2026-12-31T23:00:00.000Z',   // 1 Jan 00:00 Monaco
  time_zone: 'Europe/Monaco',
})
assert.equal(eventCoversDay(newYear, cell(2027, 1, 1)), true)
assert.equal(eventCoversDay(newYear, cell(2026, 12, 31)), false)
ok('midnight on 1 January in Monaco rolls the year, and is not still New Year’s Eve')

const leap = event({ starts_at: '2028-02-28T23:00:00.000Z', time_zone: 'Europe/Monaco' })
assert.equal(eventCoversDay(leap, cell(2028, 2, 29)), true)
ok('a leap day is a real day')

// ── Device-independence, the property that matters ──────────────────────
// A zoned event covers the same dates wherever it is read. Checked by re-running
// under five device zones, since one process cannot vary TZ.
const self = fileURLToPath(import.meta.url)
const ZONES = ['UTC', 'America/New_York', 'Asia/Singapore', 'Pacific/Auckland', 'America/Los_Angeles']
const results = ZONES.map((tz) => JSON.parse(execFileSync(
  process.execPath,
  ['--experimental-strip-types', self],
  { env: { ...process.env, TZ: tz, CU_CHILD_PROBE: '1', NODE_NO_WARNINGS: '1' }, encoding: 'utf8' }
)))

const zonedCoverage = new Set(results.map((r) => r.zoned))
assert.equal(zonedCoverage.size, 1, `coverage varied by device: ${[...zonedCoverage].join(' | ')}`)
assert.equal([...zonedCoverage][0], '29')
ok(`a zoned event covers 29 July and only 29 July under all ${ZONES.length} device zones`)

// And the contrast, so the fix is visible rather than asserted: an unzoned row
// is *expected* to follow the device, which is the behaviour being preserved.
const unzonedCoverage = new Set(results.map((r) => r.unzoned))
assert.ok(unzonedCoverage.size > 1, 'an unzoned row should still follow the device zone')
ok(`the same instant with a null zone lands on ${unzonedCoverage.size} different days across those zones — exactly the behaviour a zone removes`)

console.log(`\n${pass} checks passed.\n`)

function probe() {
  // 00:30 on 29 July in Monaco. Which of 28/29/30 July does it cover?
  const iso = '2026-07-28T22:30:00.000Z'
  const covered = (tz) => [28, 29, 30]
    .filter((d) => eventCoversDay(event({ starts_at: iso, time_zone: tz }), cell(2026, 7, d)))
    .join(',')
  return { zoned: covered('Europe/Monaco'), unzoned: covered(null) }
}
