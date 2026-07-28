'use client'

import { useState } from 'react'
import { addDays, subDays, format, isToday } from 'date-fns'
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatInZone } from '@/lib/zoned-time'
import { TimeGrid } from './TimeGrid'
import type { CalendarEvent, Calendar } from '@/types/database'

interface Props {
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  /**
   * The day to show. Controlled by the parent rather than held here, so clicking
   * a day in the week board points this panel at it — the panel and the board
   * cannot disagree about which day is being looked at if only one of them owns
   * the answer.
   */
  date: Date
  onDateChange: (date: Date) => void
  calendars: Calendar[]
  onToggleCalendar: (cal: Calendar) => void
  onEditCalendar: (cal: Calendar) => void
  onClose: () => void
}

export function RightPanel({
  events,
  onEventClick,
  date,
  onDateChange,
  calendars,
  onToggleCalendar,
  onEditCalendar,
  onClose,
}: Props) {
  const [calendarsOpen, setCalendarsOpen] = useState(false)

  const dateKey = format(date, 'yyyy-MM-dd')
  // In the event's own zone, so the panel agrees with the grid beside it about
  // which day a row belongs to.
  const dayEvents = events.filter(
    (e) => formatInZone(e.starts_at, e.time_zone, 'yyyy-MM-dd') === dateKey
  )

  return (
    <div className="flex h-full border-l border-border bg-background">
      <div className="flex flex-col w-full overflow-hidden">

        {/* Calendars section */}
        <div className="border-b border-border shrink-0">
          <button
            onClick={() => setCalendarsOpen(!calendarsOpen)}
            className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-accent/30 transition-colors"
          >
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
              Calendars
            </span>
            <ChevronDown
              size={13}
              className={cn(
                'text-muted-foreground transition-transform duration-200',
                calendarsOpen && 'rotate-180'
              )}
            />
          </button>

          {calendarsOpen && (
            <div className="pb-2">
              {calendars.map((cal) => (
                <div
                  key={cal.id}
                  className="flex items-center gap-2 px-3 py-1 group hover:bg-accent/20"
                >
                  <button
                    onClick={() => onToggleCalendar(cal)}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0 transition-opacity"
                      style={{
                        backgroundColor: cal.color,
                        opacity: cal.is_visible ? 1 : 0.25,
                      }}
                    />
                    <span
                      className={cn(
                        'text-[11px] truncate',
                        cal.is_visible ? 'text-foreground' : 'text-muted-foreground line-through'
                      )}
                    >
                      {cal.name}
                    </span>
                  </button>
                  {cal.source === 'app' && (
                    <button
                      onClick={() => onEditCalendar(cal)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Settings2 size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Day nav */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <button
            onClick={() => onDateChange(subDays(date, 1))}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            <ChevronLeft size={13} />
          </button>
          <div className="text-center">
            <p className={cn(
              'text-[11px] font-bold uppercase tracking-wide',
              isToday(date) ? 'text-primary' : 'text-foreground'
            )}>
              {format(date, 'EEE d MMM')}
              {/* Named, because this panel no longer always shows today — it
                  follows whichever day is selected in the week board. */}
              {isToday(date) && <span className="ml-1 font-normal normal-case opacity-70">· today</span>}
            </p>
          </div>
          <button
            onClick={() => onDateChange(addDays(date, 1))}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Time grid */}
        <TimeGrid date={date} events={dayEvents} onEventClick={onEventClick} />
      </div>

      {/* Icon rail */}
      <div className="flex flex-col items-center gap-2 w-9 border-l border-border py-2 shrink-0">
        <button
          onClick={onClose}
          title="Hide time grid"
          className="p-1.5 rounded-md transition-colors text-primary bg-primary/10 hover:bg-accent hover:text-foreground"
        >
          <CalendarDays size={14} />
        </button>
      </div>
    </div>
  )
}
