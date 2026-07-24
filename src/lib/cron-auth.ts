import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

/**
 * Verify a cron request is authorized via `Authorization: Bearer <CRON_SECRET>`.
 *
 * Returns a `NextResponse` (401/500) to short-circuit the handler when the
 * request is not authorized, or `null` when it is authorized.
 *
 * Fails closed: if `CRON_SECRET` is not configured, every request is rejected —
 * a cron endpoint that can trigger side effects (emails now, Instagram
 * publishing later) must never run unauthenticated.
 *
 * The same secret authorizes both entry points:
 *   - the external pinger (cron-job.org), which we configure to send the header;
 *   - Vercel Cron, which auto-injects `Authorization: Bearer $CRON_SECRET` when
 *     the env var is set.
 */
export function checkCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('CRON_SECRET is not set — rejecting cron request (fail closed)')
    return NextResponse.json(
      { error: 'Cron authentication is not configured' },
      { status: 500 }
    )
  }

  const provided = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`

  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

// Length-safe, constant-time string comparison (avoids leaking the secret via
// early-exit timing). timingSafeEqual throws on unequal lengths, so guard first.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}
