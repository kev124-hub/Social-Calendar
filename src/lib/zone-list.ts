/**
 * Finding a zone among four hundred of them.
 *
 * The plan left picker usability as the open question for step 4 — "there are
 * ~600 IANA zones and this is used on a phone" — so the ordering and matching
 * live here, where they can be tested, rather than inside the component that
 * draws them. `ZonePicker` is then only about rendering.
 */

/** A small, useful set for an engine with no `supportedValuesOf`. */
const FALLBACK_ZONES = [
  'UTC', 'Europe/London', 'Europe/Monaco', 'Europe/Paris', 'America/New_York',
  'America/Los_Angeles', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
]

/**
 * Every zone this engine knows, plus `UTC`.
 *
 * `Intl.supportedValuesOf` is 2022-era and universal on anything this app runs
 * on, but it throws rather than returning undefined where it is missing, so the
 * fallback is a real branch and not decoration.
 *
 * **`UTC` has to be added by hand.** `supportedValuesOf('timeZone')` returns
 * canonical zone names only — 418 of them here, with no `UTC` and no `Etc/*`
 * entry of any kind — while `Intl.DateTimeFormat` accepts `UTC` perfectly well.
 * Left as-is the picker would be unable to offer the one zone a technical user is
 * most likely to reach for, and unable to show a checkmark against an event
 * already on it, which Google returns for any calendar set to UTC.
 */
export function allTimeZones(): string[] {
  try {
    const zones = Intl.supportedValuesOf('timeZone')
    if (zones.length) return zones.includes('UTC') ? zones : ['UTC', ...zones]
  } catch {
    // No supportedValuesOf on this engine.
  }
  return FALLBACK_ZONES
}

/**
 * Will `Intl` accept this zone?
 *
 * Used instead of membership of `allTimeZones()` for the handful of zones that
 * come from outside it — recents, the device, the event's own. Google returns
 * legacy aliases (`US/Eastern`, `Asia/Calcutta`) that every engine resolves but
 * which are absent from the canonical list, and testing membership would drop a
 * zone that works. Only ever called on a few values, never across all 418.
 */
export function isUsableZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * `Europe/Monaco` → `Europe / Monaco`, and `America/New_York` →
 * `America / New York`.
 *
 * The underscore is the reason a plain substring search feels broken: nobody
 * types `New_York`, so the raw name has to be normalised before matching as well
 * as before display.
 */
export function prettyZone(zone: string): string {
  return zone.replace(/_/g, ' ').replace('/', ' / ')
}

export interface RankOptions {
  /** What the user has typed. Empty shows the head of the list. */
  query: string
  /** Previously picked zones, most recent first. */
  recents: string[]
  /** The device's own zone, or null if the browser will not say. */
  device: string | null
  /** The full candidate set, normally `allTimeZones()`. */
  zones: string[]
  /**
   * The event's own zone, kept selectable even when the canonical list omits it
   * — a legacy alias from Google would otherwise have no row to check.
   */
  current?: string | null
  /** How many rows to return. Defaults to `DEFAULT_LIMIT`. */
  limit?: number
}

/** Rows drawn at once. A phone list past this is scrolling, not choosing. */
export const DEFAULT_LIMIT = 40

/**
 * The rows to show, in order: zones you have used, then where you are, then
 * everything else — filtered by `query` and capped at `limit`.
 *
 * Recents lead because the same handful of zones recur. Kevin is in a different
 * one 200+ days a year, but they are the same few places, so after a week of use
 * the zone wanted is usually already on screen before anything is typed.
 *
 * Deduplicated across all three groups: a recent zone must not also appear in
 * the tail, or picking between two identical rows becomes a coin toss.
 */
export function rankZones(
  { query, recents, device, zones, current = null, limit = DEFAULT_LIMIT }: RankOptions
): string[] {
  // Validity by what Intl will accept, not by membership of the canonical list:
  // a zone this engine cannot resolve would be offered and then refused, while a
  // legacy alias it resolves fine would be dropped for no reason.
  const head = recents.filter(isUsableZone)
  for (const extra of [current, device]) {
    if (extra && isUsableZone(extra) && !head.includes(extra)) head.push(extra)
  }

  const seen = new Set(head)
  const pool = [...head, ...zones.filter((z) => !seen.has(z))]

  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!q) return pool.slice(0, limit)
  return pool.filter((z) => prettyZone(z).toLowerCase().includes(q)).slice(0, limit)
}
