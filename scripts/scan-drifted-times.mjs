/**
 * Find rows whose stored time may have been moved by the pre-fix dialog bug.
 *
 *   node --env-file=.env.local scripts/scan-drifted-times.mjs --tz=America/New_York
 *
 * READ ONLY. It writes nothing, by design — see scripts/lib/drift-scan.mjs for
 * why repairing this automatically would be guessing. Fix what it finds by
 * opening the row in the app; the dialogs no longer drift.
 *
 * Options:
 *   --tz=<IANA zone>   Zone to read the stored instants in. Use the zone the
 *                      device was set to, which is not necessarily where it
 *                      was. Defaults to this machine's zone.
 *   --fixed-at=<ISO>   When the dialog fix reached production. Rows last edited
 *                      after this are clean. Defaults to the merge of #36.
 *   --all              Also list rows nothing is suspicious about.
 *   --json             Machine-readable output.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Node 22's
 * --env-file reads .env.local without adding a dotenv dependency.
 */

import { createClient } from '@supabase/supabase-js'
import { classifyRow, rankFindings } from './lib/drift-scan.mjs'

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const flag = (name) => process.argv.includes(`--${name}`)

const timeZone = arg('tz', Intl.DateTimeFormat().resolvedOptions().timeZone)
// PR #36 (63cd9ea) carried the datetime-local fix.
const fixedAt = arg('fixed-at', '2026-07-27T00:00:00Z')
const asJson = flag('json')

try {
  new Intl.DateTimeFormat('en-GB', { timeZone })
} catch {
  console.error(`Unknown timezone: ${timeZone}`)
  process.exit(1)
}
if (!Number.isFinite(Date.parse(fixedAt))) {
  console.error(`--fixed-at is not a date: ${fixedAt}`)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Run with:  node --env-file=.env.local scripts/scan-drifted-times.mjs'
  )
  process.exit(1)
}

const supabase = createClient(url, key)

const [events, posts] = await Promise.all([
  supabase
    .from('calendar_events')
    .select('id, title, starts_at, all_day, source, created_at, updated_at')
    .order('starts_at'),
  supabase
    .from('social_posts')
    .select('id, title, scheduled_at, stage, publish_status, created_at, updated_at')
    .not('scheduled_at', 'is', null)
    .order('scheduled_at'),
])

for (const [label, res] of [['calendar_events', events], ['social_posts', posts]]) {
  if (res.error) {
    console.error(`Could not read ${label}: ${res.error.message}`)
    process.exit(1)
  }
}

const findings = rankFindings([
  ...events.data.map((r) => classifyRow(r, { kind: 'event', timeZone, fixedAt })),
  ...posts.data.map((r) => classifyRow(r, { kind: 'post', timeZone, fixedAt })),
])

if (asJson) {
  console.log(JSON.stringify({ timeZone, fixedAt, scanned: events.data.length + posts.data.length, findings }, null, 2))
  process.exit(0)
}

const MARK = { CERTAIN: '■', HIGH: '▲', LOW: '·' }

console.log(`\nScanned ${events.data.length} events and ${posts.data.length} scheduled posts.`)
console.log(`Reading stored instants in ${timeZone}; treating anything edited after ${fixedAt} as clean.\n`)

if (findings.length === 0) {
  console.log('Nothing looks moved. Note that this cannot see a drift that happens')
  console.log('to have landed on a plausible hour — it narrows the search, it does')
  console.log('not clear the data.\n')
  process.exit(0)
}

for (const f of findings) {
  const where = f.kind === 'post' ? 'POST ' : 'EVENT'
  console.log(`${MARK[f.severity]} ${f.severity.padEnd(7)} ${where}  ${f.title}`)
  console.log(`             ${f.local}   (stored ${f.storedUtc})`)
  for (const r of f.reasons) console.log(`             — ${r}`)
  console.log(`             id ${f.id}`)
  console.log()
}

const certain = findings.filter((f) => f.severity === 'CERTAIN').length
const posts_ = findings.filter((f) => f.kind === 'post').length

console.log(`${findings.length} to look at — ${certain} certain, ${posts_} of them scheduled posts.`)
console.log('Scheduled posts first: a shifted scheduled_at mis-times a publish,')
console.log('where a shifted event only shows at the wrong time.')
console.log('\nOpen each in the app and set the time it should be. The dialogs no')
console.log('longer drift, so saving now stores exactly what you enter.\n')
