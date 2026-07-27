'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
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
  isSameWeek,
  isToday,
  eachDayOfInterval,
  parseISO,
  isValid,
  set,
} from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  PanelRightOpen,
  PanelRightClose,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { createEventFromParsed, deleteEvent, parsedLocalDate } from '@/lib/events'
import type { CalendarEvent, Calendar, SocialPost, Idea } from '@/types/database'
import { EventDialog } from './EventDialog'
import { CalendarManageDialog } from './CalendarManageDialog'
import { MonthGrid } from './MonthGrid'
import { eventCoversDay } from '@/lib/calendar-utils'
import { AIEventInput, type ParsedEvent } from './AIEventInput'
import { PlatformIcon, PLATFORM_COLORS } from '@/components/ui/PlatformIcon'
import { PostDialog } from '@/components/pipeline/PostDialog'
import { WeeklyBoard } from './WeeklyBoard'
import { RightPanel } from './RightPanel'
import { cn } from '@/lib/utils'

type ViewMode = 'week' | 'month' | 'day' | 'list'

// ─────────────────────────────────────────────
// Date picker popup
// ─────────────────────────────────────────────
function DatePickerPopup({
  currentDate,
  onDaySelect,
  onClose,
}: {
  currentDate: Date
  onDaySelect: (date: Date) => void
  onClose: () => void
}) {
  const [miniMonth, setMiniMonth] = useState(startOfMonth(currentDate))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    // slight delay so the click that opened the popup doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  const monthStart = startOfMonth(miniMonth)
  const monthEnd = endOfMonth(miniMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 w-64 py-2 overflow-hidden"
    >
      {/* Quick actions */}
      <div className="border-b border-gray-100 pb-2 mb-2">
        <button
          onClick={() => { onDaySelect(new Date()); onClose() }}
          className="flex items-center justify-between w-full px-4 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50"
        >
          <span>Go to today</span>
          <span className="text-gray-300 text-[10px]">Space</span>
        </button>
        <button
          onClick={() => { onDaySelect(addWeeks(currentDate, 1)); onClose() }}
          className="flex items-center justify-between w-full px-4 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50"
        >
          <span>Go to next week</span>
          <span className="text-gray-300 text-[10px]">⇧ →</span>
        </button>
        <button
          onClick={() => { onDaySelect(subWeeks(currentDate, 1)); onClose() }}
          className="flex items-center justify-between w-full px-4 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50"
        >
          <span>Go to previous week</span>
          <span className="text-gray-300 text-[10px]">⇧ ←</span>
        </button>
      </div>

      {/* Mini month calendar */}
      <div className="px-3">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setMiniMonth(subMonths(miniMonth, 1))}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
          >
            <ChevronLeft size={13} />
          </button>
          <span className="text-[11px] font-semibold text-gray-700">
            {format(miniMonth, 'MMMM yyyy')}
          </span>
          <button
            onClick={() => setMiniMonth(addMonths(miniMonth, 1))}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
          >
            <ChevronRight size={13} />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-[9px] font-bold text-gray-300 text-center py-0.5">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const outside = !isSameMonth(day, miniMonth)
            const today = isToday(day)
            const inCurrentWeek = isSameWeek(day, currentDate, { weekStartsOn: 0 })
            return (
              <button
                key={day.toISOString()}
                onClick={() => { onDaySelect(day); onClose() }}
                className={cn(
                  'text-[11px] w-full aspect-square flex items-center justify-center rounded-full transition-colors',
                  outside && 'text-gray-200',
                  !outside && !today && !inCurrentWeek && 'text-gray-700 hover:bg-gray-100',
                  !today && inCurrentWeek && !outside && 'bg-blue-50 text-blue-600 font-semibold',
                  today && 'bg-blue-500 text-white font-bold'
                )}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Main CalendarView
// ─────────────────────────────────────────────
export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<ViewMode>('week')

  // Phones open on the day view. Seven columns is a desktop shape; on a phone
  // the week board shows about two days at a time, so landing there means
  // scrolling to find today. Set in an effect rather than a lazy useState
  // initialiser because reading window during render would not match what the
  // server rendered and would fail hydration. Empty deps: this is a default on
  // first load, not a lock — switching to week or month afterwards sticks.
  useEffect(() => {
    if (window.innerWidth < 640) setView('day')
  }, [])

  // Deep link: /calendar?date=2026-07-30&view=day
  //
  // Until now CalendarView read nothing from the URL, so every link pointing
  // into it — including /home's week strip — landed on today no matter which
  // day it named. Declared after the phone-default effect above so an explicit
  // ?view= wins over it; scheduled on a frame so this is not a synchronous
  // setState in an effect body.
  const searchParams = useSearchParams()
  useEffect(() => {
    const dateParam = searchParams.get('date')
    const viewParam = searchParams.get('view')
    if (!dateParam && !viewParam) return
    const frame = requestAnimationFrame(() => {
      if (dateParam) {
        const parsed = parseISO(dateParam)
        // Ignore a malformed date rather than calling setCurrentDate with an
        // Invalid Date, which would make every downstream format() throw.
        if (isValid(parsed)) setCurrentDate(parsed)
      }
      if (viewParam === 'day' || viewParam === 'week' || viewParam === 'month' || viewParam === 'list') {
        setView(viewParam)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [searchParams])

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)

  const [rightOpen, setRightOpen] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  // Event dialog
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)

  // Calendar manage dialog
  const [manageDialogOpen, setManageDialogOpen] = useState(false)
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null)

  // Post dialog
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null)
  const [postDefaultDate, setPostDefaultDate] = useState<string | undefined>()

  const supabase = createClient()

  useEffect(() => {
    if (window.innerWidth >= 1024) setRightOpen(true)
  }, [])

  useEffect(() => { loadData() }, [currentDate])

  async function loadData() {
    setLoading(true)
    const rangeStart = startOfMonth(subMonths(currentDate, 1)).toISOString()
    const rangeEnd = endOfMonth(addMonths(currentDate, 1)).toISOString()
    const dateStart = rangeStart.slice(0, 10)
    const dateEnd = rangeEnd.slice(0, 10)

    const [{ data: calData }, { data: evtData }, { data: postData }, { data: ideaData }] =
      await Promise.all([
        supabase.from('calendars').select('*').order('name'),
        supabase
          .from('calendar_events')
          .select('*, calendar:calendars(*)')
          .gte('starts_at', rangeStart)
          .lte('starts_at', rangeEnd)
          .order('starts_at'),
        supabase
          .from('social_posts')
          .select('*')
          .not('scheduled_at', 'is', null)
          .gte('scheduled_at', rangeStart)
          .lte('scheduled_at', rangeEnd)
          .order('scheduled_at'),
        supabase
          .from('ideas')
          .select('*')
          .not('date_start', 'is', null)
          .gte('date_start', dateStart)
          .lte('date_start', dateEnd)
          .order('date_start'),
      ])

    if (calData) setCalendars(calData)
    if (evtData) setEvents(evtData as CalendarEvent[])
    if (postData) setPosts(postData)
    if (ideaData) setIdeas(ideaData)
    setLoading(false)
  }

  async function toggleCalendarVisibility(cal: Calendar) {
    await supabase.from('calendars').update({ is_visible: !cal.is_visible }).eq('id', cal.id)
    setCalendars((prev) =>
      prev.map((c) => (c.id === cal.id ? { ...c, is_visible: !c.is_visible } : c))
    )
  }

  async function handleDeleteCalendar(id: string) {
    await supabase.from('calendars').delete().eq('id', id)
    setManageDialogOpen(false)
    setEditingCalendar(null)
    await loadData()
  }

  function navigate(direction: 1 | -1) {
    if (view === 'month')
      setCurrentDate(direction === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    else if (view === 'week')
      setCurrentDate(direction === 1 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1))
    else
      setCurrentDate(direction === 1 ? addDays(currentDate, 1) : subDays(currentDate, 1))
  }

  function getHeaderLabel(short = false) {
    if (view === 'month') return format(currentDate, short ? 'MMM yyyy' : 'MMMM yyyy')
    if (view === 'week') {
      const s = startOfWeek(currentDate, { weekStartsOn: 0 })
      const e = endOfWeek(currentDate, { weekStartsOn: 0 })
      if (short) {
        // Compact mobile label: drop the year, elide the month when both
        // ends share it → "Jul 19–25", else "Jul 28 – Aug 3".
        return isSameMonth(s, e)
          ? `${format(s, 'MMM d')}–${format(e, 'd')}`
          : `${format(s, 'MMM d')} – ${format(e, 'MMM d')}`
      }
      return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`
    }
    return format(currentDate, short ? 'EEE, MMM d' : 'EEEE, MMMM d, yyyy')
  }

  const visibleCalendarIds = new Set(calendars.filter((c) => c.is_visible).map((c) => c.id))
  const visibleEvents = events.filter(
    (e) => !e.calendar_id || visibleCalendarIds.has(e.calendar_id)
  )

  function openNewEvent(date: Date) {
    setSelectedDate(date)
    setEditingEvent(null)
    setEventDialogOpen(true)
  }

  function openEditEvent(event: CalendarEvent) {
    setEditingEvent(event)
    setSelectedDate(null)
    setEventDialogOpen(true)
  }

  function openAddPost(date: Date) {
    setEditingPost(null)
    const noon = new Date(date)
    noon.setHours(12, 0, 0, 0)
    setPostDefaultDate(noon.toISOString().slice(0, 16))
    setPostDialogOpen(true)
  }

  function openEditPost(post: SocialPost) {
    setEditingPost(post)
    setPostDefaultDate(undefined)
    setPostDialogOpen(true)
  }

  async function handleEventSave() {
    setEventDialogOpen(false)
    await loadData()
  }

  async function handleEventDelete(id: string) {
    // Throws on failure; EventDialog awaits this and shows the message. The
    // dialog stays open on error rather than closing over a delete that never
    // happened.
    await deleteEvent(supabase, id)
    setEventDialogOpen(false)
    await loadData()
  }

  async function handlePostSave() {
    setPostDialogOpen(false)
    await loadData()
  }

  async function handlePostDelete(id: string) {
    await supabase.from('social_posts').delete().eq('id', id)
    setPostDialogOpen(false)
    await loadData()
  }

  async function handleMovePost(postId: string, newDate: Date) {
    const post = posts.find((p) => p.id === postId)
    let newScheduledAt: string
    if (post?.scheduled_at) {
      const existing = parseISO(post.scheduled_at)
      newScheduledAt = set(newDate, {
        hours: existing.getHours(),
        minutes: existing.getMinutes(),
        seconds: 0,
        milliseconds: 0,
      }).toISOString()
    } else {
      newScheduledAt = set(newDate, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 }).toISOString()
    }
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, scheduled_at: newScheduledAt } : p))
    )
    await supabase.from('social_posts').update({ scheduled_at: newScheduledAt }).eq('id', postId)
  }

  async function handleMoveIdea(ideaId: string, newDate: Date) {
    const newDateStart = format(newDate, 'yyyy-MM-dd')
    setIdeas((prev) =>
      prev.map((i) => (i.id === ideaId ? { ...i, date_start: newDateStart } : i))
    )
    await supabase.from('ideas').update({ date_start: newDateStart }).eq('id', ideaId)
  }

  async function handleAIEvent(parsed: ParsedEvent) {
    // Body moved to `src/lib/events.ts` so `HomeView` shares it verbatim.
    // It throws on a failed write — this used to discard the result, so a
    // rejected insert was indistinguishable from success: the input reported
    // "added" and nothing appeared. AIEventInput awaits this and shows what it
    // throws, so the message from `events.ts` is the whole error UX.
    await createEventFromParsed(supabase, parsed, calendars)

    // Then GO TO the day it landed on, because otherwise a successful create is
    // invisible. Below `sm` this page opens in day view on today, so an event
    // for any other day was written, confirmed by a 2s green tick, and left off
    // screen — "Nothing scheduled today" over an event that had just been
    // created. /home never had this problem: its panel lists what is *upcoming*
    // and prints a line naming what landed.
    //
    // Derived through `parsedLocalDate` rather than `new Date(parsed.starts_at)`
    // so the view and the row agree on the day — an all-day parse is a bare
    // date, which `new Date` reads as UTC midnight and lands on the day before
    // anywhere west of Greenwich.
    const landedOn = parsedLocalDate(parsed.starts_at, parsed.all_day)
    // Setting the date is what reloads: `useEffect(..., [currentDate])` fires on
    // the new object, exactly as `navigate()` relies on. Guarded because an
    // unparseable date would make every downstream format() throw — and in that
    // case the reload has to happen the direct way instead.
    if (isValid(landedOn)) setCurrentDate(landedOn)
    else await loadData()
  }

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })

  return (
    <div className="flex h-full overflow-hidden">

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar — stacks into two rows below sm: so nothing clips on phones;
            wraps (rather than overlapping) at cramped narrow-desktop widths */}
        <div className="flex flex-col gap-2 px-4 py-2.5 border-b border-border bg-background shrink-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">

          {/* Row 1: date label + picker + week navigation */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="relative">
              <button
                onClick={() => setDatePickerOpen(!datePickerOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent/50 transition-colors group"
              >
                <span className="font-heading font-normal tracking-tight text-foreground whitespace-nowrap text-base sm:text-xl">
                  <span className="sm:hidden">{getHeaderLabel(true)}</span>
                  <span className="hidden sm:inline">{getHeaderLabel(false)}</span>
                </span>
                <ChevronDown
                  size={13}
                  className={cn(
                    'shrink-0 text-muted-foreground transition-transform duration-150',
                    datePickerOpen && 'rotate-180'
                  )}
                />
              </button>

              {datePickerOpen && (
                <DatePickerPopup
                  currentDate={currentDate}
                  onDaySelect={(day) => setCurrentDate(day)}
                  onClose={() => setDatePickerOpen(false)}
                />
              )}
            </div>

            {/* Week navigation */}
            <div className="flex items-center gap-0.5 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
                <ChevronLeft size={14} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs rounded-[10px] border-[#d6d6d6] text-[#333]"
                onClick={() => setCurrentDate(new Date())}
              >
                Today
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(1)}>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>

          {/* Row 2: view switcher + AI + New Event + panel toggle */}
          <div className="flex items-center gap-1.5 sm:ml-auto">
            {/* View switcher (desktop) */}
            <div className="hidden sm:flex gap-0.5">
              {(['week', 'month', 'day', 'list'] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium capitalize transition-colors rounded-[42px]',
                    view === v
                      ? 'bg-black text-white'
                      : 'text-[#7b7b7b] hover:text-black'
                  )}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* Mobile view select */}
            <select
              className="sm:hidden px-2 py-1 text-xs rounded-md border border-border bg-background"
              value={view}
              onChange={(e) => setView(e.target.value as ViewMode)}
            >
              {(['week', 'month', 'day', 'list'] as ViewMode[]).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1.5 sm:ml-0">
              <AIEventInput onEventParsed={handleAIEvent} />
              <Button size="sm" className="h-7 px-2 text-xs rounded-[10px]" onClick={() => openNewEvent(new Date())}>
                <Plus size={12} className="mr-1" />
                <span className="hidden sm:inline">New Event</span>
                <span className="sm:hidden">New</span>
              </Button>

              {/* Right panel toggle (hidden below md: — panel is desktop-only chrome) */}
              <button
                onClick={() => setRightOpen(!rightOpen)}
                className={cn(
                  'hidden md:inline-flex p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors',
                  rightOpen && 'text-primary'
                )}
                title="Toggle time grid"
              >
                {rightOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* Calendar body */}
        <div className="flex-1 overflow-hidden">
          {view === 'week' && (
            <WeeklyBoard
              weekStart={weekStart}
              posts={posts}
              ideas={ideas}
              onAddPost={openAddPost}
              onPostClick={openEditPost}
              onMovePost={handleMovePost}
              onMoveIdea={handleMoveIdea}
            />
          )}
          {view === 'month' && (
            <MonthGrid
              currentDate={currentDate}
              events={visibleEvents}
              posts={posts}
              ideas={ideas}
              onDayClick={openNewEvent}
              onEventClick={openEditEvent}
              onDayOpen={(d) => { setCurrentDate(d); setView('day') }}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              events={visibleEvents.filter((e) => eventCoversDay(e, currentDate))}
              posts={posts.filter(
                (p) => p.scheduled_at && isSameDay(parseISO(p.scheduled_at), currentDate)
              )}
              ideas={ideas.filter(
                (i) => i.date_start && isSameDay(parseISO(i.date_start), currentDate)
              )}
              onEventClick={openEditEvent}
              onAddClick={() => openNewEvent(currentDate)}
            />
          )}
          {view === 'list' && (
            <ListView
              events={visibleEvents}
              posts={posts}
              ideas={ideas}
              onEventClick={openEditEvent}
            />
          )}
        </div>
      </div>

      {/* Right panel — desktop-only chrome; hidden below md: so it never
          squeezes the calendar on phones */}
      {rightOpen && (
        <div className="hidden md:flex w-[268px] shrink-0 overflow-hidden flex-col h-full">
          <RightPanel
            events={visibleEvents}
            onEventClick={openEditEvent}
            initialDate={new Date()}
            calendars={calendars}
            onToggleCalendar={toggleCalendarVisibility}
            onEditCalendar={(cal) => { setEditingCalendar(cal); setManageDialogOpen(true) }}
            onClose={() => setRightOpen(false)}
          />
        </div>
      )}

      {/* Collapsed right panel affordance on desktop */}
      {!rightOpen && (
        <button
          onClick={() => setRightOpen(true)}
          className="hidden lg:flex items-center justify-center w-8 border-l border-border text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors shrink-0"
          title="Show time grid"
        >
          <PanelRightOpen size={14} />
        </button>
      )}

      <EventDialog
        open={eventDialogOpen}
        onClose={() => setEventDialogOpen(false)}
        onSave={handleEventSave}
        onDelete={handleEventDelete}
        event={editingEvent}
        defaultDate={selectedDate}
        calendars={calendars}
      />

      <PostDialog
        open={postDialogOpen}
        onClose={() => setPostDialogOpen(false)}
        onSave={handlePostSave}
        onDelete={handlePostDelete}
        post={editingPost}
        defaultStage="scheduled"
        defaultScheduledAt={postDefaultDate}
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
// Day View
// ─────────────────────────────────────────────
function DayView({
  currentDate, events, posts, ideas, onEventClick, onAddClick,
}: {
  currentDate: Date
  events: CalendarEvent[]
  posts: SocialPost[]
  ideas: Idea[]
  onEventClick: (e: CalendarEvent) => void
  onAddClick: () => void
}) {
  const isEmpty = events.length === 0 && posts.length === 0 && ideas.length === 0
  return (
    <div className="p-6 space-y-3">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <p className="text-sm mb-3">Nothing scheduled today</p>
          <Button variant="outline" size="sm" onClick={onAddClick}>
            <Plus size={14} className="mr-1" /> Add event
          </Button>
        </div>
      ) : (
        <>
          {events.map((event) => (
            <button key={event.id} onClick={() => onEventClick(event)}
              className="w-full text-left border border-border rounded-lg p-4 hover:bg-accent/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-1 self-stretch rounded-full mt-0.5"
                  style={{ backgroundColor: (event.calendar as Calendar | undefined)?.color ?? '#6366f1' }} />
                <div>
                  <p className="font-medium text-sm">{event.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {event.all_day ? 'All day'
                      : format(parseISO(event.starts_at), 'h:mm a') +
                        (event.ends_at ? ' – ' + format(parseISO(event.ends_at), 'h:mm a') : '')}
                  </p>
                  {event.location && <p className="text-xs text-muted-foreground">{event.location}</p>}
                </div>
              </div>
            </button>
          ))}
          {posts.map((post) => (
            <div key={post.id} className="border border-border rounded-lg p-4 flex items-start gap-3"
              style={{ borderLeftColor: PLATFORM_COLORS[post.platform], borderLeftWidth: 3 }}>
              <PlatformIcon platform={post.platform} size={24} />
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{post.title ?? `${post.platform} ${post.post_type}`}</p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                  {post.post_type} · {post.stage} · {post.scheduled_at ? format(parseISO(post.scheduled_at), 'h:mm a') : ''}
                </p>
              </div>
            </div>
          ))}
          {ideas.map((idea) => (
            <div key={idea.id} className="border border-dashed border-amber-300 bg-amber-50/50 rounded-lg p-4">
              <p className="font-medium text-sm">{idea.title}</p>
              {idea.platform && <p className="text-xs text-muted-foreground mt-0.5 capitalize">{idea.platform} idea</p>}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// List View
// ─────────────────────────────────────────────
function ListView({ events, posts, ideas, onEventClick }: {
  events: CalendarEvent[]
  posts: SocialPost[]
  ideas: Idea[]
  onEventClick: (e: CalendarEvent) => void
}) {
  type DayItem =
    | { kind: 'event'; data: CalendarEvent; time: string }
    | { kind: 'post'; data: SocialPost; time: string }
    | { kind: 'idea'; data: Idea; time: string }

  const grouped: Record<string, DayItem[]> = {}
  const add = (key: string, item: DayItem) => { if (!grouped[key]) grouped[key] = []; grouped[key].push(item) }

  events.forEach((e) => add(format(parseISO(e.starts_at), 'yyyy-MM-dd'), { kind: 'event', data: e, time: e.starts_at }))
  posts.forEach((p) => { if (p.scheduled_at) add(format(parseISO(p.scheduled_at), 'yyyy-MM-dd'), { kind: 'post', data: p, time: p.scheduled_at }) })
  ideas.forEach((i) => { if (i.date_start) add(i.date_start, { kind: 'idea', data: i, time: i.date_start }) })

  const sortedDays = Object.keys(grouped).sort()
  if (sortedDays.length === 0)
    return <div className="p-8 text-center text-muted-foreground text-sm">Nothing upcoming</div>

  return (
    <div className="p-6 space-y-6">
      {sortedDays.map((dateKey) => (
        <div key={dateKey}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {format(parseISO(dateKey), 'EEEE, MMMM d')}
          </h3>
          <div className="space-y-2">
            {grouped[dateKey].sort((a, b) => a.time.localeCompare(b.time)).map((item) => {
              if (item.kind === 'event') {
                const event = item.data
                return (
                  <button key={event.id} onClick={() => onEventClick(event)}
                    className="w-full text-left border border-border rounded-lg p-3 hover:bg-accent/30 transition-colors flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: (event.calendar as Calendar | undefined)?.color ?? '#6366f1' }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{event.title}</p>
                      {event.location && <p className="text-xs text-muted-foreground truncate">{event.location}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {event.all_day ? 'All day' : format(parseISO(event.starts_at), 'h:mm a')}
                    </span>
                  </button>
                )
              }
              if (item.kind === 'post') {
                const post = item.data
                return (
                  <div key={post.id} className="border border-border rounded-lg p-3 flex items-center gap-3"
                    style={{ borderLeftColor: PLATFORM_COLORS[post.platform], borderLeftWidth: 3 }}>
                    <PlatformIcon platform={post.platform} size={20} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{post.title ?? `${post.platform} ${post.post_type}`}</p>
                      <p className="text-xs text-muted-foreground capitalize">{post.post_type} · {post.stage}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {post.scheduled_at ? format(parseISO(post.scheduled_at), 'h:mm a') : ''}
                    </span>
                  </div>
                )
              }
              const idea = item.data
              return (
                <div key={idea.id} className="border border-dashed border-amber-300 bg-amber-50/50 rounded-lg p-3 flex items-center gap-3">
                  <span className="text-base">💡</span>
                  <p className="font-medium text-sm truncate flex-1">{idea.title}</p>
                  {idea.platform && <span className="text-xs text-muted-foreground capitalize shrink-0">{idea.platform}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
