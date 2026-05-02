'use client'

import { useState } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  isSameWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Calendar } from '@/types/database'

type ViewMode = 'week' | 'month' | 'day' | 'list'

interface Props {
  currentDate: Date
  onDaySelect: (date: Date) => void
  calendars: Calendar[]
  onToggleCalendar: (cal: Calendar) => void
  onAddCalendar: () => void
  onEditCalendar: (cal: Calendar) => void
  view: ViewMode
  onViewChange: (v: ViewMode) => void
}

export function LeftMiniBar({
  currentDate,
  onDaySelect,
  calendars,
  onToggleCalendar,
  onAddCalendar,
  onEditCalendar,
  view,
  onViewChange,
}: Props) {
  const [miniMonth, setMiniMonth] = useState(new Date())

  const monthStart = startOfMonth(miniMonth)
  const monthEnd = endOfMonth(miniMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className="flex flex-col h-full w-full border-r border-border bg-background overflow-y-auto">
      {/* View switcher */}
      <div className="px-2 py-3 border-b border-border shrink-0">
        <div className="grid grid-cols-2 gap-1">
          {(['week', 'month', 'day', 'list'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={cn(
                'text-[11px] py-1 px-2 rounded capitalize font-medium transition-colors',
                view === v
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Mini month calendar */}
      <div className="px-2 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setMiniMonth(subMonths(miniMonth, 1))}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            <ChevronLeft size={12} />
          </button>
          <span className="text-[11px] font-bold">{format(miniMonth, 'MMM yyyy')}</span>
          <button
            onClick={() => setMiniMonth(addMonths(miniMonth, 1))}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            <ChevronRight size={12} />
          </button>
        </div>

        <div className="grid grid-cols-7">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-[9px] font-bold text-muted-foreground text-center py-0.5">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const outside = !isSameMonth(day, miniMonth)
            const today = isToday(day)
            const currentWeek = isSameWeek(day, currentDate, { weekStartsOn: 0 })

            return (
              <button
                key={day.toISOString()}
                onClick={() => onDaySelect(day)}
                className={cn(
                  'text-[10px] w-full aspect-square flex items-center justify-center rounded-full transition-colors',
                  outside && 'text-muted-foreground/30',
                  !outside && !today && !currentWeek && 'text-foreground hover:bg-accent',
                  !today && currentWeek && 'bg-primary/10 text-primary font-bold',
                  today && 'bg-primary text-primary-foreground font-bold'
                )}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Calendars */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-3 py-2 shrink-0">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
            Calendars
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-1 min-h-0">
          {calendars.map((cal) => (
            <div
              key={cal.id}
              className="flex items-center gap-1.5 px-2 py-1 group hover:bg-accent/30 rounded-md"
            >
              <button
                onClick={() => onToggleCalendar(cal)}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0 transition-opacity"
                  style={{ backgroundColor: cal.color, opacity: cal.is_visible ? 1 : 0.3 }}
                />
                <span
                  className={cn(
                    'text-[11px] truncate',
                    !cal.is_visible && 'text-muted-foreground line-through'
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

        <div className="p-2 border-t border-border shrink-0">
          <button
            onClick={onAddCalendar}
            className="flex items-center gap-1.5 w-full px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/30 rounded-md transition-colors"
          >
            <Plus size={10} />
            Add calendar
          </button>
        </div>
      </div>
    </div>
  )
}
