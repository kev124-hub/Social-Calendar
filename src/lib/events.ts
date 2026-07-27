import type { SupabaseClient } from '@supabase/supabase-js'
import type { Calendar } from '@/types/database'
// Type-only import, erased at build time — no runtime coupling to the
// component, and nothing here touches `window` or a server-only API, so this
// module is safely shared between Server and Client Components.
import type { ParsedEvent } from '@/components/calendar/AIEventInput'

/**
 * The single choke point for every APP-SIDE write to `calendar_events`.
 *
 * Stage 9 (two-way Google Calendar sync) landed here, in this file and only
 * this file: every helper below mirrors its write into Google. That works only
 * because every app-side write goes through here — a create, update or delete
 * that bypassed these helpers would be one Google never hears about, leaving
 * events that never reach it and deletions that leave ghosts behind. Keep it
 * that way; the done-check below is what guards it.
 *
 * Deliberately NOT in scope: the pull-side `upsert` of `source: 'google'` rows
 * in `src/lib/google-calendar.ts`. That direction is Google→app.
 *
 * Reads are also not in scope. Components query `calendar_events` directly and
 * should keep doing so; this is a write choke point because writes are what
 * Stage 9 patches. The done-check that guards this file matches writes only:
 *
 *   rg -U -l "from\('calendar_events'\)[\s\S]{0,120}?\.(insert|update|upsert|delete)\(" src/
 *
 * It must list exactly two files: this one and `google-calendar.ts`.
 *
 * ERROR CONTRACT: every helper here THROWS on failure and never returns an
 * error for the caller to drop on the floor. These writes used to discard
 * their result, so an RLS refusal, a bad foreign key or a stale schema cache
 * looked exactly like success — the dialog closed, the input said "added", and
 * nothing appeared. A thrown error cannot be ignored by accident; a returned
 * one can, which is how that bug happened in the first place.
 */

/**
 * A rejected fetch, as opposed to a refusal from the database. WebKit says
 * "Load failed", Chrome and Firefox say "Failed to fetch" / "NetworkError";
 * postgrest-js passes the underlying message straight through.
 */
const NETWORK_FAILURE = /load failed|failed to fetch|networkerror|network request failed|fetch failed/i

/**
 * Turn a write failure into something worth reading.
 *
 * The two cases are genuinely different and must not be reported the same way.
 * A database refusal (RLS, a bad foreign key) is final: the row is definitely
 * not there, and retrying unchanged will fail again. A rejected fetch is
 * *ambiguous*: the request may well have reached the server and committed
 * before the response was lost, so the event may or may not exist. postgrest-js
 * retries GETs on a network error and deliberately never retries writes for
 * this exact reason (RETRYABLE_METHODS is GET/HEAD/OPTIONS only) — so telling
 * someone to "try again" without qualification invites a duplicate row.
 *
 * This asymmetry is also why a flaky connection shows up as a page that loads
 * perfectly well and then refuses to save: the reads retried, the write didn't.
 */
function writeFailure(verb: 'save' | 'delete', message: string | undefined): Error {
  const raw = message || 'Unknown error'
  if (NETWORK_FAILURE.test(raw)) {
    const past = verb === 'save' ? 'saved' : 'deleted'
    return new Error(
      `Couldn’t reach the database, so the event may or may not have been ${past}. ` +
        `Check your calendar before trying again. (${raw})`
    )
  }
  return new Error(`Could not ${verb} the event: ${raw}`)
}

/**
 * What a write did, beyond succeeding.
 *
 * The Supabase write and the Google push are deliberately not all-or-nothing.
 * The row is saved first and never rolled back; if Google is unreachable the
 * event still exists, `external_id` stays null, and `sweepUnpushedEvents` picks
 * it up on the next sync. So a failed push is a *warning*, not an error — the
 * alternative is losing the event someone just typed because a plane's wifi
 * dropped, which is the worse bug by a distance.
 */
export interface WriteResult {
  /** False when the row saved but Google has not got it yet. */
  pushedToGoogle: boolean
  /** Why the push failed, when it did. Not user-facing on its own. */
  pushError?: string
  /**
   * The push failed because Google will not accept the stored authorisation.
   *
   * Worth separating from every other push failure because it is the only one
   * that never fixes itself: a dropped connection resolves on the next sync,
   * but a dead token means every event from now on silently fails to reach
   * Google while the app cheerfully reports "not in Google yet". Nothing
   * changes until someone reconnects, so the message has to say so.
   */
  needsGoogleReconnect?: boolean
}

/** Google refusing the stored credentials, as opposed to any other failure. */
const NEEDS_RECONNECT = /not authenticated with google|invalid_grant|invalid_token|Google API error (401|403)/i

/**
 * Ask the server to mirror this event into Google. Never throws: every failure
 * path returns a WriteResult the caller can report without losing the write.
 *
 * The browser cannot talk to Google directly — the tokens are service-role
 * only — so this hops through `/api/google-calendar/push`.
 */
async function pushToGoogle(
  payload: { eventId?: string; externalId?: string | null; op: 'upsert' | 'delete' }
): Promise<WriteResult> {
  try {
    const res = await fetch('/api/google-calendar/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        // Only the browser knows this, and all-day dates are wrong without it.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const pushError = data.error ?? `Google push failed (${res.status})`
      return {
        pushedToGoogle: false,
        pushError,
        needsGoogleReconnect: NEEDS_RECONNECT.test(pushError),
      }
    }
    return { pushedToGoogle: true }
  } catch (err) {
    // A dropped connection here is the expected case, not an exception.
    return {
      pushedToGoogle: false,
      pushError: err instanceof Error ? err.message : 'Could not reach the app server',
    }
  }
}

/** Columns an app-side caller sets. `source` and `external_id` are ours. */
export interface EventFields {
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  calendar_id: string | null
  /**
   * IANA zone the wall clock was meant in. Optional: a caller that does not
   * supply one gets the device's, via `deviceTimeZone()` below.
   *
   * Step 1 of the per-event timezone work — see
   * `docs/design/timezones/per-event-timezone-plan.md`. Written but not yet
   * read by anything, deliberately: until the views honour a zone, storing one
   * changes nothing on screen. That is what makes this step inert.
   */
  time_zone?: string | null
}

/**
 * The zone this device is set to, or null if the browser will not say.
 *
 * Null rather than a guess. 'UTC' would be a lie that renders as a real
 * wall clock and looks deliberate — worse than an honest unknown, which the
 * readers already handle by falling back to the device zone at display time.
 */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

export async function createEvent(
  supabase: SupabaseClient,
  fields: EventFields
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      ...fields,
      // Captured at creation, where the answer is known. `?? deviceTimeZone()`
      // rather than an unconditional default so an explicit zone from the
      // dialog wins — including, later, an explicit null.
      time_zone: fields.time_zone ?? deviceTimeZone(),
      source: 'app' as const,
      // `external_id` stays null until the push below reports Google's id.
      // A null here is exactly what marks the row as still owed to Google, and
      // what the sync sweep looks for.
    })
    .select('id')
    .single()
  if (error) throw writeFailure('save', error.message)

  // Saved. Everything past this point is best-effort — see WriteResult.
  return pushToGoogle({ eventId: data.id, op: 'upsert' })
}

export async function updateEvent(
  supabase: SupabaseClient,
  id: string,
  fields: Partial<EventFields>
): Promise<WriteResult> {
  // `fields` is spread as given and NOTHING is added to it. That is the point:
  // an update must not stamp `time_zone` the way `createEvent` does. A dialog
  // opened to look at an event and closed with Save would otherwise write the
  // viewing device's zone onto a row created somewhere else — silently moving
  // it, from an action that changed nothing. That is precisely the shape of the
  // drift bug this whole workstream started with, and the existing assertion
  // that an update never rewrites `source` exists for the same reason.
  const { error } = await supabase
    .from('calendar_events')
    .update(fields)
    .eq('id', id)
  if (error) throw writeFailure('save', error.message)

  return pushToGoogle({ eventId: id, op: 'upsert' })
}

export async function deleteEvent(
  supabase: SupabaseClient,
  id: string
): Promise<WriteResult> {
  // Read the Google id BEFORE the row goes: afterwards there is nothing left to
  // read it from, and an event deleted here but left in Google is the ghost the
  // whole choke point exists to prevent. A failed read is not fatal — losing
  // the local delete would be worse — but it does mean the ghost survives, so
  // it is reported.
  //
  // `source` comes with it because the guard below has to run before the row is
  // gone, for the same reason.
  const { data: existing, error: readError } = await supabase
    .from('calendar_events')
    .select('external_id, source')
    .eq('id', id)
    .single()

  // An event that came FROM Google is not ours to delete, and this refuses
  // before touching anything rather than after.
  //
  // Both of the alternatives are worse. Deleting it here AND in Google — which
  // is what happened until now — means the app can destroy something in a
  // calendar it does not own, from a Delete button two taps away. Deleting it
  // only locally looks tidier and is not: the pull upserts on `external_id`, so
  // the next sync re-imports the row and the event returns by itself, which
  // reads as a bug in whichever direction you were not expecting.
  //
  // Refusing is the only outcome that stays true five minutes later. Google is
  // the owner; the deletion belongs there.
  //
  // A failed read leaves `existing` null and falls through deliberately: the
  // local delete is safe in that case because without an `external_id` there is
  // nothing to push, so nothing in Google can be touched either way.
  // `source` is NOT NULL with a four-value check — 'app', 'google', 'tripit',
  // 'icloud' — so `!== 'app'` covers every foreign origin, present and future,
  // rather than naming Google specifically. It also fails closed: an
  // unrecognised value refuses rather than assuming ownership.
  if (existing && existing.source !== 'app') {
    const owner = existing.source === 'google' ? 'Google' : existing.source || 'another calendar'
    throw new Error(
      `This event is synced from ${owner} and has to be deleted there. Deleting it ` +
        `here would either remove it from ${owner} too, or be undone by the next sync.`
    )
  }

  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw writeFailure('delete', error.message)

  if (readError) {
    return {
      pushedToGoogle: false,
      pushError: `Deleted here, but could not tell whether it was in Google (${readError.message})`,
    }
  }
  // Never pushed, so there is nothing in Google to remove.
  if (!existing?.external_id) return { pushedToGoogle: true }

  return pushToGoogle({ externalId: existing.external_id, op: 'delete' })
}

/**
 * Where an AI-parsed event lands: the first app calendar, else whatever is
 * first, else nowhere. Exported because `/home`'s confirmation line has to name
 * the destination, and computing it a second time there would let the two
 * answers drift — the line would eventually name a calendar the event is not on.
 */
export function resolveDefaultCalendar(calendars: Calendar[]): Calendar | undefined {
  return calendars.find((c) => c.source === 'app') ?? calendars[0]
}

/**
 * Strip any timezone designator from a parsed datetime.
 *
 * "Wednesday 2:30pm" means 2:30pm where the person typing it is standing. The
 * parse is a WALL CLOCK reading and the model has no business attaching a zone
 * to it — it does not know where anyone is.
 *
 * But the prompt asks for "ISO 8601", which permits a trailing `Z` or `±HH:MM`,
 * and only *illustrates* the naive form. When the model obliged with a `Z`,
 * `new Date(s)` read it as an absolute instant instead of local wall clock and
 * the event shifted by exactly the user's UTC offset — 2:30pm stored, 10:30pm
 * displayed, on a device at UTC+8. Nothing in the UI could hint at it, because
 * every later step was doing its job correctly on a value that was already wrong.
 *
 * Fixed here rather than only in the prompt because the prompt is a request and
 * this is a guarantee: no output the model can produce should be able to move an
 * event through time.
 */
export function stripTimeZone(datetime: string): string {
  return datetime.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, '')
}

/**
 * The local wall-clock instant a parsed datetime refers to.
 *
 * Exported because `CalendarView` has to jump to the day it just created an
 * event on, and deriving that date a second time there would let the two
 * answers drift — which matters more than it sounds, because both of the
 * conversions below are ones the naive version gets wrong:
 *
 *   - a stray `Z` from the model would shift the day by the UTC offset
 *     (see stripTimeZone), and
 *   - an all-day parse is a bare `YYYY-MM-DD`, which `new Date()` reads as UTC
 *     midnight — landing on the PREVIOUS day anywhere west of Greenwich. The
 *     `T00:00:00` is what forces it to local midnight.
 *
 * Getting either wrong puts the event on one day and the view on another.
 */
export function parsedLocalDate(raw: string, allDay: boolean, isEnd = false): Date {
  // Strip unconditionally: an all-day parse is unaffected, but doing it anyway
  // stops a stray `Z` making `2026-05-24Z` + `T00:00:00` and throwing
  // "Invalid time value".
  const s = stripTimeZone(raw)
  if (allDay) return new Date(s + (isEnd ? 'T23:59:59' : 'T00:00:00'))
  return new Date(s)
}

/**
 * Create an event from an `AIEventInput` parse. Resolves the destination
 * calendar and normalises an all-day parse — which arrives as a bare
 * `YYYY-MM-DD` — to a full day span.
 *
 * Called by both `CalendarView` and `HomeView`, which is the other reason this
 * lives here: two copies of this logic would drift.
 */
export async function createEventFromParsed(
  supabase: SupabaseClient,
  parsed: ParsedEvent,
  calendars: Calendar[]
): Promise<WriteResult> {
  const defaultCalendar = resolveDefaultCalendar(calendars)

  const toISO = (raw: string, isEnd?: boolean) =>
    parsedLocalDate(raw, parsed.all_day, isEnd).toISOString()

  return createEvent(supabase, {
    title: parsed.title,
    description: parsed.description,
    location: parsed.location,
    starts_at: toISO(parsed.starts_at),
    ends_at: parsed.ends_at ? toISO(parsed.ends_at, true) : null,
    all_day: parsed.all_day,
    calendar_id: defaultCalendar?.id ?? null,
  })
}
