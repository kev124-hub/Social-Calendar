import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const admin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function generateKey() {
  return `mjk_${crypto.randomUUID().replace(/-/g, '')}`
}

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await admin
    .from('user_integrations')
    .select('access_token')
    .eq('provider', 'extension')
    .maybeSingle()

  if (data?.access_token) {
    return NextResponse.json({ key: data.access_token })
  }

  const key = generateKey()
  await admin.from('user_integrations').insert({ provider: 'extension', access_token: key })
  return NextResponse.json({ key })
}

export async function POST() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = generateKey()
  await admin.from('user_integrations').upsert(
    { provider: 'extension', access_token: key },
    { onConflict: 'provider' }
  )
  return NextResponse.json({ key })
}
