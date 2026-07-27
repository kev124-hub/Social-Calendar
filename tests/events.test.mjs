// Harness for src/lib/events.ts — the app-side write choke point.
// Proves payload equivalence with the pre-extraction call sites, the error
// contract, and (Stage 9) that a failed Google push never costs you the write.

import assert from 'node:assert/strict'

const {
  createEvent, updateEvent, deleteEvent, createEventFromParsed, stripTimeZone,
} = await import('../src/lib/events.ts')

// ── Fake supabase client ────────────────────────────────────────────────
// Supports the shapes events.ts actually uses:
//   .from(t).insert(p).select('id').single()
//   .from(t).update(p).eq('id', id)
//   .from(t).delete().eq('id', id)
//   .from(t).select('external_id').eq('id', id).single()
function fakeClient({ failWith = null, row = { id: 'new-id' }, readFailWith = null } = {}) {
  const calls = []
  function chain(op, payload) {
    const rec = { table: null, op, payload, eq: null }
    calls.push(rec)
    const isRead = op === 'select'
    const settle = () => isRead
      ? { data: readFailWith ? null : row, error: readFailWith }
      : { data: failWith ? null : row, error: failWith }
    const t = {
      select() { return t },
      single() { return t },
      eq(c, v) { rec.eq = [c, v]; return t },
      then(res) { return Promise.resolve(settle()).then(res) },
    }
    return t
  }
  return {
    calls,
    from(table) {
      const bind = (op) => (payload) => { const t = chain(op, payload); calls.at(-1).table = table; return t }
      return {
        insert: bind('insert'), update: bind('update'), select: bind('select'),
        delete: () => { const t = chain('delete', undefined); calls.at(-1).table = table; return t },
      }
    },
  }
}

// ── Fake /api/google-calendar/push ──────────────────────────────────────
let pushCalls = []
function stubFetch({ ok = true, status = 502, error = 'Google API error 503' } = {}) {
  globalThis.fetch = async (url, init) => {
    pushCalls.push({ url, body: JSON.parse(init.body) })
    return {
      ok,
      status: ok ? 200 : status,
      json: async () => (ok ? { ok: true, externalId: 'g-abc' } : { error }),
    }
  }
}
/** Simulates the connection dropping before the request leaves the device. */
function stubFetchThrows(message = 'Load failed') {
  globalThis.fetch = async () => { throw new TypeError(message) }
}

// ── The ORIGINAL implementation, copied verbatim from ca2fa85 ───────────
async function originalHandleAIEvent(supabase, parsed, calendars) {
  const defaultCalendar = calendars.find((c) => c.source === 'app') ?? calendars[0]
  const toISO = (s, isEnd) => {
    if (parsed.all_day) return new Date(s + (isEnd ? 'T23:59:59' : 'T00:00:00')).toISOString()
    return new Date(s).toISOString()
  }
  const { error } = await supabase.from('calendar_events').insert({
    title: parsed.title, description: parsed.description, location: parsed.location,
    starts_at: toISO(parsed.starts_at),
    ends_at: parsed.ends_at ? toISO(parsed.ends_at, true) : null,
    all_day: parsed.all_day, calendar_id: defaultCalendar?.id ?? null, source: 'app',
  })
  if (error) throw new Error(`Could not save the event: ${error.message}`)
}

const CALENDARS = [
  { id: 'g1', name: 'Google', source: 'google' },
  { id: 'a1', name: 'Mustache', source: 'app' },
]
const FIELDS = { title: 'x', description: null, location: null, starts_at: '2026-01-01T00:00:00Z', ends_at: null, all_day: false, calendar_id: null }

let pass = 0
const ok = (n) => { pass++; console.log(`  ✓ ${n}`) }

// ── 1. payload equivalence with the pre-extraction code ─────────────────
stubFetch()
console.log('\ncreateEventFromParsed vs original handleAIEvent:')
const PARSES = [
  ['timed, full fields', { title: 'Dinner at Cipriani', starts_at: '2026-08-03T19:30:00', ends_at: '2026-08-03T22:00:00', all_day: false, location: 'Monaco', description: 'Table for 4' }],
  ['timed, no end', { title: 'Call', starts_at: '2026-08-03T09:00:00', ends_at: null, all_day: false, location: null, description: null }],
  ['all-day, bare dates', { title: 'Monaco GP', starts_at: '2026-05-24', ends_at: '2026-05-24', all_day: true, location: null, description: null }],
  ['all-day, multi-day span', { title: 'Le Mans', starts_at: '2026-06-13', ends_at: '2026-06-14', all_day: true, location: 'Circuit de la Sarthe', description: null }],
]
for (const [name, parsed] of PARSES) {
  const a = fakeClient(), b = fakeClient()
  await createEventFromParsed(a, parsed, CALENDARS)
  await originalHandleAIEvent(b, parsed, CALENDARS)
  assert.deepEqual(a.calls[0].payload, b.calls[0].payload, name)
  assert.equal(a.calls[0].table, 'calendar_events')
  ok(`${name} — insert payload still identical`)
}
const p = PARSES[0][1]

// ── 2. default-calendar resolution ──────────────────────────────────────
console.log('\ndefault calendar resolution:')
for (const [name, cals, expected] of [
  ['prefers first app calendar', CALENDARS, 'a1'],
  ['falls back to first when no app calendar', [{ id: 'g1', source: 'google' }], 'g1'],
  ['null when no calendars at all', [], null],
]) {
  const c = fakeClient()
  await createEventFromParsed(c, p, cals)
  assert.equal(c.calls[0].payload.calendar_id, expected)
  ok(name)
}

// ── 3. Stage 9 contract ─────────────────────────────────────────────────
console.log('\nStage 9 — push to Google:')
{
  pushCalls = []; stubFetch()
  const c = fakeClient()
  const r = await createEvent(c, FIELDS)
  assert.equal(r.pushedToGoogle, true)
  ok('successful create reports pushedToGoogle: true')
  assert.equal(pushCalls.length, 1)
  assert.equal(pushCalls[0].url, '/api/google-calendar/push')
  assert.equal(pushCalls[0].body.op, 'upsert')
  assert.equal(pushCalls[0].body.eventId, 'new-id', 'pushes the id the insert returned')
  ok('pushes the newly inserted row id to the push route')
  assert.ok(pushCalls[0].body.timeZone, 'a timezone must always be sent')
  ok(`sends the browser timezone (${pushCalls[0].body.timeZone}) — all-day dates need it`)
  assert.ok(!('external_id' in c.calls[0].payload))
  ok('insert still leaves external_id unset — the push backfills it')
}
{
  // The whole point: Google being down must not lose the event.
  pushCalls = []; stubFetch({ ok: false, error: 'Google API error 503: backend error' })
  const c = fakeClient()
  const r = await createEvent(c, FIELDS)
  assert.equal(r.pushedToGoogle, false)
  assert.match(r.pushError, /503/)
  ok('Google 5xx -> pushedToGoogle false, does NOT throw (row is saved)')
  assert.equal(c.calls[0].op, 'insert', 'the insert still happened')
  ok('the local insert is never rolled back by a push failure')
}
{
  pushCalls = []; stubFetchThrows()
  const r = await createEvent(fakeClient(), FIELDS)
  assert.equal(r.pushedToGoogle, false)
  assert.match(r.pushError, /Load failed/)
  ok('dropped connection during push -> reported, not thrown')
}

// ── 4. delete must not leave a ghost in Google ──────────────────────────
console.log('\ndelete:')
{
  pushCalls = []; stubFetch()
  const c = fakeClient({ row: { external_id: 'g-xyz' } })
  const r = await deleteEvent(c, 'evt-9')
  assert.equal(c.calls[0].op, 'select', 'must read external_id BEFORE deleting')
  assert.equal(c.calls[1].op, 'delete')
  ok('reads external_id before the row is gone, then deletes')
  assert.deepEqual(c.calls[1].eq, ['id', 'evt-9'])
  ok('deletes exactly one id')
  assert.equal(pushCalls[0].body.op, 'delete')
  assert.equal(pushCalls[0].body.externalId, 'g-xyz')
  ok('asks Google to remove the same event — no ghost left behind')
  assert.equal(r.pushedToGoogle, true)
}
{
  pushCalls = []; stubFetch()
  const r = await deleteEvent(fakeClient({ row: { external_id: null } }), 'evt-1')
  assert.equal(pushCalls.length, 0, 'nothing to delete in Google')
  assert.equal(r.pushedToGoogle, true)
  ok('an event never pushed does not call Google at all')
}

// ── 5. update ───────────────────────────────────────────────────────────
console.log('\nupdate:')
{
  pushCalls = []; stubFetch()
  const c = fakeClient()
  await updateEvent(c, 'evt-1', { title: 'Renamed' })
  assert.ok(!('source' in c.calls[0].payload), 'must not rewrite provenance')
  ok('updateEvent does NOT stamp source (a pulled Google row stays Google)')
  assert.deepEqual(c.calls[0].eq, ['id', 'evt-1'])
  assert.equal(pushCalls[0].body.eventId, 'evt-1')
  ok('an edit is mirrored to Google as an upsert')
}

// ── 6. database failures still throw ────────────────────────────────────
console.log('\nerror contract — a DB refusal is still fatal and still thrown:')
stubFetch()
const RLS = { message: 'new row violates row-level security policy' }
for (const [name, run, expected] of [
  ['createEvent', (c) => createEvent(c, FIELDS), `Could not save the event: ${RLS.message}`],
  ['updateEvent', (c) => updateEvent(c, 'id', { title: 'x' }), `Could not save the event: ${RLS.message}`],
  ['deleteEvent', (c) => deleteEvent(c, 'id'), `Could not delete the event: ${RLS.message}`],
  ['createEventFromParsed', (c) => createEventFromParsed(c, p, CALENDARS), `Could not save the event: ${RLS.message}`],
]) {
  await assert.rejects(() => run(fakeClient({ failWith: RLS })), (e) => {
    assert.equal(e.message, expected); return true
  }, name)
  ok(`${name} throws "${expected}"`)
}

// ── 7. network failure vs database refusal ──────────────────────────────
console.log('\nnetwork failure is reported differently from a DB refusal:')
for (const raw of ['TypeError: Load failed', 'Failed to fetch', 'NetworkError when attempting to fetch resource', 'fetch failed']) {
  await assert.rejects(() => createEvent(fakeClient({ failWith: { message: raw } }), FIELDS), (e) => {
    assert.ok(e.message.includes('may or may not have been saved'))
    assert.ok(e.message.includes('Check your calendar before trying again'))
    assert.ok(e.message.includes(raw), 'keeps the underlying cause')
    assert.ok(!/^Could not save the event/.test(e.message))
    return true
  })
  ok(`"${raw}" -> ambiguous-write wording`)
}
await assert.rejects(() => deleteEvent(fakeClient({ failWith: { message: 'Load failed' } }), 'id'),
  (e) => e.message.includes('may or may not have been deleted'))
ok('delete uses "deleted", not "saved"')
for (const raw of ['new row violates row-level security policy', 'duplicate key value violates unique constraint']) {
  await assert.rejects(() => createEvent(fakeClient({ failWith: { message: raw } }), FIELDS),
    (e) => { assert.equal(e.message, `Could not save the event: ${raw}`); return true })
  ok(`DB refusal "${raw.slice(0, 28)}…" keeps definitive wording`)
}


// ── 8. a model-supplied timezone must not move the event ────────────────
// Reported live: "Wednesday 2:30pm" stored and displayed as 10:30pm on a
// device manually set to UTC+8. The model had appended a `Z`, so new Date()
// read a wall-clock reading as an absolute instant.
console.log('\nwall-clock guarantee (the 2:30pm -> 10:30pm bug):')
for (const [raw, expected] of [
  ['2026-07-29T14:30:00', '2026-07-29T14:30:00'],
  ['2026-07-29T14:30:00Z', '2026-07-29T14:30:00'],
  ['2026-07-29T14:30:00z', '2026-07-29T14:30:00'],
  ['2026-07-29T14:30:00.000Z', '2026-07-29T14:30:00.000'],
  ['2026-07-29T14:30:00+05:30', '2026-07-29T14:30:00'],
  ['2026-07-29T14:30:00-0800', '2026-07-29T14:30:00'],
  ['2026-05-22', '2026-05-22'],
  ['2026-05-22Z', '2026-05-22'],
]) {
  assert.equal(stripTimeZone(raw), expected, raw)
  ok(`${raw.padEnd(26)} -> ${expected}`)
}

// The whole point: the stored instant must depend on the DEVICE zone, never on
// whatever the model tacked onto the string.
console.log('\nsame wall clock regardless of what the model appended:')
for (const suffix of ['', 'Z', '.000Z', '+05:30', '-08:00']) {
  stubFetch()
  const c = fakeClient()
  await createEventFromParsed(c, {
    title: 'Wednesday meeting', starts_at: '2026-07-29T14:30:00' + suffix,
    ends_at: null, all_day: false, location: null, description: null,
  }, CALENDARS)
  const stored = c.calls[0].payload.starts_at
  // Read it back the way the app displays it — in the local zone.
  const shown = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(stored))
  assert.equal(shown, '2:30 PM', `suffix "${suffix}" must still read back as 2:30 PM`)
  ok(`model appended "${suffix || '(nothing)'}" -> still displays 2:30 PM`)
}


// ── 9. a dead Google token names itself ─────────────────────────────────
// A dropped connection fixes itself on the next sync; a dead token never does,
// so it must not hide behind the same "not in Google yet" wording.
console.log('\ndead-token detection:')
for (const [msg, expected] of [
  ['Not authenticated with Google', true],
  ['Google API error 401: invalid_token', true],
  ['Google API error 403: insufficient permissions', true],
  ['invalid_grant', true],
  ['Google API error 503: backend error', false],
  ['Load failed', false],
]) {
  stubFetch({ ok: false, error: msg })
  const r = await createEvent(fakeClient(), FIELDS)
  assert.equal(r.pushedToGoogle, false)
  assert.equal(Boolean(r.needsGoogleReconnect), expected, msg)
  ok(`"${msg}" -> ${expected ? 'tells you to reconnect' : 'transient, sweep retries'}`)
}

console.log(`\n${pass} checks passed.\n`)
