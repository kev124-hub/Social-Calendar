import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendNotificationEmail } from '@/lib/email'
import { checkCronAuth } from '@/lib/cron-auth'

// Cadence: pinged every 5 minutes by an external pinger (cron-job.org) that
// sends `Authorization: Bearer <CRON_SECRET>`. Vercel Cron (vercel.json) also
// hits this daily at 12:00 UTC as a backstop — on Hobby, daily is the finest
// Vercel-native schedule allowed, which is why the external pinger drives the
// real cadence. Both entry points authenticate with the same CRON_SECRET.

export async function GET(request: Request) {
  const unauthorized = checkCronAuth(request)
  if (unauthorized) return unauthorized

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch all unsent notifications due now or in the past
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('sent', false)
    .lte('send_at', new Date().toISOString())
    .order('send_at')

  if (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!notifications?.length) {
    return NextResponse.json({ sent: 0 })
  }

  let sent = 0
  for (const notification of notifications) {
    try {
      await sendNotificationEmail(
        `Reminder: ${notification.message}`,
        notification.message
      )
      await supabase
        .from('notifications')
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq('id', notification.id)
      sent++
    } catch (err) {
      console.error(`Failed to send notification ${notification.id}:`, err)
    }
  }

  return NextResponse.json({ sent, total: notifications.length })
}
