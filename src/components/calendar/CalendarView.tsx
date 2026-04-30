'use client'

import { useState, useEffect } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isSameMonth,
  isSameDay,
  isToday,
  eachDayOfInterval,
  parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Settings2, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import type { CalendarEvent, Calendar } from '@/types/database'
import { EventDialog } from './EventDialog'
import { CalendarManageDialog } from './CalendarManageDialog'
import { AIEventInput, type ParsedEvent } from './AIEventInput'
import { cn } from '@/lib/utils'

type ViewMode = 'month' | 'week' | 'day' | 'list'

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<ViewMode>('month')
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [calendarPanelOpen, setCalendarPanelOpen] = useState(true)
  const [manageDialogOpen, setManageDialogOpen] = useState(false)
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null)

  const supabase = createClient()

  useEffect(() => { loadData() }, [currentDate])

  async function loadData() {
    setLoading(true)
    const [{ data: calData }, { data: evtData }] = await Promise.all([
      supabase.from('calendars').select('*').order('name'),
      supabase
        .from('calendar_events')
        .select('*, calendar:calendars(*)')
        .gte('starts_at', startOfMonth(subMonths(currentDate, 1)).toISOString())
        .lte('starts_at', endOfMonth(addMonths(currentDate, 1)).toISOString())
        .order('starts_at'),
    ])
    if (calData) setCalendars(calData)
    if (evtData) setEvents(evtData as CalendarEvent[])
    setLoading(false)
  }

  async function toggleCalendarVisibility(cal: Calendar) {
    await supabase.from('calendars').update({ is_visible: !cal.is_visible }).eq('id', cal.id)
    setCalendars((prev) => prev.map((c) => c.id === cal.id ? { ...c, is_visible: !c.is_visible } : c))
  }

  async function handleDeleteCalendar(id: string) {
    await supabase.from('calendars').delete().eq('id', id)
    setManageDialogOpen(false)
    setEditingCalendar(null)
    await loadData()
  }

  function navigate(direction: 1 | -1) {
    if (view === 'month') setCurrentDate(direction === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    else if (view === 'week') setCurrentDate(direction === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1))
    else setCurrentDate(direction === 1 ? addDays(currentDate, 1) : subDays(currentDate, 1))
  }

  function getHeaderLabel() {
    if (view === 'month') return format(currentDate, 'MMMM yyyy')
    if (view === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 })
      const end = endOfWeek(currentDate, { weekStartsOn: 0 })
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
    }
    return format(currentDate, 'EEEE, MMMM d, yyyy')
  }

  const visibleCalendarIds = new Set(calendars.filter((c) => c.is_visible).map((c) => c.id))
  const visibleEvents = events.filter((e) => !e.calendar_id || visibleCalendarIds.has(e.calendar_id))

  function openNewEvent(date: Date) {
    setSelectedDate(date)
    setEditingEvent(null)
    setDialogOpen(true)
  }

  function openEditEvent(event: CalendarEvent) {
    setEditingEvent(event)
    setSelectedDate(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    setDialogOpen(false)
    await loadData()
  }

  async function handleDelete(id: string) {
    await supabase.from('calendar_events').delete().eq('id', id)
    setDialogOpen(false)
    await loadData()
  }

  async function handleAIEvent(parsed: ParsedEvent) {
    const defaultCalendar = calendars.find((c) => c.source === 'app') ?? calendars[0]
    const toISO = (s: string, isEnd?: boolean) => {
      if (parsed.all_day) {
        const d = new Date(s + (isEnd ? 'T23:59:59' : 'T00:00:00'))
        return d.toISOString()
      }
      return new Date(s).toISOString()
    }
    await supabase.from('calendar_events').insert({
      title: parsed.title,
      description: parsed.description,
      location: parsed.location,
      starts_at: toISO(parsed.starts_at),
      ends_at: parsed.ends_at ? toISO(parsed.ends_at, true) : null,
      all_day: parsed.all_day,
      calendar_id: defaultCalendar?.id ?? null,
      source: 'app' as const,
    })
    await loadData()
  }

  return (
    <div className="flex h-full">
      {/* Calendar management panel */}
      {calendarPanelOpen && (
        <div className="w-52 shrink-0 border-r border-border flex flex-col">
          <div className="flex items-center justify-between px-3 py-3 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Calendars</span>
            <button
              onClick={() => setCalendarPanelOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {calendars.map((cal) => (
              <div key={cal.id} className="flex items-center gap-2 px-3 py-1.5 group hover:bg-accent/30 rounded-md mx-1">
                <button
                  onClick={() => toggleCalendarVisibility(cal)}
                  className="flex items-center gap-2 flex-1 min-w-0"
                >
                  <span
                    className="w-3 h-3 rounded-sm shrink-0 transition-opacity"
                    style={{
                      backgroundColor: cal.color,
                      opacity: cal.is_visible ? 1 : 0.3,
                    }}
                  />
                  <span className={cn(
                    'text-sm truncate',
                    !cal.is_visible && 'text-muted-foreground line-through'
                  )}>
                    {cal.name}
                  </span>
                </button>
                {cal.source === 'app' && (
                  <button
                    onClick={() => { setEditingCalendar(cal); setManageDialogOpen(true) }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Settings2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="p-2 border-t border-border">
            <button
              onClick={() => { setEditingCalendar(null); setManageDialogOpen(true) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 rounded-md transition-colors"
            >
              <Plus size={12} />
              Add calendar
            </button>
          </div>
        </div>
      )}

      {/* Main calendar area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {!calendarPanelOpen && (
              <button
                onClick={() => setCalendarPanelOpen(true)}
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
            <h1 className="text-lg font-semibold truncate">{getHeaderLabel()}</h1>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ChevronLeft size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <AIEventInput onEventParsed={handleAIEvent} />
            <div className="hidden sm:flex rounded-md border border-border overflow-hidden">
              {(['month', 'week', 'day', 'list'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                    view === v
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-accent'
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            {/* Mobile view selector */}
            <select
              className="sm:hidden px-2 py-1.5 text-xs rounded-md border border-border bg-background capitalize"
              value={view}
              onChange={(e) => setView(e.target.value as ViewMode)}
            >
              {(['month', 'week', 'day', 'list'] as ViewMode[]).map((v) => (
                <option key={v} value={v} className="capitalize">{v}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => openNewEvent(new Date())}>
              <Plus size={14} className="mr-1" />
              <span className="hidden sm:inline">New Event</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-auto">
          {view === 'month' && (
            <MonthGrid
              currentDate={currentDate}
              events={visibleEvents}
              onDayClick={openNewEvent}
              onEventClick={openEditEvent}
            />
          )}
          {view === 'week' && (
            <WeekGrid
              currentDate={currentDate}
              events={visibleEvents}
              onDayClick={openNewEvent}
              onEventClick={openEditEvent}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              events={visibleEvents.filter((e) => isSameDay(parseISO(e.starts_at), currentDate))}
              onEventClick={openEditEvent}
              onAddClick={() => openNewEvent(currentDate)}
            />
          )}
          {view === 'list' && (
            <ListView events={visibleEvents} onEventClick={openEditEvent} />
          )}
        </div>
      </div>

      <EventDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        event={editingEvent}
        defaultDate={selectedDate}
        calendars={calendars}
      />

      <CalendarManageDialog
        open={manageDialogOpen}
        onClose={() => { setManageDialogOpen(false); setEditingCalendar(null) }}
        onSave={() => { setManageDialogOpen(false); setEditingCalendar(null); loadData() }}
        onDelete={handleDeleteCalendar}
        calendar={editingCalendar}
      />
    </div>
  )
}

// ─────────────────────────────────────────────
// Month Grid
// ─────────────────────────────────────────────
function MonthGrid({
  currentDate, events, onDayClick, onEventClick,
}: {
  currentDate: Date
  events: CalendarEvent[]
  onDayClick: (d: Date) => void
  onEventClick: (e: CalendarEvent) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-border">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(parseISO(e.starts_at), day))
          const outside = !isSameMonth(day, currentDate)
          const today = isToday(day)
          return (
            <div
              key={day.toISOString()}
              className={cn('border-b border-r border-border p-1.5 min-h-[90px] cursor-pointer hover:bg-accent/30 transition-colors', outside && 'bg-muted/30')}
              onClick={() => onDayClick(day)}
            >
              <div className={cn('text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1', today && 'bg-primary text-primary-foreground', outside && 'text-muted-foreground')}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event) }}
                    className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate text-white font-medium"
                    style={{ backgroundColor: (event.calendar as Calendar | undefined)?.color ?? '#6366f1' }}
                  >
                    {event.all_day ? '' : format(parseISO(event.starts_at), 'h:mma') + ' '}
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-xs text-muted-foreground px-1">+{dayEvents.length - 3} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Week Grid
// ─────────────────────────────────────────────
function WeekGrid({
  currentDate, events, onDayClick, onEventClick,
}: {
  currentDate: Date
  events: CalendarEvent[]
  onDayClick: (d: Date) => void
  onEventClick: (e: CalendarEvent) => void
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-border">
        {days.map((day) => (
          <div key={day.toISOString()} className={cn('py-3 text-center border-r border-border cursor-pointer hover:bg-accent/30', isToday(day) && 'bg-primary/5')} onClick={() => onDayClick(day)}>
            <p className="text-xs text-muted-foreground">{format(day, 'EEE')}</p>
            <p className={cn('text-lg font-semibold mx-auto w-9 h-9 flex items-center justify-center rounded-full', isToday(day) && 'bg-primary text-primary-foreground')}>
              {format(day, 'd')}
            </p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1">
        {days.map((day) => {
          const dayEvents = events.filter((e) => isSameDay(parseISO(e.starts_at), day))
          return (
            <div key={day.toISOString()} className="border-r border-border p-2 space-y-1">
              {dayEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded text-white font-medium truncate"
                  style={{ backgroundColor: (event.calendar as Calendar | undefined)?.color ?? '#6366f1' }}
                >
                  {event.all_day ? '' : format(parseISO(event.starts_at), 'h:mma') + ' '}
                  {event.title}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Day View
// ─────────────────────────────────────────────
function DayView({
  currentDate, events, onEventClick, onAddClick,
}: {
  currentDate: Date
  events: CalendarEvent[]
  onEventClick: (e: CalendarEvent) => void
  onAddClick: () => void
}) {
  return (
    <div className="p-6 space-y-3">
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <p className="text-sm mb-3">No events today</p>
          <Button variant="outline" size="sm" onClick={onAddClick}>
            <Plus size={14} className="mr-1" /> Add event
          </Button>
        </div>
      ) : (
        events.map((event) => (
          <button key={event.id} onClick={() => onEventClick(event)} className="w-full text-left border border-border rounded-lg p-4 hover:bg-accent/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-1 self-stretch rounded-full mt-0.5" style={{ backgroundColor: (event.calendar as Calendar | undefined)?.color ?? '#6366f1' }} />
              <div>
                <p className="font-medium text-sm">{event.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {event.all_day ? 'All day' : format(parseISO(event.starts_at), 'h:mm a') + (event.ends_at ? ' – ' + format(parseISO(event.ends_at), 'h:mm a') : '')}
                </p>
                {event.location && <p className="text-xs text-muted-foreground">{event.location}</p>}
              </div>
            </div>
          </button>
        ))
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// List View
// ─────────────────────────────────────────────
function ListView({ events, onEventClick }: { events: CalendarEvent[]; onEventClick: (e: CalendarEvent) => void }) {
  const grouped = events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const key = format(parseISO(event.starts_at), 'yyyy-MM-dd')
    if (!acc[key]) acc[key] = []
    acc[key].push(event)
    return acc
  }, {})
  const sortedDays = Object.keys(grouped).sort()

  if (sortedDays.length === 0) return <div className="p-8 text-center text-muted-foreground text-sm">No upcoming events</div>

  return (
    <div className="p-6 space-y-6">
      {sortedDays.map((dateKey) => (
        <div key={dateKey}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{format(parseISO(dateKey), 'EEEE, MMMM d')}</h3>
          <div className="space-y-2">
            {grouped[dateKey].map((event) => (
              <button key={event.id} onClick={() => onEventClick(event)} className="w-full text-left border border-border rounded-lg p-3 hover:bg-accent/30 transition-colors flex items-center gap-3">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: (event.calendar as Calendar | undefined)?.color ?? '#6366f1' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{event.title}</p>
                  {event.location && <p className="text-xs text-muted-foreground truncate">{event.location}</p>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {event.all_day ? 'All day' : format(parseISO(event.starts_at), 'h:mm a')}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
