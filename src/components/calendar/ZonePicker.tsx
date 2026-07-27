'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deviceTimeZone, offsetLabel, formatInZone } from '@/lib/zoned-time'
import { allTimeZones, prettyZone, rankZones, DEFAULT_LIMIT } from '@/lib/zone-list'

/**
 * Choosing the zone an event's wall clock is meant in.
 *
 * ## Why this is not a `<select>`
 *
 * `Intl.supportedValuesOf('timeZone')` returns over four hundred names, and this
 * is used on a phone. A native select of that length is a scroll wheel with no
 * search — finding `Europe/Monaco` means spinning past every `America/*` first.
 * So: a search field, with the zones you have actually used kept at the top.
 * Recents are the shortcut that matters here, because the same handful of zones
 * recur — Kevin is in a different one 200+ days a year, but they are the same
 * few places.
 *
 * The list is only rendered while open, and offsets are computed only for the
 * rows on screen: an `Intl.DateTimeFormat` per zone × 418 zones on every render
 * would be felt.
 *
 * ## Picking is deliberate, and only a pick writes
 *
 * `onChange` fires solely from a click on a row. The component never reports a
 * value on mount, on open, or on search — so opening a dialog to look at an
 * event cannot stamp a zone onto a row that had none. That is not defensive
 * coding for its own sake: the drift bug this whole workstream began with was a
 * dialog writing a value nobody typed, and a zone written by accident would be
 * the same bug with a quieter symptom.
 *
 * A row with no zone yet shows the device's, labelled as such. That is what a
 * null means when it renders, and the label says so rather than implying the
 * event has been pinned to somewhere it has not.
 */

const RECENTS_KEY = 'sc.recentTimeZones'
const MAX_RECENTS = 5
const MAX_ROWS = DEFAULT_LIMIT

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((z) => typeof z === 'string') : []
  } catch {
    // A blocked or full localStorage must not take out the dialog.
    return []
  }
}

function rememberRecent(zone: string): void {
  try {
    const next = [zone, ...readRecents().filter((z) => z !== zone)].slice(0, MAX_RECENTS)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    // Not worth reporting — the picker works, it just will not remember.
  }
}

interface Props {
  /** The event's stored zone. Null means unknown — rendered as the device's. */
  value: string | null
  /** Fires only on an explicit pick, and always with a real IANA name. */
  onChange: (zone: string) => void
  /**
   * The instant the offsets are computed at — the event's own start, so a
   * May event in Monaco reads GMT+2 and a January one GMT+1. Formatting "now"
   * would be right for about half the year.
   */
  atISO: string
  id?: string
}

export function ZonePicker({ value, onChange, atISO, id }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const device = deviceTimeZone()

  const zones = useMemo(allTimeZones, [])
  const recents = useMemo(() => (open ? readRecents() : []), [open])

  // Ordering and matching live in src/lib/zone-list.ts, where they are tested.
  const matches = useMemo(
    () => (open ? rankZones({ query, recents, device, zones, current: value, limit: MAX_ROWS }) : []),
    [open, query, recents, device, zones, value]
  )

  // What the closed control reads. A null value is shown as the device's zone
  // and labelled, rather than left blank as though nothing applied.
  const summary = value
    ? `${prettyZone(value)}${offsetLabel(atISO, value) ? ` · ${offsetLabel(atISO, value)}` : ''}`
    : `Device zone${device ? ` · ${prettyZone(device)}` : ''}`

  function pick(zone: string) {
    rememberRecent(zone)
    onChange(zone)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-[#d6d6d6] bg-white px-3.5 py-2.5 text-left text-[13px] text-[#333] transition-colors hover:border-[#bdbdbd] focus:border-[#f1ccff] focus:outline-none focus:ring-2 focus:ring-[#f1ccff]"
      >
        <span className={cn('truncate', !value && 'text-[#777]')}>{summary}</span>
        <ChevronDown size={15} className="shrink-0 text-[#777]" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-[10px] border border-[#d6d6d6] bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-[#eee] px-3 py-2">
            <Search size={14} className="shrink-0 text-[#999]" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search zones — try Monaco, or New York"
              className="w-full bg-transparent text-[13px] text-[#333] placeholder:text-[#aaa] focus:outline-none"
            />
          </div>

          <ul className="max-h-60 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-3.5 py-2 text-[12px] text-[#777]">No zone matches “{query}”.</li>
            )}
            {matches.map((zone) => {
              const label = offsetLabel(atISO, zone)
              const isRecent = recents.includes(zone)
              return (
                <li key={zone}>
                  <button
                    type="button"
                    onClick={() => pick(zone)}
                    className="flex w-full items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[#333] transition-colors hover:bg-[#f6f0fb]"
                  >
                    {value === zone
                      ? <Check size={13} className="shrink-0 text-[#7a3fa0]" />
                      : <span className="w-[13px] shrink-0" />}
                    <span className="truncate">{prettyZone(zone)}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-[#888]">
                      {/* The event's own time there, which is the thing being
                          chosen — an offset alone still needs arithmetic. */}
                      {formatInZone(atISO, zone, 'h:mm a')}
                      {label ? ` · ${label}` : ''}
                      {isRecent && !query ? ' · recent' : ''}
                    </span>
                  </button>
                </li>
              )
            })}
            {matches.length === MAX_ROWS && (
              <li className="px-3.5 py-2 text-[11px] text-[#999]">
                Showing the first {MAX_ROWS}. Keep typing to narrow it down.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
