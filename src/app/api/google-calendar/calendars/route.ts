import { NextRequest, NextResponse } from 'next/server'
import { listGoogleCalendars, getGoogleTokens } from '@/lib/google-calendar'
import { createClient } from '@/lib/supabase/server'
import { createClient as serviceClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [calendars, integration] = await Promise.all([
      listGoogleCalendars(),
      getGoogleTokens(),
    ])
    const selectedIds: string[] = (integration?.metadata as any)?.calendar_ids ?? []
    return NextResponse.json({ calendars, selectedIds })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Update which calendars are selected for sync
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { calendar_ids } = await request.json()
  const service = serviceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const integration = await getGoogleTokens()
  await service.from('user_integrations').update({
    metadata: { ...(integration?.metadata as object ?? {}), calendar_ids },
  }).eq('provider', 'google_calendar')

  return NextResponse.json({ ok: true })
}
