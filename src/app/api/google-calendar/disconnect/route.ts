import { NextResponse } from 'next/server'
import { disconnectGoogle } from '@/lib/google-calendar'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await disconnectGoogle()
  return NextResponse.json({ ok: true })
}
