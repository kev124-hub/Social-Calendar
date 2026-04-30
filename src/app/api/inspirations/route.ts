import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const admin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUserFromRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    // Check permanent extension API key first (never expires)
    const { data: integration } = await admin
      .from('user_integrations')
      .select('id')
      .eq('provider', 'extension')
      .eq('access_token', token)
      .maybeSingle()
    if (integration) return { id: 'extension', email: null } as { id: string; email: string | null }
    // Fall back to Supabase JWT (direct API calls)
    const { data: { user } } = await admin.auth.getUser(token)
    return user
  }
  // Session cookie (in-app use)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, title, source_url, image_url, notes, tags, trip_name, clipped_via_extension } = body as {
    type: string
    title?: string
    source_url?: string
    image_url?: string
    notes?: string
    tags?: string[]
    trip_name?: string
    clipped_via_extension?: boolean
  }

  if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 })

  let imagePath: string | null = null

  // Download and re-upload image from URL
  if (type === 'image' && image_url) {
    try {
      const res = await fetch(image_url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)

      const contentType = res.headers.get('content-type') ?? 'image/jpeg'
      const ext = contentType.split('/')[1]?.split(';')[0] ?? 'jpg'
      const arrayBuffer = await res.arrayBuffer()
      const path = `${Date.now()}.${ext}`

      const { error: uploadError } = await admin.storage
        .from('inspirations')
        .upload(path, arrayBuffer, { contentType, upsert: false })

      if (uploadError) throw uploadError
      imagePath = path
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Image download failed'
      return NextResponse.json({ error: msg }, { status: 422 })
    }
  }

  const { data, error } = await admin.from('inspirations').insert({
    type,
    title: (title as string)?.trim() || null,
    source_url: (source_url as string)?.trim() || null,
    image_path: imagePath,
    notes: (notes as string)?.trim() || null,
    tags: Array.isArray(tags) ? tags : [],
    trip_name: (trip_name as string)?.trim() || null,
    clipped_via_extension: !!clipped_via_extension,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inspiration: data }, { status: 201 })
}
