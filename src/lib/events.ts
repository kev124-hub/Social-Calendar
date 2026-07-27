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
}

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
      return { pushedToGoogle: false, pushError: data.error ?? `Google push failed (${res.status})` }
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
}

export async function createEvent(
  supabase: SupabaseClient,
  fields: EventFields
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      ...fields,
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
  const { data: existing, error: readError } = await supabase
    .from('calendar_events')
    .select('external_id')
    .eq('id', id)
    .single()

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

  const toISO = (s: string, isEnd?: boolean) => {
    if (parsed.all_day)
      return new Date(s + (isEnd ? 'T23:59:59' : 'T00:00:00')).toISOString()
    return new Date(s).toISOString()
  }

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
