'use client'

import { useCallback, useEffect, useRef } from 'react'
import { deviceTimeZone } from '@/lib/zoned-time'

/**
 * Pull from Google when you come back to the app, at most every few minutes.
 *
 * The push direction has always been immediate — every write in `src/lib/events.ts`
 * mirrors itself to Google straight away. The pull was a button in Settings, so an
 * event created in Google stayed invisible here until someone remembered to press
 * it. This closes that half.
 *
 * ## Why focus rather than a background cron
 *
 * A pinger every N minutes would keep the database fresh at moments nobody is
 * looking, and buy that at two real costs. The pull upserts on `external_id` and
 * overwrites the mapped fields, so a local edit to a Google-sourced event is
 * reverted by the next pull — pressing Sync yourself makes that visible and
 * attributable, whereas a background job makes an edit vanish minutes later with
 * nothing to connect it to. And the app is only ever wrong on screen while you
 * are looking at the screen, which is exactly when this fires.
 *
 * ## The throttle is shared, not per-component
 *
 * The timestamp lives in `localStorage`, so two tabs and both views mounting this
 * hook still add up to one sync per interval. `inFlight` is module-level for the
 * same reason at a finer grain: two components mounting in the same tick would
 * otherwise both pass the timestamp check before either had written it.
 *
 * Server-side there is a lease in `syncGoogleCalendar` as well, because two
 * *devices* share no browser state and a double sweep can create duplicate events
 * in Google. Both guards are needed; neither substitutes for the other.
 */

const LAST_SYNC_KEY = 'sc.lastCalendarSync'
/** Long enough that returning to a tab repeatedly costs nothing. */
const DEFAULT_MIN_INTERVAL_MS = 5 * 60 * 1000

/** Shared across every component in the tab, deliberately. */
let inFlight: Promise<unknown> | null = null

function lastSyncAt(): number {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY)
    const parsed = raw ? Number(raw) : 0
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    // Private mode, or storage disabled. Treated as "never synced", which at
    // worst means one sync per focus rather than none.
    return 0
  }
}

function markSynced(): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()))
  } catch {
    // Nothing to do — the server lease still prevents overlapping runs.
  }
}

interface Options {
  /** Called after a sync that actually changed something, to refetch. */
  onSynced?: () => void
  /** Minimum gap between syncs. */
  minIntervalMs?: number
  /** Set false to disable — e.g. while a dialog owns the screen. */
  enabled?: boolean
}

export function useFocusSync({
  onSynced,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
  enabled = true,
}: Options = {}) {
  // Held in a ref so a re-created callback does not re-register the listeners,
  // which would otherwise detach and reattach on every parent render. Assigned
  // in an effect rather than during render — a ref written mid-render is the
  // kind of thing that works until it is read during the same render.
  const onSyncedRef = useRef(onSynced)
  useEffect(() => { onSyncedRef.current = onSynced }, [onSynced])

  const sync = useCallback(async (force = false) => {
    if (!force && Date.now() - lastSyncAt() < minIntervalMs) return
    if (inFlight) return

    // Marked BEFORE the request, not after. Marking on completion would let
    // every focus event during a slow sync start another one.
    markSynced()

    inFlight = (async () => {
      try {
        const res = await fetch('/api/google-calendar/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Only the browser knows this. The server falls back to the last zone
          // it saw, which is why a browser-triggered sync is worth more.
          body: JSON.stringify({ timeZone: deviceTimeZone() }),
        })
        if (!res.ok) return   // Not connected, or a transient failure. Silent by design.
        const data = await res.json().catch(() => null)
        // Only refetch when the sync did something. A no-op sync re-rendering
        // the calendar every five minutes is a flicker with no information in it.
        // `removed` counts too: a sync whose only effect was deleting an event
        // Google no longer has still changes what is on screen.
        if (data && !data.skipped && (data.synced > 0 || data.removed > 0 || data.pushed > 0)) {
          onSyncedRef.current?.()
        }
      } catch {
        // Offline, or the request was cut off by a navigation. This is a
        // background convenience — it must never surface an error to someone
        // who did not ask for a sync.
      } finally {
        inFlight = null
      }
    })()

    await inFlight
  }, [minIntervalMs])

  useEffect(() => {
    if (!enabled) return

    // On mount as well as on focus: opening the app cold is the case that
    // matters most, and it fires no visibilitychange.
    void sync()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    // `focus` as well: switching back to a browser window that was never hidden
    // fires focus but not visibilitychange. The throttle makes the overlap free.
    window.addEventListener('focus', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [enabled, sync])

  /** Exposed so a manual control can bypass the throttle. */
  return { syncNow: () => sync(true) }
}
