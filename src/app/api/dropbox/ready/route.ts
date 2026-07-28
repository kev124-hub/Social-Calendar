import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTemporaryLink, listReadyFolder } from '@/lib/dropbox'
import { MAX_FACES } from '@/lib/ready-reel'

// Lists the Dropbox "Ready to Post" folder for the post dialog's media picker
// and for /home's ReadyReel.
// User-facing action → requires a logged-in session (not CRON_SECRET).
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // `?links=1` adds a temporary download link per file, which ReadyReel paints
  // the first frame of. Off by default and opt-in per caller: each link is its
  // own Dropbox round trip, and the post dialog's picker only needs names and
  // paths. The links expire in ~4h — long-lived enough for a page view, which
  // is why /home re-fetches rather than caching them anywhere.
  const withLinks = request.nextUrl.searchParams.get('links') === '1'

  try {
    const files = await listReadyFolder()
    if (!withLinks) return NextResponse.json({ files })

    // Only the files the reel can actually draw get a link. The rest are still
    // returned — the count above the reel reports the whole folder — they just
    // never needed a URL nobody would look at.
    const linked = await Promise.all(
      files.slice(0, MAX_FACES).map(async (file) => {
        try {
          return { ...file, link: await getTemporaryLink(file.path) }
        } catch {
          // One file Dropbox won't mint a link for must not blank the reel.
          // The face falls back to its striped placeholder and the others draw.
          return { ...file, link: null }
        }
      })
    )

    return NextResponse.json({ files: [...linked, ...files.slice(MAX_FACES)] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list Dropbox folder'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
