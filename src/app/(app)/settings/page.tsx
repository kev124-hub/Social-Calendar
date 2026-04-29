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
          <h2 className="font-semibold text-sm">Claude AI Event Entry</h2>
          <p className="text-sm text-muted-foreground">Natural language calendar event creation — Phase 2</p>
        </section>
      </div>
    </div>
  )
}
