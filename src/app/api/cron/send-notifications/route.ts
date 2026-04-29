import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendNotificationEmail } from '@/lib/email'

// Called by Vercel Cron every 15 minutes
// vercel.json: { "crons": [{ "path": "/api/cron/send-notifications", "schedule": "*/15 * * * *" }] }

export async function GET() {
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
