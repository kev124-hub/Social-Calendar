import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { sendNotificationEmail } from '@/lib/email'
import { runNotifyCycle } from '@/lib/notifier'
import { createAdminClient } from '@/lib/supabase/admin'

// Cadence: pinged every 5 minutes by an external pinger (cron-job.org) that
// sends `Authorization: Bearer <CRON_SECRET>`. Vercel Cron (vercel.json) also
// hits this daily at 12:00 UTC as a backstop — on Hobby, daily is the finest
// Vercel-native schedule allowed, which is why the external pinger drives the
// real cadence. Both entry points authenticate with the same CRON_SECRET.
//
// Two jobs run here:
//   1. Stage B5's notify-to-post reminders, driven off social_posts directly.
//   2. The generic `notifications` queue from the original schema.
//
// They are kept separate on purpose. The queue holds a message composed when the
// notification was *scheduled*; B5's reminders must reflect the post as it is at
// *send* time, because captions get edited right up to posting. Draining a
// pre-baked row would email a stale caption.

// Dropbox link minting plus a handful of emails; comfortably inside the Hobby
// ceiling, but a batch of ten shouldn't run under the default 15s either.
export const maxDuration = 60

export async function GET(request: Request) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized

  const supabase = createAdminClient()

  // B5 first: these are time-sensitive in a way the generic queue is not.
  // Isolated so a failure here still lets the queue drain, and vice versa.
  let notify
  let notifyError: string | undefined
  try {
    notify = await runNotifyCycle(supabase)
  } catch (err) {
    notifyError = err instanceof Error ? err.message : String(err)
    console.error('send-notifications: notify-to-post cycle failed:', notifyError)
  }

  // The generic queue. Note: nothing in the app currently writes to this table —
  // it is the original schema's scheduled-notification mechanism, kept working
  // for calendar events and any future producer (e.g. the web-push upgrade).
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('sent', false)
    .lte('send_at', new Date().toISOString())
    .order('send_at')

  if (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json(
      { error: error.message, notify: notify ?? null, notifyError: notifyError ?? null },
      { status: 500 }
    )
  }

  let sent = 0
  for (const notification of notifications ?? []) {
    try {
      await sendNotificationEmail(`Reminder: ${notification.message}`, notification.message)
      await supabase
        .from('notifications')
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq('id', notification.id)
      sent++
    } catch (err) {
      console.error(`Failed to send notification ${notification.id}:`, err)
    }
  }

  return NextResponse.json({
    ok: !notifyError,
    // Stage B5
    notify: notify ?? null,
    notifyError: notifyError ?? null,
    // Generic queue
    sent,
    total: notifications?.length ?? 0,
  })
}
