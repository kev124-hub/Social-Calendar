'use client'

import { useState } from 'react'
import { addDays, subDays, format, isToday } from 'date-fns'
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TimeGrid } from './TimeGrid'
import type { CalendarEvent, Calendar } from '@/types/database'

interface Props {
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  initialDate?: Date
  calendars: Calendar[]
  onToggleCalendar: (cal: Calendar) => void
  onEditCalendar: (cal: Calendar) => void
  onClose: () => void
}

export function RightPanel({
  events,
  onEventClick,
  initialDate,
  calendars,
  onToggleCalendar,
  onEditCalendar,
  onClose,
}: Props) {
  const [date, setDate] = useState<Date>(initialDate ?? new Date())
  const [calendarsOpen, setCalendarsOpen] = useState(false)

  const dateKey = format(date, 'yyyy-MM-dd')
  const dayEvents = events.filter((e) => format(new Date(e.starts_at), 'yyyy-MM-dd') === dateKey)

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
            onClick={() => setDate(subDays(date, 1))}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            <ChevronLeft size={13} />
          </button>
          <div className="text-center">
            <p className={cn(
              'text-[11px] font-bold uppercase tracking-wide',
              isToday(date) ? 'text-primary' : 'text-foreground'
            )}>
              {format(date, 'EEE d')}
            </p>
          </div>
          <button
            onClick={() => setDate(addDays(date, 1))}
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
