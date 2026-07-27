'use client'

import { format, parseISO, differenceInMinutes } from 'date-fns'
import { partsInZone, timeWithZone } from '@/lib/zoned-time'
import type { CalendarEvent, Calendar } from '@/types/database'

const HOUR_PX = 56
const START_HOUR = 6
const END_HOUR = 22
const TOTAL_HOURS = END_HOUR - START_HOUR

function toPixels(date: Date): number {
  return ((date.getHours() - START_HOUR) + date.getMinutes() / 60) * HOUR_PX
}

/**
 * Where an event sits on the grid, by its wall clock in its OWN zone.
 *
 * The subtlest site in the blast radius: a zone error here does not remove an
 * event or relabel it, it slides it up or down the column — which reads as a
 * layout bug rather than a data one, and so gets investigated as the wrong kind
 * of problem. `.getHours()` was the device's hour.
 */
function eventPixels(iso: string, zone: string | null): number {
  const { hour, minute } = partsInZone(iso, zone)
  return ((hour - START_HOUR) + minute / 60) * HOUR_PX
}

interface Props {
  date: Date
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
}

export function TimeGrid({ date, events, onEventClick }: Props) {
  const now = new Date()
  const isToday = format(now, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
  const nowY = isToday ? toPixels(now) : null

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i)

  // Filtered on the same hour that positions it below, or an event could pass
  // the window check in one zone and be drawn off the grid by the other.
  const timedEvents = events.filter((e) => {
    if (e.all_day) return false
    const h = partsInZone(e.starts_at, e.time_zone).hour
    return h >= START_HOUR && h < END_HOUR
  })

  return (
    <div className="relative overflow-y-auto flex-1">
      <div className="relative" style={{ height: TOTAL_HOURS * HOUR_PX }}>
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 border-t border-border/40"
            style={{ top: (hour - START_HOUR) * HOUR_PX }}
          >
            <span className="text-[9px] text-muted-foreground px-1 -translate-y-2.5 block select-none">
              {format(new Date(2000, 0, 1, hour), 'h a')}
            </span>
          </div>
        ))}

        {nowY !== null && nowY >= 0 && nowY <= TOTAL_HOURS * HOUR_PX && (
          <div
            className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
            style={{ top: nowY }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 -translate-y-[3px]" />
            <div className="h-px flex-1 bg-red-500" />
          </div>
        )}

        {timedEvents.map((event) => {
          const start = parseISO(event.starts_at)
          const end = event.ends_at
            ? parseISO(event.ends_at)
            : new Date(start.getTime() + 60 * 60 * 1000)
          const topPx = eventPixels(event.starts_at, event.time_zone)
          // Height is a duration — the gap between two instants — so it needs no
          // zone at all. Only the position does.
          const heightPx = Math.max((differenceInMinutes(end, start) / 60) * HOUR_PX, 18)
          const color = (event.calendar as Calendar | undefined)?.color ?? '#6366f1'

          return (
            <button
              key={event.id}
              onClick={() => onEventClick(event)}
              className="absolute left-8 right-1 rounded px-1.5 py-0.5 text-white overflow-hidden hover:opacity-90 transition-opacity text-left"
              style={{ top: topPx, height: heightPx, backgroundColor: color }}
            >
              <p className="text-[10px] font-medium truncate leading-tight">{event.title}</p>
              {heightPx > 28 && (
                <p className="text-[9px] opacity-80 truncate">{timeWithZone(event.starts_at, event.time_zone)}</p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
