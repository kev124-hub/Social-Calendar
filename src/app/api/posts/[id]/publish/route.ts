import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runPublishCycle } from '@/lib/publisher'

// "Publish now" — manual trigger of the publisher for a single post.
//
// This is B4's test harness (and the API half of B6's button): it exercises the
// exact same state machine the cron uses, so a successful manual publish is real
// evidence the cron path works. Unlike the cron it ignores scheduled_at and
// publish_mode — that's the point — but it cannot republish a post that already
// has an ig_media_id.
//
// User-facing action, so it authenticates with the logged-in session, NOT
// CRON_SECRET. Note this path is not under /api/cron, so src/proxy.ts requires a
// session here, which is the intent.
//
// One call advances the post by one step, mirroring the cron. A Reel therefore
// usually needs the cron (or another click) to carry it from "processing" to
// "published" once Meta finishes ingesting — the response's `action` says which
// step happened.

export const maxDuration = 60

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await runPublishCycle({ postId: id })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 503 })
    }

    const outcome = result.outcomes[0]
    if (!outcome) {
      // Selection filters out posts that already carry an ig_media_id, so the
      // usual cause is exactly that.
      return NextResponse.json(
        { error: 'Nothing to publish — the post does not exist or has already been published.' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      action: outcome.action,
      message: outcome.message ?? null,
      // Surfaced so the UI can distinguish "failed" from "still working".
      ok: outcome.action !== 'failed',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Manual publish of post ${id} failed:`, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
