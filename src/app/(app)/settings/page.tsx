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
      <h1 className="font-heading text-[28px] font-normal tracking-tight mb-2">Settings & Integrations</h1>
      <p className="text-[#7b7b7b] text-sm mb-8">Manage connected accounts and preferences.</p>

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

        <section className="border border-[#d6d6d6] rounded-[24px] p-6 space-y-4 bg-white shadow-[rgba(0,0,0,0.04)_0px_8px_16px_0px]">
          <h2 className="text-[14px] font-semibold text-black tracking-tight">TripIt</h2>
          <p className="text-sm text-muted-foreground">Sync travel itineraries from TripIt (read-only).</p>
          <p className="text-xs text-muted-foreground italic">Coming soon</p>
        </section>

        <section className="border border-[#d6d6d6] rounded-[24px] p-6 space-y-4 bg-white shadow-[rgba(0,0,0,0.04)_0px_8px_16px_0px]">
          <h2 className="text-[14px] font-semibold text-black tracking-tight">Email Notifications</h2>
          <p className="text-sm text-muted-foreground">
            Reminders send to <strong>Hello@mustachejourney.com</strong> daily at noon UTC.
          </p>
          <p className="text-xs text-muted-foreground">
            Set notification time on any event, post, or UGC deal to queue a reminder.
          </p>
        </section>

        <section className="border border-[#d6d6d6] rounded-[24px] p-6 space-y-4 bg-white shadow-[rgba(0,0,0,0.04)_0px_8px_16px_0px]">
          <h2 className="text-[14px] font-semibold text-black tracking-tight">Install on iPhone</h2>
          <p className="text-sm text-muted-foreground">Add this app to your home screen for a full-screen experience with no browser chrome.</p>
          <ol className="text-sm text-muted-foreground space-y-1.5 list-none">
            <li className="flex gap-2 items-start"><span className="w-5 h-5 rounded-full bg-[#f1ccff] flex items-center justify-center text-[11px] font-semibold text-black shrink-0 mt-0.5">1</span>Open this site in <strong className="text-foreground">Safari</strong> (not Chrome)</li>
            <li className="flex gap-2 items-start"><span className="w-5 h-5 rounded-full bg-[#f1ccff] flex items-center justify-center text-[11px] font-semibold text-black shrink-0 mt-0.5">2</span>Tap the <strong className="text-foreground">Share</strong> button <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">⎙</span> at the bottom of the screen</li>
            <li className="flex gap-2 items-start"><span className="w-5 h-5 rounded-full bg-[#f1ccff] flex items-center justify-center text-[11px] font-semibold text-black shrink-0 mt-0.5">3</span>Scroll down and tap <strong className="text-foreground">Add to Home Screen</strong></li>
            <li className="flex gap-2 items-start"><span className="w-5 h-5 rounded-full bg-[#f1ccff] flex items-center justify-center text-[11px] font-semibold text-black shrink-0 mt-0.5">4</span>Tap <strong className="text-foreground">Add</strong> — the MJ Calendar icon will appear on your home screen</li>
          </ol>
          <p className="text-xs text-muted-foreground">Must use Safari on iOS for true standalone mode. Chrome on iOS opens in a browser tab.</p>
        </section>

        <section className="border border-[#d6d6d6] rounded-[24px] p-6 space-y-4 bg-white shadow-[rgba(0,0,0,0.04)_0px_8px_16px_0px]">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-black tracking-tight">Chrome Extension</h2>
            <a
              href="/extension-auth"
              className="text-xs font-medium text-primary hover:underline"
            >
              Get API token →
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            Right-click any image or page in Chrome to save it directly to your Inspiration Board.
          </p>
          <ol className="text-sm text-muted-foreground space-y-1 list-none">
            <li className="flex gap-2 items-start"><span className="w-5 h-5 rounded-full bg-[#f1ccff] flex items-center justify-center text-[11px] font-semibold text-black shrink-0 mt-0.5">1</span>Load the <code className="text-xs bg-muted px-1.5 py-0.5 rounded">extension/</code> folder in Chrome (chrome://extensions → Load unpacked)</li>
            <li className="flex gap-2 items-start"><span className="w-5 h-5 rounded-full bg-[#f1ccff] flex items-center justify-center text-[11px] font-semibold text-black shrink-0 mt-0.5">2</span>Click <strong className="text-foreground">Get API token</strong> above, copy your token</li>
            <li className="flex gap-2 items-start"><span className="w-5 h-5 rounded-full bg-[#f1ccff] flex items-center justify-center text-[11px] font-semibold text-black shrink-0 mt-0.5">3</span>Paste into the extension settings → Save</li>
          </ol>
        </section>

        <section className="border border-[#d6d6d6] rounded-[24px] p-6 space-y-4 bg-white shadow-[rgba(0,0,0,0.04)_0px_8px_16px_0px]">
          <h2 className="text-[14px] font-semibold text-black tracking-tight">Claude AI Event Entry</h2>
          <p className="text-sm text-muted-foreground">Type any event in natural language in the Calendar header — it&apos;s parsed instantly by Claude and added to your calendar.</p>
        </section>
      </div>
    </div>
  )
}
