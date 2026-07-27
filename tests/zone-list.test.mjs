// Finding one zone among four hundred, on a phone.
//
// The plan left picker usability as step 4's open question. This is the answer:
// recents first, then where you are, then everything else, with a search that
// works the way someone actually types. Tested here rather than in the component
// so the ordering is a fact rather than a screenshot.
//
// See docs/design/timezones/per-event-timezone-plan.md

import assert from 'node:assert/strict'

const { allTimeZones, prettyZone, rankZones, isUsableZone, DEFAULT_LIMIT } =
  await import('../src/lib/zone-list.ts')

let pass = 0
const ok = (n) => { pass++; console.log(`  ✓ ${n}`) }
console.log('\nchoosing a zone')

// ── The candidate set ───────────────────────────────────────────────────
const zones = allTimeZones()
assert.ok(zones.length > 300, `expected the full IANA set, got ${zones.length}`)
assert.ok(zones.includes('Europe/Monaco'))
assert.ok(zones.includes('America/New_York'))
ok(`the engine offers ${zones.length} zones — which is exactly why this is not a <select>`)

// UTC has to be added by hand: supportedValuesOf returns canonical names only,
// with no UTC and no Etc/* entry, while Intl.DateTimeFormat accepts UTC fine.
// Without this the one zone a technical user reaches for first is unpickable,
// and an event already on it gets no checkmark.
assert.ok(zones.includes('UTC'), 'UTC must be offered even though supportedValuesOf omits it')
assert.deepEqual(rankZones({ query: 'utc', recents: [], device: null, zones }), ['UTC'])
ok('UTC is searchable, though the canonical IANA list does not contain it')

// ── Legacy aliases ──────────────────────────────────────────────────────
// Google returns these for older calendars. Every engine resolves them; the
// canonical list omits them. Validity is therefore what Intl accepts.
assert.ok(isUsableZone('US/Eastern'), 'engines resolve the legacy alias')
assert.ok(!zones.includes('US/Eastern'), 'and the canonical list omits it')
assert.ok(!isUsableZone('Mars/Olympus_Mons'))
ok('a legacy alias like US/Eastern is usable even though the canonical list omits it')

const withAlias = rankZones({ query: '', recents: [], device: null, zones, current: 'US/Eastern' })
assert.equal(withAlias[0], 'US/Eastern')
ok("an event's own zone stays selectable even as an alias — otherwise its row has no checkmark")

// ── Display, and why search needs it ────────────────────────────────────
assert.equal(prettyZone('Europe/Monaco'), 'Europe / Monaco')
assert.equal(prettyZone('America/New_York'), 'America / New York')
assert.equal(prettyZone('America/Argentina/Buenos_Aires'), 'America / Argentina/Buenos Aires')
assert.equal(prettyZone('UTC'), 'UTC')
ok('underscores become spaces — nobody types New_York, so the raw name cannot be what is matched')

// ── Search ──────────────────────────────────────────────────────────────
const opts = { recents: [], device: null, zones }

assert.deepEqual(rankZones({ ...opts, query: 'monaco' }), ['Europe/Monaco'])
ok('"monaco" finds exactly one zone')

const newYork = rankZones({ ...opts, query: 'new york' })
assert.ok(newYork.includes('America/New_York'), 'a space must match the underscore')
ok('"new york" — with a space — finds America/New_York, the case a raw substring search fails')

assert.ok(rankZones({ ...opts, query: 'NEW YORK' }).includes('America/New_York'))
assert.ok(rankZones({ ...opts, query: '  new   york  ' }).includes('America/New_York'))
ok('case and sloppy spacing do not matter')

const paris = rankZones({ ...opts, query: 'paris' })
assert.deepEqual(paris, ['Europe/Paris'])
ok('"paris" is unambiguous')

// Partial and continent-wide searches still narrow usefully.
assert.ok(rankZones({ ...opts, query: 'europe' }).every((z) => z.startsWith('Europe/')))
assert.ok(rankZones({ ...opts, query: 'auck' }).includes('Pacific/Auckland'))
ok('a continent narrows to that continent, and a partial name still finds its zone')

assert.deepEqual(rankZones({ ...opts, query: 'atlantis' }), [])
ok('a query that matches nothing returns nothing, so the picker can say so')

// ── Ordering: recents, then device, then the rest ───────────────────────
const ranked = rankZones({
  query: '',
  recents: ['Europe/Monaco', 'Asia/Singapore'],
  device: 'America/New_York',
  zones,
})
assert.deepEqual(ranked.slice(0, 3), ['Europe/Monaco', 'Asia/Singapore', 'America/New_York'])
ok('with nothing typed: recents in order, then the device zone, then everything else')

// The device zone must not be duplicated when it is also a recent.
const deviceIsRecent = rankZones({
  query: '',
  recents: ['America/New_York', 'Europe/Monaco'],
  device: 'America/New_York',
  zones,
})
assert.deepEqual(deviceIsRecent.slice(0, 2), ['America/New_York', 'Europe/Monaco'])
assert.equal(deviceIsRecent.filter((z) => z === 'America/New_York').length, 1)
ok('a device zone that is also a recent appears once — two identical rows would be a coin toss')

// And no zone may appear twice anywhere in the list.
const all = rankZones({ query: '', recents: ['Europe/Monaco'], device: 'Europe/Monaco', zones, limit: 500 })
assert.equal(new Set(all).size, all.length, 'the list contains a duplicate')
ok('no zone appears twice in the whole list')

// Recents lead even when filtered, so a search does not lose the shortcut.
const filteredRecents = rankZones({
  query: 'europe',
  recents: ['Europe/Monaco'],
  device: 'America/New_York',
  zones,
})
assert.equal(filteredRecents[0], 'Europe/Monaco')
ok('a recent still leads once you start typing — searching does not discard the shortcut')

// ── A recent the engine no longer knows ─────────────────────────────────
// Offering it would mean a row that Intl then rejects.
const stale = rankZones({
  query: '',
  recents: ['Mars/Olympus_Mons', 'Europe/Monaco'],
  device: null,
  zones,
})
assert.equal(stale[0], 'Europe/Monaco')
assert.ok(!stale.includes('Mars/Olympus_Mons'))
ok('a stale recent this engine does not publish is dropped rather than offered and then refused')

// ── The cap ─────────────────────────────────────────────────────────────
assert.equal(rankZones({ ...opts, query: '' }).length, DEFAULT_LIMIT)
assert.equal(rankZones({ ...opts, query: '', limit: 5 }).length, 5)
assert.ok(rankZones({ ...opts, query: 'america', limit: 3 }).length <= 3)
ok(`the list is capped at ${DEFAULT_LIMIT} by default, so a phone renders a chooser rather than a scroll`)

// A null device is a supported state — deviceTimeZone() can return null.
const noDevice = rankZones({ query: '', recents: [], device: null, zones })
assert.equal(noDevice.length, DEFAULT_LIMIT)
ok('a browser that will not name its zone still gets a usable list')

console.log(`\n${pass} checks passed.\n`)
