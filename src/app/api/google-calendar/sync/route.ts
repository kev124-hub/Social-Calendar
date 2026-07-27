import { NextResponse } from 'next/server'
import { syncGoogleCalendar } from '@/lib/google-calendar'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The browser's zone, used to date all-day events pushed to Google. Optional:
  // the sync falls back to the last zone it saw, then UTC.
  let timeZone: string | undefined
  try {
    timeZone = (await request.json())?.timeZone
  } catch {
    // No body is fine — this route was callable with none before.
  }

  try {
    const result = await syncGoogleCalendar(timeZone)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
