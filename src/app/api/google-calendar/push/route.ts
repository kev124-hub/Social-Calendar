import { NextResponse } from 'next/server'
import { pushEventToGoogle, deleteEventFromGoogle } from '@/lib/google-calendar'
import { createClient } from '@/lib/supabase/server'

/**
 * Push one app-created event to Google.
 *
 * This route exists because the browser cannot do it: the Google tokens live in
 * `user_integrations`, which is service-role only, so `src/lib/events.ts` calls
 * here after its Supabase write succeeds.
 *
 * A failure here is deliberately NOT fatal to the caller. The event is already
 * saved locally by the time this runs, and `sweepUnpushedEvents` retries on the
 * next sync — so the response reports the problem rather than pretending the
 * whole create failed. Losing the event Kevin just typed because Google was
 * briefly unreachable would be the worse bug.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { eventId?: string; externalId?: string; op?: string; timeZone?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Malformed request body' }, { status: 400 })
  }

  const { eventId, externalId, op, timeZone } = body

  try {
    if (op === 'delete') {
      // Nothing to remove in Google for an event that never got there.
      if (!externalId) return NextResponse.json({ ok: true, skipped: 'never pushed' })
      await deleteEventFromGoogle(externalId)
      return NextResponse.json({ ok: true })
    }

    if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    // Fall back to UTC rather than rejecting: only all-day dates depend on the
    // zone, and refusing the push outright would be a worse trade.
    const id = await pushEventToGoogle(eventId, timeZone || 'UTC')
    return NextResponse.json({ ok: true, externalId: id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Google push failed'
    // 502, not 500: the app's own write succeeded and it is the upstream that
    // failed. The caller uses this to say "saved, not yet in Google".
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
