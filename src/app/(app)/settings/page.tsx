import { createClient } from '@supabase/supabase-js'
import { GoogleCalendarSettings } from '@/components/settings/GoogleCalendarSettings'

async function getIntegrations() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase
      .from('user_integrations')
      .select('provider, token_expires_at, metadata')
    return data ?? []
  } catch {
    return []
  }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const params = await searchParams
  const integrations = await getIntegrations()
  const googleIntegration = integrations.find((i) => i.provider === 'google_calendar')
  const isGoogleConnected = !!googleIntegration
  const lastSynced = (googleIntegration?.metadata as any)?.last_synced ?? null

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Settings & Integrations</h1>
      <p className="text-muted-foreground mb-8">Manage connected accounts and preferences.</p>

      {params.connected === 'google_calendar' && (
        <div className="mb-6 text-sm text-green-700 bg-green-50 border border-green-200 px-4 py-3 rounded-lg">
          ✓ Google Calendar connected successfully. Click <strong>Sync now</strong> to import your events.
        </div>
      )}
      {params.error === 'google_calendar_denied' && (
        <div className="mb-6 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-lg">
          Google Calendar connection was cancelled.
        </div>
      )}

      <div className="space-y-6">
        <GoogleCalendarSettings
          connected={isGoogleConnected}
          lastSynced={lastSynced}
        />

        <section className="border border-border rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-sm">TripIt</h2>
          <p className="text-sm text-muted-foreground">Sync travel itineraries from TripIt (read-only).</p>
          <p className="text-xs text-muted-foreground italic">Coming soon</p>
        </section>

        <section className="border border-border rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-sm">Email Notifications</h2>
          <p className="text-sm text-muted-foreground">
            Reminders send to <strong>Hello@mustachejourney.com</strong> daily at noon UTC.
          </p>
          <p className="text-xs text-muted-foreground">
            Set notification time on any event, post, or UGC deal to queue a reminder.
          </p>
        </section>

        <section className="border border-border rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-sm">Install on iPhone</h2>
          <p className="text-sm text-muted-foreground">Add this app to your home screen for a full-screen experience with no browser chrome.</p>
          <ol className="text-sm text-muted-foreground space-y-1.5 list-none">
            <li className="flex gap-2"><span className="font-medium text-foreground shrink-0">1.</span>Open this site in <strong className="text-foreground">Safari</strong> (not Chrome)</li>
            <li className="flex gap-2"><span className="font-medium text-foreground shrink-0">2.</span>Tap the <strong className="text-foreground">Share</strong> button <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">⎙</span> at the bottom of the screen</li>
            <li className="flex gap-2"><span className="font-medium text-foreground shrink-0">3.</span>Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong></li>
            <li className="flex gap-2"><span className="font-medium text-foreground shrink-0">4.</span>Tap <strong className="text-foreground">Add</strong> — the MJ Calendar icon will appear on your home screen</li>
          </ol>
          <p className="text-xs text-muted-foreground">Must use Safari on iOS for true standalone mode. Chrome on iOS opens in a browser tab.</p>
        </section>

        <section className="border border-border rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-sm">Claude AI Event Entry</h2>
          <p className="text-sm text-muted-foreground">Type any event in natural language in the Calendar header — it&apos;s parsed instantly by Claude and added to your calendar.</p>
        </section>
      </div>
    </div>
  )
}
