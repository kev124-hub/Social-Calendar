import { parseISO, startOfDay } from 'date-fns'
import type { CalendarEvent } from '@/types/database'

/**
 * Does a (possibly multi-day) event cover this calendar day?
 *
 * Lives here rather than in CalendarView because both the day view and the
 * extracted MonthGrid need it, and importing it from CalendarView would make
 * the two files circular.
 */
export function eventCoversDay(event: CalendarEvent, day: Date): boolean {
  const start = startOfDay(parseISO(event.starts_at))
  const end = event.ends_at ? startOfDay(parseISO(event.ends_at)) : start
  const d = startOfDay(day)
  return d >= start && d <= end
}
