import { format } from 'date-fns'
import { formatInZone } from './zoned-time.ts'
import type { CalendarEvent } from '@/types/database'

/**
 * Does a (possibly multi-day) event cover this calendar day?
 *
 * Lives here rather than in CalendarView because both the day view and the
 * extracted MonthGrid need it, and importing it from CalendarView would make
 * the two files circular.
 *
 * ## Why this compares strings rather than Dates
 *
 * It used to be `startOfDay(parseISO(event.starts_at))` against
 * `startOfDay(day)`, both in the *device's* zone. That is the dangerous kind of
 * zone bug: getting it wrong does not mislabel an event, it files it under
 * another day. A Monaco event at 00:30 is still the previous day in New York, so
 * on a New York phone it disappeared from the day it belongs to and appeared on
 * the one before.
 *
 * The two sides of this comparison are different kinds of thing, and conflating
 * them is what caused that:
 *
 * - `day` is a **calendar cell** — a date the grid produced from device-local
 *   month arithmetic. Its clock time is meaningless; only its date matters.
 * - `starts_at` is an **instant**, whose date depends on which zone you read it
 *   in. The right one is the event's own.
 *
 * So each side is reduced to a `yyyy-MM-dd` date — the cell in the device's zone
 * because that is the zone the grid was drawn in, the event in `event.time_zone`
 * because that is the wall clock it was meant in — and compared as text.
 * Fixed-width and zero-padded, so lexical order is chronological order, and no
 * `Date` is constructed that could reintroduce an offset. The list view already
 * sorts its day keys this way, for the same reason.
 *
 * A null `time_zone` falls back to the device zone, which is exactly today's
 * behaviour — see `src/lib/zoned-time.ts`.
 */
export function eventCoversDay(event: CalendarEvent, day: Date): boolean {
  const cell = format(day, 'yyyy-MM-dd')
  const start = formatInZone(event.starts_at, event.time_zone, 'yyyy-MM-dd')
  const end = event.ends_at
    ? formatInZone(event.ends_at, event.time_zone, 'yyyy-MM-dd')
    : start
  return cell >= start && cell <= end
}
