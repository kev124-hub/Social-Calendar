import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listReadyFolder } from '@/lib/dropbox'

// Lists the Dropbox "Ready to Post" folder for the post dialog's media picker.
// User-facing action → requires a logged-in session (not CRON_SECRET).
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const files = await listReadyFolder()
    return NextResponse.json({ files })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list Dropbox folder'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
