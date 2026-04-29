import { createClient } from '@supabase/supabase-js'

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
// Sync logic
// ─────────────────────────────────────────────

export async function syncGoogleCalendar() {
  const supabase = getServiceClient()
  const integration = await getGoogleTokens()
  if (!integration) throw new Error('Google Calendar not connected')

  const selectedIds: string[] = (integration.metadata as any)?.calendar_ids ?? ['primary']

  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  let totalUpserted = 0

  for (const calendarId of selectedIds) {
    // Ensure calendar exists in our DB
    const { data: existingCal } = await supabase
      .from('calendars')
      .select('id')
      .eq('source', 'google')
      .eq('external_id', calendarId)
      .single()

    let dbCalendarId = existingCal?.id
    if (!dbCalendarId) {
      // Fetch calendar metadata from Google
      const gcals = await listGoogleCalendars()
      const gcal = gcals.find((c) => c.id === calendarId)
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
    do {
      const data = await listGoogleEvents(calendarId, timeMin, timeMax, pageToken)
      const items: GoogleEvent[] = data.items ?? []
      pageToken = data.nextPageToken

      if (!items.length) break

      const rows = items
        .filter((e) => e.status !== 'cancelled')
        .map((e) => ({
          calendar_id: dbCalendarId,
          external_id: e.id,
          title: e.summary ?? '(No title)',
          description: e.description ?? null,
          location: e.location ?? null,
          starts_at: e.start?.dateTime ?? (e.start?.date ? e.start.date + 'T00:00:00Z' : null),
          ends_at: e.end?.dateTime ?? (e.end?.date ? e.end.date + 'T23:59:59Z' : null),
          all_day: !!e.start?.date,
          source: 'google' as const,
        }))
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
  }

  // Update last synced time
  await supabase.from('user_integrations')
    .update({ metadata: { ...(integration.metadata as object), last_synced: new Date().toISOString(), calendar_ids: selectedIds } })
    .eq('provider', 'google_calendar')

  return { synced: totalUpserted }
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
}

interface GoogleEvent {
  id: string
  summary?: string
  description?: string
  location?: string
  status?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}
