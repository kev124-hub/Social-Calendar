'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GoogleCalendarListEntry } from '@/lib/google-calendar'

interface Props {
  connected: boolean
  /** A row exists but the stored grant no longer yields a token. */
  needsReconnect?: boolean
  /**
   * The deployment has no Google OAuth credentials. Distinct from
   * needsReconnect: reconnecting cannot fix it, and offering the button sends
   * you to Google for a bare "401: invalid_client" on Google's own domain.
   */
  notConfigured?: boolean
  lastSynced?: string | null
}

export function GoogleCalendarSettings({
  connected: initialConnected,
  needsReconnect = false,
  notConfigured = false,
  lastSynced: initialLastSynced,
}: Props) {
  const [connected, setConnected] = useState(initialConnected)
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState(initialLastSynced)
  const [syncMsg, setSyncMsg] = useState('')
  const [savingCals, setSavingCals] = useState(false)

  useEffect(() => {
    if (connected) loadCalendars()
  }, [connected])

  async function loadCalendars() {
    const res = await fetch('/api/google-calendar/calendars')
    if (!res.ok) return
    const data = await res.json()
    setCalendars(data.calendars ?? [])
    setSelectedIds(data.selectedIds ?? [])
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    const res = await fetch('/api/google-calendar/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only the browser knows this, and all-day events are dated a day out
      // without it for anyone east of UTC.
      body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    })
    const data = await res.json()
    if (res.ok && data.skipped) {
      // A sync was already running — the app now syncs itself when you return to
      // it, so a manual press can genuinely land on top of one. Saying so beats
      // reporting "Imported 0 events", which reads as "there was nothing there".
      setSyncMsg('Sync already running — give it a moment and press again.')
      setSyncing(false)
      return
    }
    if (res.ok) {
      // Report both directions. `pushed` is events created here that Google had
      // not got yet — usually zero, because the push happens at write time; a
      // non-zero count means it is catching up after a connection failure.
      const parts = [`✓ Imported ${data.synced} events`]
      // Deletions in Google used to leave their rows here forever. Reported so a
      // disappearance is something the app told you about, not something you
      // notice later and mistrust.
      if (data.removed) parts.push(`removed ${data.removed} deleted in Google`)
      if (data.pushed) parts.push(`sent ${data.pushed} to Google`)
      if (data.pushFailures?.length) {
        // Show WHY, not just how many. A bare count ("2 could not be sent")
        // is unactionable — it cannot tell an expired token from a bad payload,
        // and the events it refers to stay invisible until someone guesses.
        parts.push(
          `${data.pushFailures.length} could not be sent — ${data.pushFailures[0]}` +
            (data.pushFailures.length > 1 ? ` (+${data.pushFailures.length - 1} more)` : '')
        )
      }
      setSyncMsg(parts.join(' · '))
      setLastSynced(new Date().toISOString())
    } else {
      setSyncMsg(`Error: ${data.error}`)
    }
    setSyncing(false)
  }

  async function toggleCalendar(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((s) => s !== id)
      : [...selectedIds, id]
    setSelectedIds(next)
    setSavingCals(true)
    await fetch('/api/google-calendar/calendars', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendar_ids: next }),
    })
    setSavingCals(false)
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect Google Calendar? This will remove all synced events.')) return
    const res = await fetch('/api/google-calendar/disconnect', { method: 'POST' })
    if (res.ok) setConnected(false)
  }

  return (
    <section className="border border-[#d6d6d6] rounded-[24px] p-6 space-y-4 bg-white shadow-[rgba(0,0,0,0.04)_0px_8px_16px_0px]">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <GoogleIcon />
            Google Calendar
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {/* Two-way as of Stage 9: the pull imports Google events, and
                events created here are pushed to your primary Google calendar
                at write time, with the sync sweeping up any the connection
                dropped. Events created here that you then edit IN Google are
                not re-imported — the app owns what it created. */}
            {notConfigured
              ? 'Not configured on this deployment — Google credentials are missing, so connecting and syncing cannot work here'
              : !connected
                ? 'Import your Google calendars into this app'
                : needsReconnect
                  ? 'Reconnect needed — the stored Google authorisation is no longer valid'
                  : 'Syncing both ways. Events created here are added to your primary Google calendar.'}
          </p>
        </div>
        {notConfigured && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#8a4b06] bg-[#fdf6e7] px-3 py-1 rounded-[10px] border border-[#f5dda1]">
            <X size={10} /> Not configured
          </span>
        )}
        {!notConfigured && connected && !needsReconnect && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#166534] bg-[#f0fdf0] px-3 py-1 rounded-[10px] border border-[#bbf7d0]">
            <Check size={10} /> Connected
          </span>
        )}
        {!notConfigured && connected && needsReconnect && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#8a4b06] bg-[#fdf6e7] px-3 py-1 rounded-[10px] border border-[#f5dda1]">
            <X size={10} /> Reconnect
          </span>
        )}
      </div>

      {notConfigured && !connected ? (
        // Same reasoning as the reconnect banner: a Connect button that can only
        // end in "invalid_client" on Google's domain is worse than no button.
        <p className="rounded-[10px] border border-[#f5dda1] bg-[#fdf6e7] px-3 py-2.5 text-xs text-[#8a4b06]">
          Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> for this
          environment and redeploy before connecting. Vercel scopes environment variables
          per environment, so values set for Production are not visible to preview
          deployments unless added for Preview too.
        </p>
      ) : !connected ? (
        <a href="/api/auth/google-calendar">
          <Button variant="outline" size="sm">
            <GoogleIcon />
            <span className="ml-2">Connect Google Calendar</span>
          </Button>
        </a>
      ) : (
        <div className="space-y-4">
          {/* Calendar selector */}
          {calendars.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground">
                Calendars to sync {savingCals && <span className="italic">saving…</span>}
              </p>
              <div className="space-y-1.5">
                {calendars.map((cal) => (
                  <label key={cal.id} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(cal.id)}
                      onChange={() => toggleCalendar(cal.id)}
                      className="rounded"
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: cal.backgroundColor ?? '#4285F4' }}
                    />
                    <span className="text-sm truncate">{cal.summary}</span>
                    {cal.primary && (
                      <span className="text-xs text-muted-foreground">(primary)</span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {notConfigured && (
            <div className="rounded-[10px] border border-[#f5dda1] bg-[#fdf6e7] px-3 py-2.5">
              <p className="text-xs text-[#8a4b06]">
                This deployment has no Google OAuth credentials, so connecting, reconnecting
                and syncing all fail here. Vercel scopes environment variables per
                environment, so values set for Production are not visible to preview
                deployments unless they are added for Preview too. No Reconnect button is
                offered because it cannot succeed — it would just bounce you to Google for
                an &ldquo;invalid_client&rdquo; error.
              </p>
            </div>
          )}

          {!notConfigured && needsReconnect && (
            <div className="space-y-2 rounded-[10px] border border-[#f5dda1] bg-[#fdf6e7] px-3 py-2.5">
              <p className="text-xs text-[#8a4b06]">
                Google is no longer accepting the saved authorisation, so syncing will fail
                until it is reconnected.
              </p>
              <a href="/api/auth/google-calendar">
                <Button variant="outline" size="sm" className="rounded-[10px]">
                  <GoogleIcon />
                  <span className="ml-2">Reconnect Google Calendar</span>
                </Button>
              </a>
            </div>
          )}

          {/* Sync controls */}
          <div className="space-y-2">
            <Button size="sm" className="rounded-[10px]" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={13} className={cn('mr-1.5', syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
            {/* On its own line and wrapping: this now carries the reason a push
                failed, which is a raw Google API message and can be long. Beside
                the button on a phone it was squeezed to a couple of words. */}
            {syncMsg && (
              <p className="text-xs text-muted-foreground break-words whitespace-pre-wrap">{syncMsg}</p>
            )}
          </div>

          {lastSynced && (
            <p className="text-xs text-muted-foreground">
              Last synced: {new Date(lastSynced).toLocaleString()}
            </p>
          )}

          {/* Disconnect */}
          <button
            onClick={handleDisconnect}
            className="text-xs text-destructive hover:underline"
          >
            Disconnect Google Calendar
          </button>
        </div>
      )}
    </section>
  )
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}
