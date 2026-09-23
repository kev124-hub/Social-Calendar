// The decisions behind Instagram token upkeep (src/lib/ig-token-policy.ts).
//
// Guards the 23 Sept 2026 outage: Meta answered every refresh with the token's
// REMAINING lifetime, the app stored that as a "refresh", and no warning fired
// until four minutes after the token died. Also guards the manual fix that did
// not work: setting a new token in Vercel was ignored while a stale DB row won.

import assert from 'node:assert/strict'

const {
  REFRESH_WHEN_DAYS_LEFT,
  ROTATION_STEPS,
  daysUntil,
  envTokenDecision,
  expiredWarning,
  notExtendedWarning,
  refreshExtended,
  refreshFailingWarning,
  tokenFingerprint,
} = await import('../src/lib/ig-token-policy.ts')

const DAY = 24 * 60 * 60 * 1000

// --- refreshExtended ---------------------------------------------------------

// The real 23 Sept rows: expiry 15:31:41.784Z, "refreshed" at 15:30:10 with an
// expiry computed as now + expires_in — i.e. the same instant, give or take ms.
{
  const old = new Date('2026-09-23T15:31:41.784Z')
  const echoed = new Date('2026-09-23T15:31:41.784Z')
  assert.equal(refreshExtended(old, echoed), false, 'same expiry is not a refresh')

  const jitter = new Date(old.getTime() + 5_000)
  assert.equal(refreshExtended(old, jitter), false, 'seconds of rounding drift is not a refresh')

  const earlier = new Date(old.getTime() - DAY)
  assert.equal(refreshExtended(old, earlier), false, 'an earlier expiry is not a refresh')

  const fresh = new Date(old.getTime() + 50 * DAY)
  assert.equal(refreshExtended(old, fresh), true, 'a real 60-day renewal counts')

  assert.equal(refreshExtended(old, null), true, 'a non-expiring token counts')
  assert.equal(refreshExtended(null, fresh), true, 'nothing to compare against counts')
}

// --- daysUntil ---------------------------------------------------------------

{
  const now = new Date('2026-09-23T15:30:10Z')
  assert.equal(daysUntil(new Date('2026-09-23T15:31:41Z'), now), 0)
  assert.equal(daysUntil(new Date('2026-09-23T15:29:00Z'), now), -1, 'just expired floors to -1')
  assert.equal(daysUntil(new Date(now.getTime() + 10 * DAY), now), 10)
  assert.equal(REFRESH_WHEN_DAYS_LEFT, 10)
}

// --- envTokenDecision --------------------------------------------------------

{
  const a = tokenFingerprint('token-a')
  const b = tokenFingerprint('token-b')

  // Kevin sets a new token in Vercel: it must win over the stale DB row.
  assert.equal(envTokenDecision({ envFingerprint: b, storedFingerprint: a }), 'adopt-env')
  assert.equal(envTokenDecision({ envFingerprint: a, storedFingerprint: a }), 'keep')
  // First run of this code: record, don't guess — the DB may hold a newer
  // refreshed token than the env bootstrap value.
  assert.equal(envTokenDecision({ envFingerprint: a, storedFingerprint: null }), 'baseline')
  assert.equal(envTokenDecision({ envFingerprint: null, storedFingerprint: a }), 'keep')
  assert.equal(envTokenDecision({ envFingerprint: null, storedFingerprint: null }), 'keep')
}

// --- tokenFingerprint --------------------------------------------------------

{
  const fp = tokenFingerprint('EAAabc123')
  assert.equal(fp.length, 16)
  assert.ok(!fp.includes('EAA'), 'the fingerprint never contains the token')
  assert.equal(tokenFingerprint('EAAabc123'), tokenFingerprint('  EAAabc123\n'), 'pasted whitespace ignored')
  assert.notEqual(tokenFingerprint('EAAabc123'), tokenFingerprint('EAAabc124'))
}

// --- warnings ----------------------------------------------------------------

{
  // Every warning carries the full manual procedure, including the extend step
  // (the Explorer token alone lasts an hour) and no database step.
  for (const w of [
    expiredWarning(),
    notExtendedWarning(7),
    refreshFailingWarning(3, 'Exchange long-lived token failed (400)'),
  ]) {
    assert.ok(w.body.includes(ROTATION_STEPS))
  }
  assert.ok(ROTATION_STEPS.includes('Extend Access Token'))
  assert.ok(ROTATION_STEPS.includes('INSTAGRAM_USER_ACCESS_TOKEN'))
  assert.ok(!/delete|sql|supabase/i.test(ROTATION_STEPS), 'no database step')

  assert.match(notExtendedWarning(9).subject, /9 day/)
  assert.match(refreshFailingWarning(2, 'boom').body, /boom/)
  assert.match(expiredWarning().subject, /stopped/)
}

console.log('ig-token: all assertions passed')
