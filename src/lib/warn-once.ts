// Rate-limited "something is wrong" emails for the stateless publish cron.
//
// The cron runs every 5 minutes, so any condition that persists — a missing env
// var, a token that cannot be refreshed — would email 288 times a day if it
// warned naively. A serverless run has no memory, so the last-sent timestamp
// lives in `app_credentials` (migration 006) under a per-condition marker key.
//
// Keys must be distinct per condition: sharing one would let the first problem
// to fire suppress a second, unrelated one for a day.

import { sendNotificationEmail } from '@/lib/email'
import type { AdminClient } from '@/lib/supabase/admin'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Send a warning email at most once per interval, for the condition identified
 * by `markerKey`. Returns true when an email was sent.
 *
 * Fails open: if the marker can't be read or written (e.g. migration 006 is not
 * applied yet), warn anyway. A duplicate email is a far better failure than a
 * problem that stays silent.
 *
 * Never throws — a broken mailbox must not take down the publish run that is
 * trying to report on it.
 */
export async function warnOncePerInterval(
  supabase: AdminClient,
  markerKey: string,
  subject: string,
  body: string,
  intervalMs: number = DAY_MS
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_credentials')
      .select('value')
      .eq('key', markerKey)
      .maybeSingle()

    if (!error && data?.value) {
      const lastSent = Date.parse(data.value)
      if (Number.isFinite(lastSent) && Date.now() - lastSent < intervalMs) return false
    }

    // Recorded before sending: sendNotificationEmail reports delivery failures to
    // the console rather than to us, so there is no success to wait for. Marking
    // first is also the safer direction — the cost of a lost warning is one day
    // of silence, the cost of not marking would be an email every 5 minutes.
    const { error: writeError } = await supabase
      .from('app_credentials')
      .upsert({ key: markerKey, value: new Date().toISOString(), expires_at: null }, { onConflict: 'key' })
    if (writeError) console.warn(`Could not record warning timestamp for ${markerKey}: ${writeError.message}`)

    await sendNotificationEmail(subject, body)
    return true
  } catch (err) {
    console.error(`Failed to send "${subject}" warning:`, err)
    return false
  }
}
