import type { SupabaseClient } from '@supabase/supabase-js'
import type { Calendar } from '@/types/database'
// Type-only import, erased at build time — no runtime coupling to the
// component, and nothing here touches `window` or a server-only API, so this
// module is safely shared between Server and Client Components.
import type { ParsedEvent } from '@/components/calendar/AIEventInput'

/**
 * The single choke point for every APP-SIDE write to `calendar_events`.
 *
 * Stage 9 (two-way Google Calendar sync) patches this file, and only this
 * file, to push app-created events up to Google. That only works if every
 * app-side write goes through here — a create, update or delete that bypasses
 * these helpers is one Stage 9 will silently miss, leaving events that never
 * reach Google and deletions that leave ghosts behind.
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
): Promise<void> {
  const { error } = await supabase.from('calendar_events').insert({
    ...fields,
    source: 'app' as const,
    // `external_id` stays null on app-created events. Stage 9 backfills it
    // from Google's insert response — don't invent a value for it.
  })
  if (error) throw new Error(`Could not save the event: ${error.message}`)
}

export async function updateEvent(
  supabase: SupabaseClient,
  id: string,
  fields: Partial<EventFields>
): Promise<void> {
  const { error } = await supabase
    .from('calendar_events')
    .update(fields)
    .eq('id', id)
  if (error) throw new Error(`Could not save the event: ${error.message}`)
}

export async function deleteEvent(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw new Error(`Could not delete the event: ${error.message}`)
}

/**
 * Create an event from an `AIEventInput` parse. Resolves the destination
 * calendar (first app calendar, else whatever is first) and normalises an
 * all-day parse — which arrives as a bare `YYYY-MM-DD` — to a full day span.
 *
 * Called by both `CalendarView` and `HomeView`, which is the other reason this
 * lives here: two copies of this logic would drift.
 */
export async function createEventFromParsed(
  supabase: SupabaseClient,
  parsed: ParsedEvent,
  calendars: Calendar[]
): Promise<void> {
  const defaultCalendar = calendars.find((c) => c.source === 'app') ?? calendars[0]

  const toISO = (s: string, isEnd?: boolean) => {
    if (parsed.all_day)
      return new Date(s + (isEnd ? 'T23:59:59' : 'T00:00:00')).toISOString()
    return new Date(s).toISOString()
  }

  await createEvent(supabase, {
    title: parsed.title,
    description: parsed.description,
    location: parsed.location,
    starts_at: toISO(parsed.starts_at),
    ends_at: parsed.ends_at ? toISO(parsed.ends_at, true) : null,
    all_day: parsed.all_day,
    calendar_id: defaultCalendar?.id ?? null,
  })
}
