'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GoogleCalendarListEntry } from '@/lib/google-calendar'

interface Props {
  connected: boolean
  lastSynced?: string | null
}

export function GoogleCalendarSettings({ connected: initialConnected, lastSynced: initialLastSynced }: Props) {
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
    const res = await fetch('/api/google-calendar/sync', { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setSyncMsg(`✓ Synced ${data.synced} events`)
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
            {connected ? 'Connected — events sync automatically' : 'Sync your Google calendars as read/write events'}
          </p>
        </div>
        {connected ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#166534] bg-[#f0fdf0] px-3 py-1 rounded-[10px] border border-[#bbf7d0]">
            <Check size={10} /> Connected
          </span>
        ) : null}
      </div>

      {!connected ? (
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

          {/* Sync controls */}
          <div className="flex items-center gap-3">
            <Button size="sm" className="rounded-[10px]" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={13} className={cn('mr-1.5', syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
            {syncMsg && <span className="text-xs text-muted-foreground">{syncMsg}</span>}
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
