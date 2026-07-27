// An event must read as the wall clock it was meant in, wherever the device is.
//
// Step 2 of the per-event timezone work: the render helper ships used by
// nothing, so it is proved here rather than through the UI. Every assertion
// below is one the views will depend on in step 3.
//
// See docs/design/timezones/per-event-timezone-plan.md

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { format, parseISO } from 'date-fns'

const {
  formatInZone, offsetLabel, partsInZone, deviceTimeZone,
  instantFromParts, dayStartInZone, dayEndInZone, instantFromLocalInput,
  timeWithZone, timeWithBothZones,
} = await import('../src/lib/zoned-time.ts')

// ── Child mode ──────────────────────────────────────────────────────────
// The headline property — the same row reads the same everywhere — is about
// the *device* zone, which a single process cannot vary reliably: Node reads TZ
// once and caches it. So this file re-runs itself under other TZ values and
// compares. Doing it here rather than in a second file keeps the expected
// values next to the assertion that uses them.
if (process.env.ZT_CHILD_PROBE) {
  console.log(JSON.stringify(probe()))
  process.exit(0)
}

let pass = 0
const ok = (n) => { pass++; console.log(`  ✓ ${n}`) }

const zone = process.env.TZ ?? 'UTC'
console.log(`\nrendering an instant in its own zone  [TZ=${zone}]`)

// ── The instant used throughout ─────────────────────────────────────────
// 18:00 UTC on 29 July 2026: 8pm in Monaco, 2pm in New York, 11:30pm in
// Kolkata. Built from Date.UTC so the fixture does not depend on the runner.
const DINNER = new Date(Date.UTC(2026, 6, 29, 18, 0)).toISOString()
// A January instant, for the half of the year the other one cannot reach.
const JAN_NY = new Date(Date.UTC(2026, 0, 15, 17, 0)).toISOString()

assert.equal(formatInZone(DINNER, 'Europe/Monaco', 'h:mm a'), '8:00 PM')
assert.equal(formatInZone(DINNER, 'America/New_York', 'h:mm a'), '2:00 PM')
assert.equal(formatInZone(DINNER, 'Asia/Kolkata', 'EEE h:mm a'), 'Wed 11:30 PM')
assert.equal(formatInZone(DINNER, 'Pacific/Auckland', 'EEE h:mm a'), 'Thu 6:00 AM')
ok('one instant reads as four different wall clocks, each correct for its zone')

// ── The property the whole exercise exists for ──────────────────────────
// A Monaco dinner is 8pm in Monaco whatever the phone is set to. This is what
// no existing test asserts, and what every current render site gets wrong.
const DEVICE_ZONES = ['UTC', 'America/New_York', 'Asia/Singapore', 'Pacific/Auckland', 'America/Los_Angeles']
const self = fileURLToPath(import.meta.url)
const probes = new Map()
for (const tz of DEVICE_ZONES) {
  const out = execFileSync(
    process.execPath,
    ['--experimental-strip-types', self],
    { env: { ...process.env, TZ: tz, ZT_CHILD_PROBE: '1', NODE_NO_WARNINGS: '1' }, encoding: 'utf8' }
  )
  probes.set(tz, JSON.parse(out))
}

const wallClocks = new Set([...probes.values()].map((p) => p.monacoWall))
assert.equal(wallClocks.size, 1, `wall clock varied by device zone: ${[...wallClocks].join(' | ')}`)
assert.equal([...wallClocks][0], 'Wed 29 Jul 8:00 PM')
ok(`the same row reads "Wed 29 Jul 8:00 PM" under all ${DEVICE_ZONES.length} device zones — the point of the feature`)

// The day it files under must not vary either. A wrong zone in a bucketing site
// moves an event to another day rather than mislabelling it, which is worse.
const dayKeys = new Set([...probes.values()].map((p) => p.monacoDayKey))
assert.equal(dayKeys.size, 1, `day key varied by device zone: ${[...dayKeys].join(' | ')}`)
assert.equal([...dayKeys][0], '2026-07-29')
ok('and files under 2026-07-29 in every one of them (bucketing cannot drift either)')

// ── A null zone is today's behaviour, permanently ───────────────────────
// Null means "we do not know", so it must render exactly as the device zone —
// and unlike the case above, it is *expected* to vary with the device.
for (const [tz, p] of probes) {
  assert.equal(p.nullZone, p.deviceZone, `null zone diverged from the device under TZ=${tz}`)
}
const nullReadings = new Set([...probes.values()].map((p) => p.nullZone))
assert.equal(nullReadings.size, DEVICE_ZONES.length)
ok(`a null zone tracks the device in all ${DEVICE_ZONES.length} zones, giving ${nullReadings.size} distinct readings — no regression for unzoned rows`)

// ── Byte-identical to date-fns when the zone is the device's ────────────
// This is what makes step 3 safe to land view by view: converting a call site
// is a visible no-op for every row whose zone matches the device, so anything
// that does change on screen is a row that was genuinely being mis-stated.
const PATTERNS = [
  'h:mm a', 'yyyy-MM-dd', 'EEE', 'EEEE', 'EEE h:mm a', 'EEEE, MMMM d', 'MMM d',
  'MMMM yyyy', 'h a', 'HH:mm', "yyyy-MM-dd'T'HH:mm", 'yy', 'M/d', 'dd/MM/yyyy',
  'H:mm:ss', 'hh:mm a', 'EEEE, MMMM d, yyyy',
]
const SAMPLES = []
for (let h = 0; h < 24; h++) SAMPLES.push(new Date(Date.UTC(2026, 6, 29, h, 30)).toISOString())
SAMPLES.push(
  new Date(Date.UTC(2026, 2, 8, 6, 30)).toISOString(),   // US spring-forward
  new Date(Date.UTC(2026, 10, 1, 5, 30)).toISOString(),  // US fall-back
  new Date(Date.UTC(2026, 2, 29, 0, 30)).toISOString(),  // EU spring-forward
  new Date(Date.UTC(2026, 9, 25, 0, 30)).toISOString(),  // EU fall-back
  new Date(Date.UTC(2026, 11, 31, 23, 30)).toISOString(),// year boundary
  new Date(Date.UTC(2027, 0, 1, 0, 30)).toISOString(),
  new Date(Date.UTC(2024, 1, 29, 12, 0)).toISOString(),  // leap day
)

const here = deviceTimeZone()
let compared = 0
for (const iso of SAMPLES) {
  for (const fmt of PATTERNS) {
    const expected = format(parseISO(iso), fmt)
    assert.equal(formatInZone(iso, here, fmt), expected, `${fmt} on ${iso} in ${here}`)
    assert.equal(formatInZone(iso, null, fmt), expected, `${fmt} on ${iso} with a null zone`)
    compared += 2
  }
}
ok(`${compared} comparisons match date-fns exactly for the device zone (${PATTERNS.length} patterns × ${SAMPLES.length} instants, both DST transitions each side of Greenwich, year boundary, leap day)`)

// ── The hazard the implementation was chosen to avoid ───────────────────
// The usual "format in another zone" trick builds a Date from the target zone's
// fields and lets the device format it. When that wall clock does not exist in
// the *device's* zone, the constructor silently moves it forward an hour.
//
// Monaco 2:30 AM on 8 March 2026 — a time New York skips entirely that morning.
const GAP = new Date(Date.UTC(2026, 2, 8, 1, 30)).toISOString()
assert.equal(formatInZone(GAP, 'Europe/Monaco', 'h:mm a'), '2:30 AM')
assert.equal(formatInZone(GAP, 'Europe/Monaco', "yyyy-MM-dd'T'HH:mm"), '2026-03-08T02:30')
const p = partsInZone(GAP, 'Europe/Monaco')
const naive = new Date(p.year, p.month - 1, p.day, p.hour, p.minute)
const naiveReading = format(naive, 'h:mm a')
if (naiveReading !== '2:30 AM') {
  ok(`a Monaco 2:30 AM event survives a device DST gap — the shifted-Date approach reads it as ${naiveReading} here`)
} else {
  ok('a Monaco 2:30 AM event reads correctly (this device has no gap there; New York does)')
}

// ── The offset marker ───────────────────────────────────────────────────
// The label is computed from the event's own instant, so it has to be read on a
// device that is not already in the zone — otherwise it is correctly suppressed
// and the seasonal difference is invisible. Asserted against the Singapore
// probe rather than the runner's zone so these hold under any TZ: GMT+8 differs
// from New York, Monaco and Kolkata in both seasons.
const abroad = probes.get('Asia/Singapore')
assert.equal(abroad.nyJan, 'GMT-5')
assert.equal(abroad.nyJul, 'GMT-4')
ok('the same New York event reads GMT-5 in January and GMT-4 in July — the offset is a function of the date, not of today')

assert.equal(abroad.monacoJan, 'GMT+1')
assert.equal(abroad.monacoJul, 'GMT+2')
assert.equal(abroad.kolkataJul, 'GMT+5:30')
ok('Monaco crosses GMT+1/GMT+2, and a half-hour zone is labelled GMT+5:30')

assert.equal(offsetLabel(DINNER, null), null)
ok('a null zone gets no marker — there is nothing to compare, it is already the device reading')

// The suppression rule itself, checked against whatever zone this runner is in.
assert.equal(offsetLabel(DINNER, here), null)
assert.equal(offsetLabel(JAN_NY, here), null)
ok(`an event in the device's own zone (${here}) is never marked, in either season`)

// Only when it differs, and it must vanish when the device moves into the zone.
const markers = new Map([...probes].map(([tz, p]) => [tz, p.monacoMarker]))
assert.equal(markers.get('UTC'), 'GMT+2')
assert.equal(markers.get('America/New_York'), 'GMT+2')
assert.equal(markers.get('Pacific/Auckland'), 'GMT+2')
ok('the marker appears on a device outside the event\'s zone (UTC, New York, Auckland all show GMT+2)')

const sameZone = JSON.parse(execFileSync(
  process.execPath,
  ['--experimental-strip-types', self],
  { env: { ...process.env, TZ: 'Europe/Monaco', ZT_CHILD_PROBE: '1', NODE_NO_WARNINGS: '1' }, encoding: 'utf8' }
))
assert.equal(sameZone.monacoMarker, null)
assert.equal(sameZone.monacoWall, 'Wed 29 Jul 8:00 PM')
ok('and disappears once the device is in Europe/Monaco, while the time it reads stays the same')

// Same offset, different name: nothing to report.
const paris = JSON.parse(execFileSync(
  process.execPath,
  ['--experimental-strip-types', self],
  { env: { ...process.env, TZ: 'Europe/Paris', ZT_CHILD_PROBE: '1', NODE_NO_WARNINGS: '1' }, encoding: 'utf8' }
))
assert.equal(paris.monacoMarker, null)
ok('a Monaco event on a Paris device is unmarked — compared by offset, not by zone name, so "GMT+2 · GMT+2" is never shown')

// UTC is rendered "GMT" by Intl, which must not read as a difference.
const utcProbe = probes.get('UTC')
assert.equal(utcProbe.utcMarker, null)
ok('a UTC event on a UTC device is unmarked (Intl says "GMT", normalised so it compares equal)')

// ── All-day events ──────────────────────────────────────────────────────
// The live bug this fixes in step 3: the Google pull stores all-day rows at UTC
// midnight, so they render a day early anywhere west of Greenwich. Storage
// alone cannot fix it — an all-day Monaco event stored at midnight in its own
// zone still lands a day early when a New York device formats it. Rendering it
// in its own zone is what fixes it, so the invariant belongs to this helper.
const allDayMonaco = new Date(Date.UTC(2026, 7, 1, 0, 0)).toISOString() // 00:00 UTC, 1 Aug
assert.equal(formatInZone(allDayMonaco, 'Europe/Monaco', 'yyyy-MM-dd'), '2026-08-01')
assert.equal(formatInZone(allDayMonaco, 'UTC', 'yyyy-MM-dd'), '2026-08-01')
// Read in the device zone — today's behaviour — the same row moves a day west.
assert.equal(formatInZone(allDayMonaco, 'America/New_York', 'yyyy-MM-dd'), '2026-07-31')
assert.equal(formatInZone(allDayMonaco, 'America/Los_Angeles', 'yyyy-MM-dd'), '2026-07-31')
ok('the UTC-midnight all-day row still lands on 31 July when read in a US zone — the step 3 bug, pinned here as still live')

const dayKeysAllDay = new Set([...probes.values()].map((pr) => pr.allDayInOwnZone))
assert.equal(dayKeysAllDay.size, 1)
assert.equal([...dayKeysAllDay][0], '2026-08-01')
ok('but read in its own zone it is 1 August on every device — the invariant step 3 relies on')

// ── Bucketing primitives ────────────────────────────────────────────────
const gridParts = partsInZone(DINNER, 'Europe/Monaco')
assert.deepEqual(gridParts, { year: 2026, month: 7, day: 29, hour: 20, minute: 0, second: 0 })
ok('partsInZone gives 1-based months and a 0–23 hour, for the day keys and grid positions in step 3')

// Midnight must be hour 0, not 24 — the `hour12: false` trap.
const halfPastMidnight = new Date(Date.UTC(2026, 6, 29, 22, 30)).toISOString()
assert.equal(partsInZone(halfPastMidnight, 'Europe/Monaco').hour, 0)
assert.equal(formatInZone(halfPastMidnight, 'Europe/Monaco', 'HH:mm'), '00:30')
assert.equal(formatInZone(halfPastMidnight, 'Europe/Monaco', 'h:mm a'), '12:30 AM')
ok('00:30 is hour 0 and reads "12:30 AM", never 24:30')

// ── Failure modes ───────────────────────────────────────────────────────
assert.throws(() => formatInZone(DINNER, 'Europe/Monaco', 'yyyy-MM-dd Z'), /Unsupported pattern token "Z"/)
assert.throws(() => formatInZone(DINNER, 'Europe/Monaco', 'Do'), /Unsupported pattern token/)
assert.throws(() => formatInZone(DINNER, 'Europe/Monaco', "yyyy'T"), /Unterminated quote/)
ok('an unsupported token throws instead of passing through — a silent fallthrough would be believed')

assert.throws(() => formatInZone('not-a-date', 'Europe/Monaco', 'h:mm a'), RangeError)
assert.throws(() => offsetLabel('not-a-date', 'Europe/Monaco'), RangeError)
ok('an unparseable instant throws RangeError, as date-fns already does at the sites this replaces')

// A bad zone must not blank the calendar; it degrades to the null behaviour.
const quiet = console.warn
console.warn = () => {}
assert.equal(formatInZone(DINNER, 'Mars/Olympus_Mons', 'h:mm a'), formatInZone(DINNER, null, 'h:mm a'))
assert.equal(offsetLabel(DINNER, 'Mars/Olympus_Mons'), null)
console.warn = quiet
ok('an unknown zone falls back to the device rather than throwing — one bad row cannot take out the view')

// Quoted literals, since the dialog prefill depends on one. Checked against
// date-fns rather than hardcoded, so the escaping rule matches the library the
// converted call sites are being moved off — including a doubled quote inside a
// run, which a naive scanner ends early and then reads the rest as tokens.
const QUOTED = ["'at' h:mm a", "h 'o''clock'", "yyyy-MM-dd'T'HH:mm", "''", "'GMT'"]
for (const fmt of QUOTED) {
  assert.equal(formatInZone(DINNER, here, fmt), format(parseISO(DINNER), fmt), `quoted: ${fmt}`)
}
assert.equal(formatInZone(DINNER, 'Europe/Monaco', "h 'o''clock'"), "8 o'clock")
ok(`${QUOTED.length} quoted-literal patterns match date-fns, including a doubled quote inside a run`)

// ── The inverse: a wall clock back to an instant ────────────────────────
// Needed by the all-day fix and by saving from the dialog. Both would be
// impossible to get right without it, and both are in step 3.
assert.equal(dayStartInZone('2026-08-01', 'Europe/Monaco'), '2026-07-31T22:00:00.000Z')
assert.equal(dayStartInZone('2026-08-01', 'America/New_York'), '2026-08-01T04:00:00.000Z')
assert.equal(dayStartInZone('2026-08-01', 'UTC'), '2026-08-01T00:00:00.000Z')
ok('a calendar date resolves to the instant its day begins in its own zone')

// The convention the push already assumes: local midnight to local 23:59:59.
assert.equal(dayEndInZone('2026-05-24', 'Europe/Monaco'), '2026-05-24T21:59:59.000Z')
ok("an all-day end is the day's last second in its own zone, matching what toGoogleEvent reads back")

// A date must survive the trip in both directions, in its own zone.
for (const z of ['UTC', 'Europe/Monaco', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata']) {
  for (const d of ['2026-01-01', '2026-03-08', '2026-03-29', '2026-08-01', '2026-10-25', '2026-12-31']) {
    assert.equal(formatInZone(dayStartInZone(d, z), z, 'yyyy-MM-dd'), d, `${d} in ${z}`)
    assert.equal(formatInZone(dayEndInZone(d, z), z, 'yyyy-MM-dd'), d, `${d} end in ${z}`)
  }
}
ok('30 date/zone pairs survive date -> instant -> date, including both DST weekends')

// instant -> parts -> instant, hour by hour. The exceptions are the repeated
// hour on a fall-back night, which has two valid answers and is documented as
// unspecified — so they are counted rather than asserted away.
let exact = 0
let ambiguous = 0
for (const z of ['UTC', 'Europe/Monaco', 'America/New_York', 'Asia/Kolkata', 'Pacific/Auckland']) {
  for (const base of [Date.UTC(2026, 0, 15), Date.UTC(2026, 2, 8), Date.UTC(2026, 2, 29), Date.UTC(2026, 6, 15), Date.UTC(2026, 9, 25), Date.UTC(2026, 10, 1)]) {
    for (let h = 0; h < 24; h++) {
      const iso = new Date(base + h * 3600e3 + 1800e3).toISOString()
      const back = instantFromParts(partsInZone(iso, z), z)
      if (back === iso) exact++
      else {
        // Must still read as the same wall clock — that is what "valid" means
        // for the other side of an ambiguous hour.
        assert.equal(formatInZone(back, z, "yyyy-MM-dd'T'HH:mm"), formatInZone(iso, z, "yyyy-MM-dd'T'HH:mm"))
        ambiguous++
      }
    }
  }
}
assert.equal(exact + ambiguous, 720)
assert.ok(ambiguous <= 2, `${ambiguous} ambiguous readings, expected at most the two fall-back hours`)
ok(`${exact}/720 instants round-trip exactly; the ${ambiguous} that do not are repeated fall-back hours and still read as the same wall clock`)

assert.equal(instantFromLocalInput('2026-07-29T20:00', 'Europe/Monaco'), DINNER)
assert.equal(instantFromLocalInput('2026-07-29T14:00', 'America/New_York'), DINNER)
assert.equal(instantFromLocalInput('2026-08-01', 'Europe/Monaco'), '2026-07-31T22:00:00.000Z')
assert.throws(() => instantFromLocalInput('not a date', 'UTC'), RangeError)
ok('a datetime-local value is read as a wall clock in the zone it was shown in — two zones, one instant')

// The guarantee the dialog depends on: prefill in the event's zone, save it
// back, same instant. Interpreting the input as device-local while showing it
// in Monaco is exactly how open-and-save moves an event.
let moved = 0
for (const z of ['Europe/Monaco', 'America/New_York', 'Asia/Kolkata']) {
  for (let h = 0; h < 24; h++) {
    const iso = new Date(Date.UTC(2026, 6, 29, h, 30)).toISOString()
    const prefilled = formatInZone(iso, z, "yyyy-MM-dd'T'HH:mm")
    if (instantFromLocalInput(prefilled, z) !== iso) moved++
  }
}
assert.equal(moved, 0, `${moved} zoned events moved on open-and-save`)
ok('72 zoned events survive prefill-then-save unchanged (the drift bug, in its zoned form)')

// ── The two label presentations ─────────────────────────────────────────
assert.equal(timeWithZone(DINNER, here), formatInZone(DINNER, here, 'h:mm a'))
assert.equal(timeWithBothZones(DINNER, here), formatInZone(DINNER, here, 'h:mm a'))
assert.equal(timeWithZone(DINNER, null), formatInZone(DINNER, null, 'h:mm a'))
ok('a local event carries no marker in either presentation — it reads exactly as it does today')

const abroadLabels = probes.get('Asia/Singapore')
assert.equal(abroadLabels.compact, '8:00 PM GMT+2')
assert.equal(abroadLabels.dual, '8:00 PM GMT+2 · 2:00 AM your time')
ok('away from the zone: compact rows read "8:00 PM GMT+2", detail surfaces add "· 2:00 AM your time"')

console.log(`\n${pass} checks passed.\n`)

// ── The probe run in each device zone ───────────────────────────────────
function probe() {
  const dinner = new Date(Date.UTC(2026, 6, 29, 18, 0)).toISOString()
  const allDay = new Date(Date.UTC(2026, 7, 1, 0, 0)).toISOString()
  const jan = new Date(Date.UTC(2026, 0, 15, 17, 0)).toISOString()
  const jul = new Date(Date.UTC(2026, 6, 15, 16, 0)).toISOString()
  return {
    nyJan: offsetLabel(jan, 'America/New_York'),
    nyJul: offsetLabel(jul, 'America/New_York'),
    monacoJan: offsetLabel(jan, 'Europe/Monaco'),
    monacoJul: offsetLabel(jul, 'Europe/Monaco'),
    kolkataJul: offsetLabel(jul, 'Asia/Kolkata'),
    tz: deviceTimeZone(),
    monacoWall: formatInZone(dinner, 'Europe/Monaco', 'EEE d MMM h:mm a'),
    monacoDayKey: formatInZone(dinner, 'Europe/Monaco', 'yyyy-MM-dd'),
    monacoMarker: offsetLabel(dinner, 'Europe/Monaco'),
    nullZone: formatInZone(dinner, null, 'EEE d MMM h:mm a'),
    deviceZone: formatInZone(dinner, deviceTimeZone(), 'EEE d MMM h:mm a'),
    allDayInOwnZone: formatInZone(allDay, 'Europe/Monaco', 'yyyy-MM-dd'),
    utcMarker: offsetLabel(dinner, 'UTC'),
    compact: timeWithZone(dinner, 'Europe/Monaco'),
    dual: timeWithBothZones(dinner, 'Europe/Monaco'),
  }
}
