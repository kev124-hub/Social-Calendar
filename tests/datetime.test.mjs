// The edit dialogs must be a no-op round trip: open, save untouched, same time.
import assert from 'node:assert/strict'
const { toDatetimeLocalInput, toDateInput } =
  await import('../src/lib/datetime-local.ts')

let pass = 0
const ok = (n) => { pass++; console.log(`  ✓ ${n}`) }
const shown = (iso) => new Intl.DateTimeFormat('en-US',
  { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))

const zone = process.env.TZ ?? 'UTC'
console.log(`\nopen-and-save must not move the event  [TZ=${zone}]`)

// Every hour of the day, and the DST boundaries where naive maths breaks.
const cases = []
for (let h = 0; h < 24; h++) cases.push(`2026-07-29T${String(h).padStart(2, '0')}:30:00`)
cases.push('2026-03-08T01:30:00', '2026-03-08T03:30:00')  // US spring-forward
cases.push('2026-11-01T00:30:00', '2026-11-01T02:30:00')  // US fall-back
cases.push('2026-12-31T23:30:00', '2026-01-01T00:30:00')  // year boundary

let moved = 0
for (const wall of cases) {
  const storedISO = new Date(wall).toISOString()      // what the DB holds
  const prefilled = toDatetimeLocalInput(storedISO)   // what the form shows
  const resaved = new Date(prefilled).toISOString()   // what Save writes back
  if (resaved !== storedISO) {
    moved++
    console.log(`  ✗ ${wall}: ${shown(storedISO)} -> ${shown(resaved)}`)
  }
}
assert.equal(moved, 0, `${moved} of ${cases.length} cases moved`)
ok(`${cases.length} timestamps survive open-and-save unchanged (all 24 hours, both DST transitions, year boundary)`)

// And it must stay stable over repeated saves — the old bug compounded.
let iso = new Date('2026-07-29T19:30:00').toISOString()
const first = iso
for (let i = 0; i < 5; i++) iso = new Date(toDatetimeLocalInput(iso)).toISOString()
assert.equal(iso, first, 'five successive saves must be a no-op')
ok('five successive saves leave it identical (the old bug compounded every time)')

// The old implementation, to show the test would have caught it. At UTC+0 the
// old code was accidentally correct, which is exactly why this went unnoticed
// by anyone developing in UTC — so skip the assertion rather than fail there.
const offset = -new Date(first).getTimezoneOffset()
const broken = new Date(first.slice(0, 16)).toISOString()
if (offset === 0) {
  ok('at UTC+0 the old `iso.slice(0,16)` was accidentally correct — why this hid so long')
} else {
  assert.notEqual(broken, first)
  ok(`the previous \`iso.slice(0,16)\` moves it ${shown(first)} -> ${shown(broken)} — caught`)
}

// All-day dates must resolve to the local calendar day.
const allDay = new Date('2026-05-24T00:00:00').toISOString()
assert.equal(toDateInput(allDay), '2026-05-24')
ok('an all-day event keeps its local date')

console.log(`\n${pass} checks passed.\n`)
