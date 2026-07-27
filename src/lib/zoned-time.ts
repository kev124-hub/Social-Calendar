import { parseISO } from 'date-fns'

/**
 * Rendering an instant as the wall clock it was meant in.
 *
 * `starts_at` is a `timestamptz` — an absolute instant. Every render site in
 * this app currently turns it into a wall clock using the *device's* zone, so a
 * dinner created as 8pm in Monaco reads as 2pm once the phone is in New York.
 * Nothing is corrupted (8pm in Monaco genuinely is 2pm in New York) but the
 * intent was a wall clock, and a `timestamptz` alone cannot hold one. The
 * instant plus `calendar_events.time_zone` can, and together they reconstruct it
 * exactly.
 *
 * **Nothing imports this yet.** It ships unused and hard-tested first, so the
 * view conversions in step 3 are built on something already proven rather than
 * debugged through the UI. See `docs/design/timezones/per-event-timezone-plan.md`.
 *
 * ## A null zone means "device zone", forever
 *
 * Not a migration window. Rows outside the 30/90-day sync window, rows on
 * calendars later disconnected, and app-created events whose zone was never set
 * are all permanently null, and a null renders in the device zone — which is
 * exactly today's behaviour. So every function here takes `string | null` and
 * treats null as the device, on the same code path rather than a special case.
 *
 * ## Why this is built on `Intl`, and not on a shifted `Date`
 *
 * The usual trick for "format in another zone" without a library is to read the
 * target zone's wall-clock fields, build `new Date(y, m, d, h, min)` from them,
 * and let the formatter print it in the device zone. That is wrong twice a year
 * and unfixably so: if the reconstructed wall clock does not *exist* in the
 * device's zone — 2:30 AM on a US spring-forward date, formatting a Monaco event
 * on a New York phone — the `Date` constructor normalises it forward an hour and
 * the printed time is silently off by one. There is no way to detect it after
 * the fact.
 *
 * So no intermediate `Date` in a foreign zone is ever constructed here. Every
 * field comes from `Intl.DateTimeFormat` with an explicit `timeZone`, which asks
 * ICU directly and accounts for DST on the formatted date. The cost is that the
 * pattern language below is assembled by hand instead of delegated to date-fns;
 * the benefit is that there is no hour to lose.
 */

/** The zone this device is set to, or null if the browser will not say. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/**
 * The wall-clock fields of `iso` as read in `zone`.
 *
 * The primitive the rest of this module is built from, and the one the bucketing
 * sites need directly: deciding which day a row belongs to, or where it sits on
 * an hour grid, is a question about these numbers and not about a string.
 *
 * `hour` is 0–23. Callers wanting 12-hour output should use `formatInZone`
 * rather than reducing it themselves.
 */
export function partsInZone(iso: string, zone: string | null): ZonedParts {
  const date = parseISO(iso)
  assertValid(date, iso)
  const parts = numericFormatter(resolveZone(zone)).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => {
    const found = parts.find((p) => p.type === type)
    // Unreachable with the options below, but a missing field would otherwise
    // become NaN and propagate into a day key or a grid position.
    if (!found) throw new Error(`Intl returned no ${type} for ${iso}`)
    return Number(found.value)
  }
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

export type ZonedParts = {
  year: number
  /** 1–12, not the 0–11 a `Date` would give. */
  month: number
  day: number
  /** 0–23. */
  hour: number
  minute: number
  second: number
}

/**
 * Format `iso` in `zone` using a date-fns-style pattern.
 *
 * Supports the subset of tokens this app actually formats instants with, listed
 * in `TOKENS` below, plus quoted literals (`"yyyy-MM-dd'T'HH:mm"`). Output
 * matches date-fns under the default en-US locale, so a converted call site
 * renders byte-identically to the one it replaced whenever the zone is the
 * device's.
 *
 * **An unsupported token throws rather than passing through.** A silent
 * fallthrough is how a step-3 call site would end up rendering `Z` as the letter
 * Z, or quietly losing a field, and be believed. Failing loudly at the first
 * render is the cheaper outcome; adding a token here is a two-line change.
 */
export function formatInZone(iso: string, zone: string | null, fmt: string): string {
  const parts = partsInZone(iso, zone)
  const resolved = resolveZone(zone)
  let out = ''
  let i = 0

  while (i < fmt.length) {
    const char = fmt[i]

    // Quoted literal, following date-fns: 'T' emits T, a bare '' emits a single
    // quote, and a '' *inside* a quoted run emits one without ending the run —
    // so "'o''clock'" is o'clock, not a run of "o" followed by stray letters
    // that would then be read as pattern tokens.
    if (char === "'") {
      if (fmt[i + 1] === "'") {
        out += "'"
        i += 2
        continue
      }
      let j = i + 1
      let literal = ''
      while (j < fmt.length) {
        if (fmt[j] === "'") {
          if (fmt[j + 1] === "'") {
            literal += "'"
            j += 2
            continue
          }
          break
        }
        literal += fmt[j]
        j++
      }
      if (j >= fmt.length) throw new Error(`Unterminated quote in pattern "${fmt}"`)
      out += literal
      i = j + 1
      continue
    }

    // A run of the same pattern letter is one token — `MM` is not two `M`s.
    if (/[A-Za-z]/.test(char)) {
      let end = i
      while (end < fmt.length && fmt[end] === char) end++
      const token = fmt.slice(i, end)
      const render = TOKENS[token]
      if (!render) {
        throw new Error(
          `Unsupported pattern token "${token}" in "${fmt}". ` +
            `Supported: ${Object.keys(TOKENS).join(', ')}. Add it to TOKENS in zoned-time.ts.`
        )
      }
      out += render(parts, iso, resolved)
      i = end
      continue
    }

    out += char
    i++
  }

  return out
}

/**
 * A short offset marker for `zone` at that instant — `GMT+2` — or null when
 * there is nothing worth saying.
 *
 * Null in two cases, and they are the same case: the event's zone is unknown
 * (so it is already being read in the device's), or it resolves to the same
 * offset the device is on. Marking every event when almost all of them are
 * local is noise, and noise is how the marker that matters gets ignored.
 *
 * Compared by *offset at this instant*, not by zone name, which is what makes
 * the two useful properties fall out. `Europe/Monaco` on a `Europe/Paris`
 * device says nothing, because there is no difference to report. And the same
 * New York event reads `GMT-5` in January and `GMT-4` in July — an offset is a
 * function of the date, so a label formatted from "now" would be right for
 * about half the year, which is the most annoying kind of wrong.
 */
export function offsetLabel(iso: string, zone: string | null): string | null {
  if (!zone) return null
  const date = parseISO(iso)
  assertValid(date, iso)
  const forZone = shortOffset(date, resolveZone(zone))
  if (forZone === shortOffset(date, deviceTimeZone())) return null
  return forZone
}

/**
 * The instant at which the clocks in `zone` read this wall clock — the inverse
 * of `partsInZone`.
 *
 * Needed in both directions, and step 3 needs this one for two things that would
 * otherwise be impossible to get right:
 *
 * - **All-day rows.** "1 August, all day" is a *date*. Turning it into the
 *   instant the day begins in the event's own zone is what stops it landing on
 *   31 July for anyone west of Greenwich.
 * - **Saving from the dialog.** The prefilled inputs show the event's zone, so
 *   the value read back has to be interpreted in that zone too. Interpreting it
 *   as device-local while displaying it as Monaco is exactly how an
 *   open-and-save-unchanged silently moves an event, which is the bug this
 *   workstream began with.
 *
 * Two passes, because the offset has to be sampled near the answer rather than
 * at the guess: a single pass using the offset at the *UTC* reading of the wall
 * clock is wrong by an hour whenever that guess and the answer sit on opposite
 * sides of a DST change.
 *
 * Two kinds of wall clock have no single answer, and this cannot fix that:
 *
 * - **A skipped hour** — 2:30 AM on a spring-forward date does not exist. The
 *   result lands just after the gap, which is what every calendar does.
 * - **A repeated hour** — 1:30 AM happens twice on a fall-back date. One of the
 *   two is returned, and *which* depends on the zone's offset at the initial
 *   guess, so it is deliberately not specified: Monaco yields the second
 *   occurrence and New York the first, purely because of where each transition
 *   falls relative to the guess. Pinning a rule would mean sampling the offset
 *   on both sides and choosing, which buys nothing the callers here need.
 *
 * Both are inherent to a wall clock rather than defects, and neither can move a
 * date: the error is at most an hour, and an all-day event's midnight is only
 * exposed to it in the few zones that transition at midnight. It is also not a
 * regression for the dialog — reading an input back with `new Date()` resolves
 * an ambiguous hour just as arbitrarily today.
 */
export function instantFromParts(
  parts: {
    year: number
    month: number
    day: number
    hour?: number
    minute?: number
    second?: number
  },
  zone: string | null
): string {
  const wallAsUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0
  )
  const resolved = resolveZone(zone)
  let instant = wallAsUTC - offsetMillis(wallAsUTC, resolved)
  instant = wallAsUTC - offsetMillis(instant, resolved)
  return new Date(instant).toISOString()
}

/**
 * The instant a calendar date begins in `zone` — `2026-08-01` in
 * `Europe/Monaco` is `2026-07-31T22:00:00Z`.
 *
 * The convention the app already uses for an all-day event, and the one the
 * Google *push* has always assumed (`toGoogleEvent` reads the local date back
 * out of it). The pull is what disagreed.
 */
export function dayStartInZone(date: string, zone: string | null): string {
  return instantFromParts(splitDate(date), zone)
}

/** The last second of a calendar date in `zone`, matching the app's `ends_at`. */
export function dayEndInZone(date: string, zone: string | null): string {
  return instantFromParts({ ...splitDate(date), hour: 23, minute: 59, second: 59 }, zone)
}

/**
 * Read a `<input type="datetime-local">` or `<input type="date">` value as a
 * wall clock in `zone`, and return the instant.
 *
 * The input types are local *by definition* and carry no zone, so the value is
 * meaningless until one is chosen. Passing null chooses the device's, which is
 * what the browser would have done and what every existing caller wants.
 */
export function instantFromLocalInput(value: string, zone: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim())
  if (!m) throw new RangeError(`Not a datetime-local value: ${value}`)
  return instantFromParts(
    {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: m[4] ? Number(m[4]) : 0,
      minute: m[5] ? Number(m[5]) : 0,
      second: m[6] ? Number(m[6]) : 0,
    },
    zone
  )
}

/**
 * A time with its offset appended when the device is somewhere else —
 * `8:00 PM GMT+2`, or just `8:00 PM` when there is nothing to distinguish.
 *
 * For compact rows: a month chip, a `/home` upcoming row, a list entry. Short
 * because there is no room, and unambiguous without knowing that CEST is a
 * thing.
 */
export function timeWithZone(iso: string, zone: string | null, fmt = 'h:mm a'): string {
  const label = offsetLabel(iso, zone)
  const time = formatInZone(iso, zone, fmt)
  return label ? `${time} ${label}` : time
}

/**
 * Both readings, for a detail surface — `8:00 PM GMT+2 · 2:00 PM your time`.
 *
 * When the two differ, the second one is the question you actually have: the
 * event is at 8 in Monaco, and you want to know what that is where you are
 * standing. Collapses to a single reading when they agree, so a local event
 * reads exactly as it does today.
 *
 * The copy lives here rather than in the components so that every detail
 * surface says it the same way.
 */
export function timeWithBothZones(iso: string, zone: string | null, fmt = 'h:mm a'): string {
  const label = offsetLabel(iso, zone)
  const time = formatInZone(iso, zone, fmt)
  if (!label) return time
  return `${time} ${label} · ${formatInZone(iso, null, fmt)} your time`
}

// ── Internals ───────────────────────────────────────────────────────────

/** `2026-08-01` → its numeric fields, rejecting anything else. */
function splitDate(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim())
  if (!m) throw new RangeError(`Not a calendar date: ${date}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/**
 * How far `zone` is from UTC at this instant, in milliseconds.
 *
 * Derived by reading the wall clock there and treating it as though it were UTC:
 * the difference between that and the real instant *is* the offset.
 */
function offsetMillis(utcMillis: number, zone: string | undefined): number {
  const parts = numericFormatter(zone).formatToParts(new Date(utcMillis))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  return (
    Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second')
    ) - utcMillis
  )
}

const TOKENS: Record<
  string,
  (p: ZonedParts, iso: string, zone: string | undefined) => string
> = {
  yyyy: (p) => String(p.year).padStart(4, '0'),
  yy: (p) => String(p.year % 100).padStart(2, '0'),
  MMMM: (p, iso, z) => monthName(iso, z, 'long'),
  MMM: (p, iso, z) => monthName(iso, z, 'short'),
  MM: (p) => pad(p.month),
  M: (p) => String(p.month),
  dd: (p) => pad(p.day),
  d: (p) => String(p.day),
  EEEE: (p, iso, z) => weekdayName(iso, z, 'long'),
  EEE: (p, iso, z) => weekdayName(iso, z, 'short'),
  HH: (p) => pad(p.hour),
  H: (p) => String(p.hour),
  hh: (p) => pad(hour12(p.hour)),
  h: (p) => String(hour12(p.hour)),
  mm: (p) => pad(p.minute),
  ss: (p) => pad(p.second),
  // Derived from the 0–23 hour rather than read from Intl on purpose. ICU's
  // en-US 12-hour output separates the meridiem with U+202F (a narrow no-break
  // space), so lifting it verbatim would put an invisible character into every
  // time on screen where date-fns had an ordinary space — and make any test
  // comparing the two fail on something nobody can see in the diff.
  a: (p) => (p.hour < 12 ? 'AM' : 'PM'),
}

const pad = (n: number) => String(n).padStart(2, '0')
const hour12 = (h: number) => h % 12 || 12

/**
 * A zone that `Intl` will accept, or undefined to mean the device's.
 *
 * An unrecognised zone falls back to the device rather than throwing. A bad
 * value in one row — a zone Google no longer publishes, a typo, an IANA name
 * this browser's ICU build has not got — must not blank out the whole calendar.
 * The device fallback is the documented behaviour of a null zone, so a bad zone
 * degrades to exactly that, and warns once so it is still discoverable.
 */
function resolveZone(zone: string | null): string | undefined {
  if (!zone) return undefined
  if (validZones.has(zone)) return zone
  try {
    // The only reliable validity check: construct one and see if it throws.
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    validZones.add(zone)
    return zone
  } catch {
    if (!warnedZones.has(zone)) {
      warnedZones.add(zone)
      console.warn(`Unknown time zone "${zone}"; falling back to the device zone.`)
    }
    return undefined
  }
}

const validZones = new Set<string>()
const warnedZones = new Set<string>()

// Formatter construction is the expensive part of Intl, and these get called
// once per event per render — so they are memoised per zone.
const numericCache = new Map<string, Intl.DateTimeFormat>()
function numericFormatter(zone: string | undefined): Intl.DateTimeFormat {
  const key = zone ?? ''
  let f = numericCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      // `hourCycle` rather than `hour12: false`, which yields 24 for midnight
      // in some engines and would make an event at 00:30 format as 24:30.
      hourCycle: 'h23',
    })
    numericCache.set(key, f)
  }
  return f
}

const nameCache = new Map<string, Intl.DateTimeFormat>()
function namePart(
  iso: string,
  zone: string | undefined,
  option: 'month' | 'weekday',
  width: 'short' | 'long'
): string {
  const key = `${zone ?? ''}|${option}|${width}`
  let f = nameCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, [option]: width })
    nameCache.set(key, f)
  }
  return f.format(parseISO(iso))
}

const monthName = (iso: string, zone: string | undefined, width: 'short' | 'long') =>
  namePart(iso, zone, 'month', width)
const weekdayName = (iso: string, zone: string | undefined, width: 'short' | 'long') =>
  namePart(iso, zone, 'weekday', width)

const offsetCache = new Map<string, Intl.DateTimeFormat>()
function shortOffset(date: Date, zone: string | null | undefined): string {
  const key = zone ?? ''
  let f = offsetCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone ?? undefined,
      timeZoneName: 'shortOffset',
    })
    offsetCache.set(key, f)
  }
  const found = f.formatToParts(date).find((p) => p.type === 'timeZoneName')
  // 'shortOffset' renders UTC itself as plain "GMT". Normalising to GMT+0 keeps
  // the comparison in `offsetLabel` textual and total, so a UTC event on a UTC
  // device compares equal and stays unmarked.
  return found?.value === 'GMT' ? 'GMT+0' : (found?.value ?? '')
}

/**
 * Throws on an unparseable instant, matching what date-fns `format` already
 * does at the sites this replaces — so a bad row fails the same way it does
 * today rather than rendering "Invalid Date" into the calendar.
 */
function assertValid(date: Date, iso: string): void {
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid time value: ${iso}`)
}
