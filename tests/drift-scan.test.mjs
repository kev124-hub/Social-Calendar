// Harness for scripts/lib/drift-scan.mjs — the triage rules for the pre-fix
// timestamp drift. The classifier reads instants in a NAMED zone rather than
// the machine's, so these must hold whatever TZ the runner is in; that is the
// property most worth pinning, since the bug being hunted was invisible at UTC.

import assert from 'node:assert/strict'
import { classifyRow, wasEditedBeforeFix, localParts, rankFindings } from '../scripts/lib/drift-scan.mjs'

let pass = 0
const ok = (m) => { console.log(`  ✓ ${m}`); pass++ }

const FIXED_AT = '2026-07-27T00:00:00Z'
const clean = { created_at: '2026-06-01T10:00:00Z', updated_at: '2026-06-01T10:00:00Z' }
const edited = { created_at: '2026-06-01T10:00:00Z', updated_at: '2026-06-02T10:00:00Z' }

// ── 1. zone handling is explicit, never the machine's ───────────────────
console.log('\nlocalParts reads the zone it is given:')
{
  // One instant, three zones, three different local days and hours.
  const iso = '2026-08-01T03:30:00Z'
  assert.equal(localParts(iso, 'UTC').hour, 3)
  assert.equal(localParts(iso, 'America/New_York').hour, 23) // previous day
  assert.equal(localParts(iso, 'Asia/Singapore').hour, 11)
  ok('same instant reads as 03:00 UTC / 23:00 New York / 11:00 Singapore')

  assert.match(localParts(iso, 'America/New_York').label, /31 Jul 2026/)
  ok('the label rolls back a day where the zone does')
}

// ── 2. the all-day invariant — the one exact signal ─────────────────────
// Every correct path writes an all-day row at LOCAL midnight, so a non-midnight
// local time is proof of a move rather than a judgement call.
console.log('\nall-day rows must sit at local midnight:')
{
  const atLocalMidnightNY = { id: 'a', title: 'Monaco', all_day: true, starts_at: '2026-08-01T04:00:00Z', ...clean }
  assert.equal(classifyRow(atLocalMidnightNY, { kind: 'event', timeZone: 'America/New_York', fixedAt: FIXED_AT }), null)
  ok('midnight in the reading zone -> not flagged')

  const moved = { id: 'b', title: 'Monaco', all_day: true, starts_at: '2026-08-01T08:00:00Z', ...clean }
  const f = classifyRow(moved, { kind: 'event', timeZone: 'America/New_York', fixedAt: FIXED_AT })
  assert.equal(f.severity, 'CERTAIN')
  assert.match(f.reasons[0], /not midnight/)
  ok('4am local on an all-day row -> CERTAIN, no edit history needed')

  // The same instant IS midnight elsewhere — which is the whole reason the zone
  // is a parameter and not `new Date().getHours()`.
  assert.equal(classifyRow(moved, { kind: 'event', timeZone: 'Asia/Singapore', fixedAt: FIXED_AT })?.severity, 'CERTAIN')
  assert.equal(classifyRow({ ...moved, starts_at: '2026-07-31T16:00:00Z' },
    { kind: 'event', timeZone: 'Asia/Singapore', fixedAt: FIXED_AT }), null)
  ok('the verdict follows the zone given, not the runner’s')
}

// ── 3. edit history is a filter, not a verdict ──────────────────────────
console.log('\nedited-before-the-fix:')
{
  assert.equal(wasEditedBeforeFix(clean, FIXED_AT), false)
  ok('created and never touched -> not a candidate')
  assert.equal(wasEditedBeforeFix(edited, FIXED_AT), true)
  ok('edited while the bug was live -> candidate')
  assert.equal(wasEditedBeforeFix({ created_at: '2026-06-01T10:00:00Z', updated_at: '2026-07-28T10:00:00Z' }, FIXED_AT), false)
  ok('edited after the fix -> clean, the dialog no longer drifts')

  // A write that merely re-saved the same row microseconds later is not an edit.
  assert.equal(wasEditedBeforeFix({ created_at: '2026-06-01T10:00:00Z', updated_at: '2026-06-01T10:00:01Z' }, FIXED_AT), false)
  ok('a sub-second updated_at is creation noise, not a save')
}

// ── 4. timed rows: the hour is the only tell ────────────────────────────
// A whole-hour shift preserves the minutes, so minutes prove nothing.
console.log('\ntimed rows:')
{
  const opts = { kind: 'post', timeZone: 'America/New_York', fixedAt: FIXED_AT }
  const threeAm = { id: 'c', title: 'Reel', all_day: false, scheduled_at: '2026-08-01T07:30:00Z', ...edited }
  const f = classifyRow(threeAm, opts)
  assert.equal(f.severity, 'HIGH')
  assert.equal(f.reasons.length, 2, 'implausible hour AND an edit')
  ok('3:30am + edited while buggy -> HIGH')

  // Same odd hour, never edited: still worth a look, but not the same claim.
  assert.equal(classifyRow({ ...threeAm, ...clean }, opts).severity, 'LOW')
  ok('3:30am but never edited -> LOW, reported without overclaiming')

  // A sane hour with an edit is not evidence of anything on its own.
  const twoPm = { id: 'd', title: 'Reel', all_day: false, scheduled_at: '2026-08-01T18:00:00Z', ...edited }
  assert.equal(classifyRow(twoPm, opts).severity, 'LOW')
  ok('2pm + edited -> LOW; an edit alone is not a drift')

  assert.equal(classifyRow({ id: 'e', title: 'x', scheduled_at: null, ...edited }, opts), null)
  ok('no scheduled time -> nothing to say')
}

// ── 5. ordering puts the costly failures first ──────────────────────────
console.log('\nranking:')
{
  const opts = { timeZone: 'America/New_York', fixedAt: FIXED_AT }
  const ranked = rankFindings([
    classifyRow({ id: 'p-low', title: 'p', all_day: false, scheduled_at: '2026-08-01T18:00:00Z', ...edited }, { ...opts, kind: 'post' }),
    classifyRow({ id: 'e-cert', title: 'e', all_day: true, starts_at: '2026-08-01T08:00:00Z', ...clean }, { ...opts, kind: 'event' }),
    classifyRow({ id: 'p-high', title: 'p', all_day: false, scheduled_at: '2026-08-01T07:30:00Z', ...edited }, { ...opts, kind: 'post' }),
  ])
  assert.deepEqual(ranked.map((r) => r.id), ['e-cert', 'p-high', 'p-low'])
  ok('certain first, then high, then low')

  // At equal severity a post outranks an event: one mis-times a publish.
  const tie = rankFindings([
    classifyRow({ id: 'evt', title: 'e', all_day: false, starts_at: '2026-08-01T07:30:00Z', ...edited }, { ...opts, kind: 'event' }),
    classifyRow({ id: 'post', title: 'p', all_day: false, scheduled_at: '2026-08-01T07:30:00Z', ...edited }, { ...opts, kind: 'post' }),
  ])
  assert.equal(tie[0].id, 'post')
  ok('at equal suspicion the scheduled post is listed first')
}

console.log(`\n${pass} checks passed.\n`)
