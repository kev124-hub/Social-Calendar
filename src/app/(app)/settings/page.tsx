export default function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Settings & Integrations</h1>
      <p className="text-muted-foreground mb-8">Manage your connected accounts and preferences.</p>

      <div className="space-y-6">
        <section className="border border-border rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-sm">Google Calendar</h2>
          <p className="text-sm text-muted-foreground">Connect your Google account to sync calendar events.</p>
          <button className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium opacity-50 cursor-not-allowed" disabled>
            Connect Google Calendar — Phase 1
          </button>
        </section>

        <section className="border border-border rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-sm">TripIt</h2>
          <p className="text-sm text-muted-foreground">Sync your travel itineraries from TripIt (read-only).</p>
          <button className="text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium opacity-50 cursor-not-allowed" disabled>
            Connect TripIt — Phase 1
          </button>
        </section>

        <section className="border border-border rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-sm">Social Accounts</h2>
          <p className="text-sm text-muted-foreground">Instagram, TikTok, LinkedIn — Phase 2</p>
        </section>

        <section className="border border-border rounded-lg p-5 space-y-3">
          <h2 className="font-semibold text-sm">Claude AI</h2>
          <p className="text-sm text-muted-foreground">Natural language calendar event entry — Phase 2</p>
        </section>
      </div>
    </div>
  )
}
