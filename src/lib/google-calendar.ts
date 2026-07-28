import { createClient } from '@supabase/supabase-js'
import { dayStartInZone, dayEndInZone } from './zoned-time.ts'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─────────────────────────────────────────────
// Token management
// ─────────────────────────────────────────────

export async function getGoogleTokens() {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('provider', 'google_calendar')
    .single()
  return data
}

export async function saveGoogleTokens(
  accessToken: string,
  refreshToken: string | null,
  expiresIn: number,
  metadata?: Record<string, unknown>
) {
  const supabase = getServiceClient()
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  await supabase.from('user_integrations').upsert({
    provider: 'google_calendar',
    access_token: accessToken,
    refresh_token: refreshToken ?? undefined,
    token_expires_at: expiresAt,
    ...(metadata ? { metadata } : {}),
  }, { onConflict: 'provider' })
}

export async function getValidAccessToken(): Promise<string | null> {
  const integration = await getGoogleTokens()
  if (!integration) return null

  // Refresh if expiring within 5 minutes
  const expiresAt = integration.token_expires_at
    ? new Date(integration.token_expires_at).getTime()
    : 0
  const needsRefresh = expiresAt - Date.now() < 5 * 60 * 1000

  if (!needsRefresh) return integration.access_token

  if (!integration.refresh_token) return null

  // Refresh token
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: integration.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    console.error('Token refresh failed:', await res.text())
    return null
  }

  const data = await res.json()
  await saveGoogleTokens(data.access_token, integration.refresh_token, data.expires_in)
  return data.access_token
}

export async function disconnectGoogle() {
  const supabase = getServiceClient()
  await supabase.from('user_integrations').delete().eq('provider', 'google_calendar')
  // Also remove Google-sourced calendars and events
  const { data: gcals } = await supabase.from('calendars').select('id').eq('source', 'google')
  if (gcals?.length) {
    await supabase.from('calendars').delete().eq('source', 'google')
  }
}

// ─────────────────────────────────────────────
// Google Calendar API helpers
// ─────────────────────────────────────────────

async function gFetch(path: string, options: RequestInit = {}) {
  const token = await getValidAccessToken()
  if (!token) throw new Error('Not authenticated with Google')

  const res = await fetch(`${GOOGLE_CALENDAR_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function listGoogleCalendars() {
  const data = await gFetch('/users/me/calendarList')
  return data.items as GoogleCalendarListEntry[]
}

export async function listGoogleEvents(
  calendarId: string,
  timeMin: string,
  timeMax: string,
  pageToken?: string
) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '500',
    ...(pageToken ? { pageToken } : {}),
  })
  return gFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`)
}

// ─────────────────────────────────────────────
// Push: app → Google (Stage 9)
// ─────────────────────────────────────────────

/**
 * Marks a Google event as one this app created and already knows about.
 *
 * Without it the pull would fight the push. `syncGoogleCalendar` upserts on
 * `external_id`, so a pushed event coming back would not duplicate — but the
 * upsert also sets `source: 'google'` and the Google calendar's `calendar_id`,
 * which would silently migrate the event off its app calendar and, because
 * pushes are gated on `source === 'app'`, stop every later edit reaching
 * Google. Tagging on the way out and skipping the tag on the way back in keeps
 * app-created events owned by the app.
 *
 * Consequence worth knowing: an app-created event edited in Google Calendar
 * will not come back. The app is the source of truth for what it created.
 */
const APP_TAG = 'socialCalendarEventId'

/**
 * Did this app push this Google event? Exported for tests — getting it wrong is
 * silent and destructive, migrating our own events onto a Google calendar with
 * nothing on screen to say it happened.
 */
export function isAppPushedEvent(e: { extendedProperties?: { private?: Record<string, string> } }): boolean {
  return Boolean(e.extendedProperties?.private?.[APP_TAG])
}

/** App-created events go to the primary calendar. */
const PUSH_TARGET = 'primary'

/**
 * `YYYY-MM-DD` for an instant, in a named zone.
 *
 * All-day events are stored as *local* midnight converted to UTC, so slicing
 * the ISO string would shift the date a day backwards for anyone east of UTC —
 * a race weekend landing on the Saturday. The zone comes from the browser
 * (`Intl...timeZone`) because the server has no way to know it.
 */
function localDate(iso: string, timeZone: string): string {
  // 'en-CA' formats as YYYY-MM-DD, which is exactly Google's `date` shape.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface AppEventRow {
  id: string
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  /** IANA zone the wall clock was meant in; null on rows that predate step 1. */
  time_zone: string | null
  external_id: string | null
  source: string
}

/**
 * The Google request body for one of our events.
 *
 * Exported for tests. The all-day date arithmetic here is the part most able to
 * be wrong without looking wrong — a date off by one moves a race weekend to
 * the Saturday and nothing in the UI would say so.
 */
export function toGoogleEvent(event: AppEventRow, timeZone: string) {
  // The event's OWN zone wherever it has one, and the caller's only as a
  // fallback for rows that predate step 1 — for which it reproduces exactly the
  // previous behaviour.
  //
  // Not interchangeable, and the all-day case is why. Since step 3 an all-day row
  // is stored at midnight in its own zone, so deriving its date in the caller's
  // instead is off by one whenever the two differ: a 1 August Monaco event pushed
  // from a New York browser went to Google as 31 July, and as a two-day span.
  // That is reachable without anyone touching the zone picker — create the event
  // in Monaco, lose the wifi, and `sweepUnpushedEvents` retries it later from
  // wherever you are by then.
  const zone = event.time_zone ?? timeZone

  const timing = event.all_day
    ? {
        start: { date: localDate(event.starts_at, zone) },
        // Google treats all-day `end.date` as EXCLUSIVE, so a single-day event
        // ends on the following day. Our `ends_at` is the last day at 23:59
        // local, hence +1 rather than a straight copy.
        end: {
          date: addDays(localDate(event.ends_at ?? event.starts_at, zone), 1),
        },
      }
    : {
        // `dateTime` carries an absolute offset, so the instant is unambiguous
        // with or without `timeZone`. Sending the zone as well is what makes the
        // event a WALL CLOCK to Google rather than an instant it renders in the
        // target calendar's default zone — which is what step 5 exists for, and
        // is the same shape Google sends back on the pull.
        //
        // Omitted rather than defaulted when the row has no zone: Google would
        // then apply the calendar's own, which is today's behaviour, whereas
        // sending the pusher's device zone would assert something we do not know.
        start: {
          dateTime: new Date(event.starts_at).toISOString(),
          ...(event.time_zone ? { timeZone: event.time_zone } : {}),
        },
        // Google rejects an event with no end. Our schema allows one, so give
        // an open-ended event a nominal hour rather than failing the push.
        end: {
          dateTime: new Date(
            event.ends_at ?? new Date(new Date(event.starts_at).getTime() + 60 * 60 * 1000).toISOString()
          ).toISOString(),
          ...(event.time_zone ? { timeZone: event.time_zone } : {}),
        },
      }

  return {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    ...timing,
    extendedProperties: { private: { [APP_TAG]: event.id } },
  }
}

/**
 * Create or update this event in Google and record the id it comes back with.
 *
 * Returns the Google event id. Throws on any Google or database failure — the
 * caller decides whether that is fatal. It is not, for a create: the row is
 * already saved locally and `sweepUnpushedEvents` will retry on the next sync.
 */
export async function pushEventToGoogle(eventId: string, timeZone: string): Promise<string> {
  const supabase = getServiceClient()
  const { data: event, error } = await supabase
    .from('calendar_events')
    .select('id, title, description, location, starts_at, ends_at, all_day, time_zone, external_id, source')
    .eq('id', eventId)
    .single()

  if (error || !event) throw new Error(`Event ${eventId} not found: ${error?.message ?? 'no row'}`)
  // Never push a row that came FROM Google — that is the pull's territory and
  // would be a write-back loop.
  if (event.source !== 'app') throw new Error(`Refusing to push a ${event.source}-sourced event`)

  const body = toGoogleEvent(event as AppEventRow, timeZone)

  const created = event.external_id
    ? await gFetch(
        `/calendars/${encodeURIComponent(PUSH_TARGET)}/events/${encodeURIComponent(event.external_id)}`,
        { method: 'PATCH', body: JSON.stringify(body) }
      )
    : await gFetch(`/calendars/${encodeURIComponent(PUSH_TARGET)}/events`, {
        method: 'POST',
        body: JSON.stringify(body),
      })

  if (!event.external_id && created?.id) {
    // Backfill so later edits patch instead of creating a second copy, and so
    // the sweep stops picking this row up.
    const { error: backfillError } = await supabase
      .from('calendar_events')
      .update({ external_id: created.id })
      .eq('id', eventId)
    if (backfillError) {
      // The event now exists in Google but we failed to record its id, so the
      // sweep would push it again and duplicate it. Say so loudly.
      throw new Error(
        `Pushed to Google but could not record its id (${backfillError.message}) — ` +
          `event ${created.id} may be pushed twice`
      )
    }
  }

  return created?.id ?? event.external_id!
}

/** Remove an app-created event from Google. Safe to call for an unpushed one. */
export async function deleteEventFromGoogle(externalId: string): Promise<void> {
  try {
    await gFetch(
      `/calendars/${encodeURIComponent(PUSH_TARGET)}/events/${encodeURIComponent(externalId)}`,
      { method: 'DELETE' }
    )
  } catch (err) {
    // Already gone in Google is the outcome we wanted, not a failure.
    if (err instanceof Error && /Google API error (404|410)/.test(err.message)) return
    throw err
  }
}

/**
 * Push every app-created event Google has not seen. This is what makes a failed
 * push at write time self-healing rather than permanent: a dropped connection
 * leaves `external_id` null, and the next sync picks it up.
 */
export async function sweepUnpushedEvents(timeZone: string, timeMin: string, timeMax: string) {
  const supabase = getServiceClient()
  const { data: pending } = await supabase
    .from('calendar_events')
    .select('id')
    .eq('source', 'app')
    .is('external_id', null)
    .gte('starts_at', timeMin)
    .lte('starts_at', timeMax)

  let pushed = 0
  const failures: string[] = []
  for (const row of pending ?? []) {
    try {
      await pushEventToGoogle(row.id, timeZone)
      pushed++
    } catch (err) {
      // One bad event must not abandon the rest of the batch.
      failures.push(err instanceof Error ? err.message : String(err))
    }
  }
  return { pushed, failures }
}

// ─────────────────────────────────────────────
// Sync logic
// ─────────────────────────────────────────────

/**
 * One Google event, as a `calendar_events` row.
 *
 * Extracted and exported so the zone logic can be tested. It was inline in the
 * pull, which meant the single most consequential mapping in the sync — the one
 * that decides what day an event lands on — had no test at all.
 *
 * `time_zone` is step 1 of the per-event timezone work. Google has always sent
 * a zone and this pull has always discarded it, which is also why "no backfill"
 * costs nothing: the upsert is on `external_id`, so every Google row collects
 * its zone from the next sync, from the system that owns the answer.
 *
 * The fallback order is event zone, then the calendar's, then null. Google
 * omits `timeZone` on all-day events — they are dates and have no zone of their
 * own — so without the calendar fallback the events most prone to landing on
 * the wrong day would be the ones with no zone to fix them. Null is left as
 * null rather than defaulted to UTC: readers fall back to the device zone,
 * which is today's behaviour, whereas a stored 'UTC' would be a lie that
 * renders as a real wall clock and looks deliberate.
 *
 * ## All-day rows: two off-by-one bugs, both fixed here in step 3
 *
 * Fixed with the render change rather than before it, because storage alone
 * could not do it: an all-day event stored at midnight in its own zone still
 * renders a day early on a device in another, so the mapping and the rendering
 * had to arrive together or the bug would simply have moved.
 *
 * **1. The start was UTC midnight.** `date + 'T00:00:00Z'` read as the previous
 * day anywhere west of Greenwich — every all-day Google event showed a day early
 * in the US, and was invisible in Europe, which is likely why it survived. Now
 * the instant the day *begins in the event's own zone*, which is the convention
 * the app's own writes and the Google push have always used (`toGoogleEvent`
 * reads the local date straight back out of it).
 *
 * **2. The end was Google's exclusive date, stored as inclusive.** Google's
 * all-day `end.date` is the day AFTER the last day — the push already knows
 * this and adds a day — but the pull copied it across and appended 23:59:59.
 * So a *one-day* event came back spanning three: 24 May began at 02:00 Monaco
 * (24th) and ended at 01:59 on the 26th. Unlike the first bug this one was
 * visible in Europe too. Now decremented back to the last inclusive day.
 *
 * Both rewrite rows in OUR database only, never in Google, and both values are
 * re-derived from `start.date` on every sync — so Google stays authoritative and
 * a wrong result here is recoverable by syncing again.
 *
 * When no zone is known at all — no `start.timeZone`, no calendar zone — the
 * arithmetic falls back to UTC, which reproduces exactly the old `T00:00:00Z`
 * behaviour. Those rows keep a null `time_zone` and render in the device zone,
 * so nothing about them changes in either direction.
 */
/**
 * Is this zone just a way of saying "no zone"?
 *
 * Every spelling of UTC that IANA and Google between them can produce. Compared
 * case-insensitively because feeds are inconsistent about it.
 *
 * Deliberately NOT a check for "offset zero right now": `Europe/London` is
 * GMT+0 all winter and is a genuine zone someone can mean. This matches names,
 * not offsets.
 */
export function isUtcPlaceholder(zone: string | null | undefined): boolean {
  if (!zone) return false
  return UTC_ALIASES.has(zone.trim().toLowerCase())
}

const UTC_ALIASES = new Set([
  'utc', 'gmt', 'z', 'zulu', 'universal', 'greenwich',
  'etc/utc', 'etc/gmt', 'etc/zulu', 'etc/universal', 'etc/greenwich',
  'etc/gmt+0', 'etc/gmt-0', 'etc/gmt0', 'gmt+0', 'gmt-0', 'gmt0',
])

/**
 * Local rows Google no longer has — the ones a deletion in Google left behind.
 *
 * The pull upserts and only upserts, so until now nothing ever removed a cached
 * Google event. Deleting one in Google made it vanish from the list we fetch, we
 * simply stopped updating that row, and it sat in the app forever.
 *
 * `showDeleted=true` is NOT the fix. With `singleEvents=true` Google's list
 * endpoint does not reliably return standalone deleted events — the documented
 * mechanism for deletions is incremental sync with a `syncToken`, which means
 * storing a token per calendar and handling its expiry with a 410. Comparing what
 * came back against what we hold needs neither, and is exact for the window we
 * actually fetched.
 *
 * Kept pure and exported because it decides what to DELETE. The guards are the
 * whole point:
 *
 * - **Only rows with an `external_id`.** A row without one is not Google's.
 * - **Only ids Google did not return.** `seen` must be every non-cancelled id
 *   from every page of that calendar, or a paging bug becomes data loss.
 * - The caller adds the rest — `source = 'google'`, this calendar only, and only
 *   inside the time window that was actually queried.
 *
 * An event rescheduled OUT of the window is correctly removed here: its old
 * occurrence genuinely no longer exists, and the new one arrives when the window
 * reaches it.
 */
export function staleEventIds(
  local: { id: string; external_id: string | null }[],
  seen: Set<string>
): string[] {
  return local
    .filter((row) => row.external_id && !seen.has(row.external_id))
    .map((row) => row.id)
}

export function toAppEventRow(
  e: GoogleEvent,
  dbCalendarId: string,
  calendarZone?: string
) {
  const declaredZone = e.start?.timeZone ?? calendarZone ?? null
  const allDay = !!e.start?.date

  // On a TIMED event, a UTC zone is a placeholder rather than an intention, so
  // it is dropped and the row renders in the reader's zone — which is exactly
  // what Google Calendar shows.
  //
  // Subscribed feeds default to UTC. Kevin's TripIt calendar is one: a JetBlue
  // flight leaving JFK at 9:04pm arrived here labelled UTC, so we rendered the
  // UTC wall clock — "1:04 AM GMT+0" against Google's "9:04pm". Faithful to the
  // field, useless to a person, and worse than the behaviour it replaced.
  // Nobody schedules a flight meaning Greenwich; the zone is the feed's default
  // leaking through, not a statement about the event.
  //
  // This is the failure the step-1 comment predicted — "a stored 'UTC' would be
  // a lie that renders as a real wall clock and looks deliberate" — arriving by
  // a door that comment did not cover: not our own default, but the calendar's,
  // inherited through the fallback above.
  //
  // **All-day events keep it, and that is not an inconsistency.** There the zone
  // is not a wall clock at all; it only decides which local day the stored
  // midnight lands on. Dropping it would leave `starts_at` at UTC midnight with
  // nothing to read it in but the device zone — reviving the day-early bug that
  // step 3 fixed, on precisely the same feed rows.
  //
  // What this does NOT recover: the true local time at the other end of a
  // journey. Google does not have it either — it renders a 9:00 AM Dublin
  // arrival as 4:00am Eastern, and TripIt's real times live only in the event
  // description as prose. Matching Google is the goal here, not beating it.
  const zone = allDay || !isUtcPlaceholder(declaredZone) ? declaredZone : null

  // Unchanged: the all-day arithmetic still uses whatever Google declared, and
  // UTC when nothing is known, which reproduces the previous mapping exactly.
  const dayZone = declaredZone ?? 'UTC'

  // Google's exclusive end back to the last day the event actually covers.
  // `end.date` is absent on some malformed rows; the start is then the only
  // honest answer for a single-day event.
  const lastDay = e.end?.date ? addDays(e.end.date, -1) : (e.start?.date ?? null)

  return {
    calendar_id: dbCalendarId,
    external_id: e.id,
    title: e.summary ?? '(No title)',
    description: e.description ?? null,
    location: e.location ?? null,
    starts_at: allDay
      ? dayStartInZone(e.start!.date!, dayZone)
      : (e.start?.dateTime ?? null),
    ends_at: allDay
      ? (lastDay ? dayEndInZone(lastDay, dayZone) : null)
      : (e.end?.dateTime ?? null),
    all_day: allDay,
    time_zone: zone,
    source: 'google' as const,
  }
}

/**
 * A short lease that stops two syncs running at once.
 *
 * `sweepUnpushedEvents` selects rows with a null `external_id` and pushes each
 * one; nothing marks a row as being pushed. Two overlapping runs therefore both
 * see the same event and both create it in Google — one row ends up pointing at
 * one of the two, and the other is an orphan duplicate in a calendar that no
 * longer matches the app. Cleaning that up is manual.
 *
 * That was close to unreachable while sync was a button someone pressed once.
 * Focus-sync makes it ordinary: a phone and a laptop both waking to the same
 * calendar is exactly the case, and they share no browser state to throttle
 * against. So the guard has to live server-side.
 *
 * Leased rather than locked, in `app_credentials` — the same key/value store and
 * the same shape as `warnOncePerInterval`'s markers. A crashed run cannot wedge
 * sync permanently; the lease simply ages out.
 *
 * **Fails open.** If the table cannot be read or written — migration 006 not
 * applied, RLS refusing — the sync proceeds unguarded rather than refusing to
 * run at all. That restores exactly the previous behaviour, which is the right
 * failure direction: a rare duplicate is recoverable, a calendar that silently
 * stops syncing is not.
 */
export const SYNC_LEASE_KEY = 'calendar_sync_lease'
export const SYNC_LEASE_MS = 2 * 60 * 1000

/** Exported for tests — the fail-open branches are the ones worth pinning. */
export async function acquireSyncLease(
  supabase: ReturnType<typeof getServiceClient>
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_credentials')
      .select('value')
      .eq('key', SYNC_LEASE_KEY)
      .maybeSingle()

    if (!error && data?.value) {
      const held = Date.parse(data.value)
      if (Number.isFinite(held) && Date.now() - held < SYNC_LEASE_MS) return false
    }

    const { error: writeError } = await supabase
      .from('app_credentials')
      .upsert(
        { key: SYNC_LEASE_KEY, value: new Date().toISOString(), expires_at: null },
        { onConflict: 'key' }
      )
    // Could not take the lease: proceed anyway rather than block syncing.
    if (writeError) console.warn(`Could not record the sync lease: ${writeError.message}`)
    return true
  } catch (err) {
    console.warn('Sync lease check failed; proceeding unguarded:', err)
    return true
  }
}

/** Released early so a following sync is not made to wait out the whole lease. */
async function releaseSyncLease(
  supabase: ReturnType<typeof getServiceClient>
): Promise<void> {
  try {
    await supabase.from('app_credentials').delete().eq('key', SYNC_LEASE_KEY)
  } catch {
    // Left to age out, which is what the lease is for.
  }
}

export async function syncGoogleCalendar(timeZone?: string) {
  const supabase = getServiceClient()
  const integration = await getGoogleTokens()
  if (!integration) throw new Error('Google Calendar not connected')

  // Checked after the connection test so a disconnected account still reports
  // that clearly rather than as a skipped run.
  if (!(await acquireSyncLease(supabase))) {
    return { synced: 0, removed: 0, pushed: 0, pushFailures: [] as string[], skipped: true }
  }
  // try/finally so a Google or database failure releases the lease rather
  // than making the next attempt look like a skipped run for two minutes.
  try {
    const metadata = (integration.metadata ?? {}) as Record<string, unknown>
    const selectedIds: string[] = (metadata.calendar_ids as string[]) ?? ['primary']
    // The caller's zone when a browser triggered this, else the last one we saw.
    // Only all-day dates depend on it; UTC is the honest fallback.
    const zone = timeZone ?? (metadata.time_zone as string) ?? 'UTC'

    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    // Push before pulling. Anything swept up now comes back tagged and is
    // filtered out below, rather than being pulled in the same run as a stranger.
    const swept = await sweepUnpushedEvents(zone, timeMin, timeMax)

    let totalUpserted = 0
    let totalRemoved = 0

    // Fetched once per sync rather than only when a calendar is missing, because
    // the per-event zone needs it too: an event that carries no `start.timeZone`
    // falls back to the zone of the calendar it lives on. One extra call on a
    // manual sync is a fair price for not guessing.
    const gcals = await listGoogleCalendars()

    for (const calendarId of selectedIds) {
      const gcal = gcals.find((c) => c.id === calendarId)
      // The calendar's own zone, used only as that fallback. Left undefined
      // rather than defaulted to UTC — an honest null beats a plausible lie that
      // renders as a real wall clock.
      const calendarZone = gcal?.timeZone

      // Ensure calendar exists in our DB
      const { data: existingCal } = await supabase
        .from('calendars')
        .select('id')
        .eq('source', 'google')
        .eq('external_id', calendarId)
        .single()

      let dbCalendarId = existingCal?.id
      if (!dbCalendarId) {
        const { data: newCal } = await supabase
          .from('calendars')
          .insert({
            name: gcal?.summary ?? calendarId,
            color: gcal?.backgroundColor ?? '#4285F4',
            source: 'google',
            external_id: calendarId,
            is_visible: true,
          })
          .select('id')
          .single()
        dbCalendarId = newCal?.id
      }

      if (!dbCalendarId) continue

      // Fetch events from Google
      let pageToken: string | undefined
      // Every id this calendar returned, across every page. Built before the
      // echo filter on purpose: an app-pushed event Google hands back is still
      // an event Google has, and its absence from this set would be a lie.
      const seen = new Set<string>()
      do {
        const data = await listGoogleEvents(calendarId, timeMin, timeMax, pageToken)
        const items: GoogleEvent[] = data.items ?? []
        pageToken = data.nextPageToken

        for (const e of items) {
          if (e.id && e.status !== 'cancelled') seen.add(e.id)
        }

        if (!items.length) break

        const rows = items
          .filter((e) => e.status !== 'cancelled')
          // Skip anything this app pushed. Without this the upsert below would
          // overwrite the row's `source` and `calendar_id`, migrating our own
          // event off its app calendar and blocking every later push.
          .filter((e) => !isAppPushedEvent(e))
          .map((e) => toAppEventRow(e, dbCalendarId, calendarZone))
          .filter((r) => r.starts_at)

        if (rows.length) {
          const { error, count } = await supabase
            .from('calendar_events')
            .upsert(rows, { onConflict: 'external_id', count: 'exact' })
          if (error) {
            console.error('Upsert error:', error)
            throw new Error(`Failed to upsert events: ${error.message}`)
          }
          totalUpserted += count ?? rows.length
        }
      } while (pageToken)

      // ── Reconcile: delete what Google no longer has ──────────────────
      // Only reachable once every page above succeeded — the loop throws
      // otherwise — so a partial fetch can never be read as "Google deleted
      // everything". Scoped to this calendar, to google-sourced rows, and to the
      // window actually queried, because that is the only span we have evidence
      // about.
      const { data: cached, error: cacheError } = await supabase
        .from('calendar_events')
        .select('id, external_id')
        .eq('source', 'google')
        .eq('calendar_id', dbCalendarId)
        .gte('starts_at', timeMin)
        .lte('starts_at', timeMax)

      if (cacheError) {
        // Reported, not thrown: failing to tidy up must not cost the import that
        // just succeeded.
        console.warn(`Could not read cached events to reconcile: ${cacheError.message}`)
      } else {
        const stale = staleEventIds(cached ?? [], seen)
        // Chunked because a delete filter is a URL, and a long trip can leave
        // hundreds of stale rows behind at once.
        for (let i = 0; i < stale.length; i += 200) {
          const batch = stale.slice(i, i + 200)
          const { error: deleteError } = await supabase
            .from('calendar_events')
            .delete()
            .in('id', batch)
          if (deleteError) {
            console.warn(`Could not remove ${batch.length} deleted events: ${deleteError.message}`)
            break
          }
          totalRemoved += batch.length
        }
      }
    }

    // Update last synced time. `time_zone` is recorded so a sweep triggered
    // without a browser still dates all-day events correctly.
    await supabase.from('user_integrations')
      .update({ metadata: { ...metadata, last_synced: new Date().toISOString(), calendar_ids: selectedIds, time_zone: zone } })
      .eq('provider', 'google_calendar')

    return {
      synced: totalUpserted,
      removed: totalRemoved,
      pushed: swept.pushed,
      pushFailures: swept.failures,
      skipped: false,
    }
  } finally {
    await releaseSyncLease(supabase)
  }
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface GoogleCalendarListEntry {
  id: string
  summary: string
  backgroundColor?: string
  foregroundColor?: string
  primary?: boolean
  accessRole: string
  /** The calendar's own zone — the fallback when an event carries none. */
  timeZone?: string
}

interface GoogleEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  status?: string
  // Google sends `timeZone` alongside the time. It was absent from this type,
  // so the pull discarded the one piece of data the whole per-event timezone
  // work needs — and which Google has had all along.
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  extendedProperties?: { private?: Record<string, string> }
}
