/**
 * Classification for the pre-fix timestamp drift. Pure functions, no IO, so the
 * rules can be tested without credentials — see tests/drift-scan.test.mjs.
 *
 * THE BUG THIS LOOKS FOR
 *
 * Before `src/lib/datetime-local.ts` existed, both edit dialogs prefilled their
 * `<input type="datetime-local">` with `iso.slice(0, 16)`. That puts a UTC wall
 * clock into a field that is local by definition, and saving read it straight
 * back as local — so every save moved the value by the device's UTC offset. No
 * edit was required: opening a dialog and pressing Save was enough, and it
 * compounded.
 *
 * WHY THIS CANNOT REPAIR ANYTHING
 *
 * The stored value is `original + N × offset`. Neither term is recoverable:
 * `N` is however many times a dialog was opened and saved, which nothing
 * recorded, and `offset` is the device's zone at each of those moments — set
 * manually on the phone in question, so it does not even follow where it is.
 * Two unknowns, one equation. Anything that claimed to undo this would be
 * guessing, and guessing wrong on a `scheduled_at` publishes a Reel at the
 * wrong time rather than merely showing it at one.
 *
 * So this triages. It narrows hundreds of rows to the few worth opening, and
 * the dialogs — fixed now — are what actually correct them.
 */

/** Rows edited at least this long after creation genuinely went through a save. */
const EDIT_EPSILON_MS = 2000

/**
 * Hours that read as "nobody scheduled this deliberately". A shift by a whole
 * number of hours keeps the minutes intact, so the minute field tells us
 * nothing — the hour is the only part of a timed value that betrays a move.
 */
const IMPLAUSIBLE_HOURS = new Set([0, 1, 2, 3, 4, 5, 6])

/** The local wall-clock parts of an instant, in a named zone, without a library. */
export function localParts(iso, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short', year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value])
  )
  return {
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    label: `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`,
  }
}

/**
 * Did this row go through a dialog save while the bug was live?
 *
 * `updated_at > created_at` is necessary but nowhere near sufficient — a drag
 * to a new day, a stage change and a publish all bump it too. It is a filter,
 * not a verdict, which is exactly why nothing here writes.
 */
export function wasEditedBeforeFix(row, fixedAt) {
  if (!row.updated_at || !row.created_at) return false
  const updated = Date.parse(row.updated_at)
  const created = Date.parse(row.created_at)
  if (!Number.isFinite(updated) || !Number.isFinite(created)) return false
  return updated - created > EDIT_EPSILON_MS && updated < Date.parse(fixedAt)
}

/**
 * Classify one row. Returns null when there is nothing to say about it.
 *
 * `kind` is 'event' or 'post'; posts are ranked above events at equal
 * suspicion because a shifted `scheduled_at` mis-times a publish, where a
 * shifted event merely shows up at the wrong time.
 */
export function classifyRow(row, { kind, timeZone, fixedAt }) {
  const at = kind === 'post' ? row.scheduled_at : row.starts_at
  if (!at) return null

  const local = localParts(at, timeZone)
  const reasons = []

  // The one exact signal available. An all-day row is written at LOCAL midnight
  // by every correct path in the app, so a local hour that is not 00:00 is not
  // a judgement call — something moved it, and by exactly that many hours.
  if (row.all_day && !(local.hour === 0 && local.minute === 0)) {
    reasons.push(`all-day row sits at ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')} local, not midnight`)
  }

  if (!row.all_day && IMPLAUSIBLE_HOURS.has(local.hour)) {
    reasons.push(`${local.hour}:${String(local.minute).padStart(2, '0')} is an implausible hour`)
  }

  const edited = wasEditedBeforeFix(row, fixedAt)
  if (edited) reasons.push('edited through a dialog while the bug was live')

  if (reasons.length === 0) return null

  // Certain only where the all-day invariant is broken; the rest is suspicion.
  const certain = reasons[0].startsWith('all-day')
  const severity = certain ? 'CERTAIN' : edited && reasons.length > 1 ? 'HIGH' : 'LOW'

  return {
    kind,
    id: row.id,
    title: row.title || '(untitled)',
    storedUtc: at,
    local: local.label,
    severity,
    reasons,
    rank: (certain ? 300 : severity === 'HIGH' ? 200 : 100) + (kind === 'post' ? 10 : 0),
  }
}

/** Highest suspicion first, posts before events at equal rank. */
export function rankFindings(findings) {
  return findings.filter(Boolean).sort((a, b) => b.rank - a.rank || a.storedUtc.localeCompare(b.storedUtc))
}
