import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { runPublishCycle } from '@/lib/publisher'

// Stage B4 — Instagram auto-publish worker (cron entry point).
//
// Cadence: pinged every 5 minutes by the external pinger (cron-job.org) sending
// `Authorization: Bearer <CRON_SECRET>`. Vercel Hobby only allows daily crons,
// which is why the pinger drives the real cadence; `checkCronAuth` fails closed
// when CRON_SECRET is unset, and src/proxy.ts already treats /api/cron as a
// public path so session-less callers reach this handler instead of /login.
//
// Each run advances every due post by ONE step and returns — it never waits for
// Meta to finish ingesting. See src/lib/publisher.ts for the state machine.

// Ceiling for a run: the batch is bounded and each post does a few network calls,
// so this is generous. 60s is also the Vercel Hobby maximum.
export const maxDuration = 60

export async function GET(request: Request) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized

  try {
    const result = await runPublishCycle()
    // 200 even when result.ok is false: an unconfigured integration is a state to
    // report, not a transport error, and the pinger's failure alerts should be
    // reserved for the endpoint actually being unreachable.
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('publish-posts cron failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
