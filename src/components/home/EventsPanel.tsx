'use client'

import { useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { AIEventInput, type AIEventInputHandle, type ParsedEvent } from '@/components/calendar/AIEventInput'
import type { CalendarEvent, Calendar } from '@/types/database'
import { resolveDefaultCalendar, type WriteResult } from '@/lib/events'
import { INK, RADIUS } from '@/lib/glass'
import { MONO, PANEL } from './glass-home'

const MAX_ROWS = 5
/** How long the "Added ·" line stays up. Inline state — no toast library. */
const CONFIRM_MS = 5000

export interface EventsPanelProps {
  events: CalendarEvent[]
  calendars: Calendar[]
  /** Null until the clock lands after mount — see HomeView's `now`. */
  now: Date
  failed: boolean
  onRetry: () => void
  /** Creates the event AND refetches, so the list below reflects it. Throws. */
  onCreate: (parsed: ParsedEvent) => Promise<WriteResult>
  onOpenManual: () => void
  /** Opens an existing row for editing — same dialog `Manual +` opens. */
  onOpenEvent: (event: CalendarEvent) => void
  focusRef?: React.Ref<AIEventInputHandle>
}

function calendarOf(event: CalendarEvent, calendars: Calendar[]) {
  return event.calendar ?? calendars.find((c) => c.id === event.calendar_id) ?? null
}

function timeLabel(event: CalendarEvent) {
  if (event.all_day) return 'All day'
  return format(parseISO(event.starts_at), 'h:mm a')
}

function EventRow({
  event,
  calendars,
  onOpen,
}: {
  event: CalendarEvent
  calendars: Calendar[]
  onOpen: (event: CalendarEvent) => void
}) {
  const calendar = calendarOf(event, calendars)
  const day = parseISO(event.starts_at)
  return (
    // A button, not a div with an onClick. The row already advertised itself as
    // interactive with a hover lift while doing nothing at all — and a div would
    // have kept that promise for a mouse only, staying untabbable and invisible
    // to a screen reader. `w-full text-left` because a button centres and shrinks
    // to its content by default, which would have quietly undone the row layout.
    <button
      type="button"
      onClick={() => onOpen(event)}
      className="flex w-full items-start gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-transform hover:translate-x-1"
    >
      <span
        className="w-[42px] shrink-0 pt-[1px] text-[11px] leading-tight"
        style={{ ...MONO, color: INK.tertiary }}
      >
        {timeLabel(event)}
      </span>
      <span
        className="mt-[3px] block h-[22px] w-[4px] shrink-0 rounded-full"
        style={{ background: calendar?.color || 'rgba(27,20,31,.28)' }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium" style={{ color: INK.primary }}>
          {event.title || 'Untitled'}
        </span>
        <span className="block truncate text-[10px] uppercase" style={{ ...MONO, color: INK.tertiary, letterSpacing: '.1em' }}>
          {format(day, 'EEE d MMM')}
          {calendar ? ` · ${calendar.name}` : ''}
        </span>
      </span>
    </button>
  )
}

export function EventsPanel({
  events,
  calendars,
  now,
  failed,
  onRetry,
  onCreate,
  onOpenManual,
  onOpenEvent,
  focusRef,
}: EventsPanelProps) {
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ruling 3 in one function: creating an event has to produce something
  // visible. The list below refetches, and this line names what landed and
  // where — the original bug was a save that worked with nothing on screen to
  // say so.
  async function handleParsed(parsed: ParsedEvent) {
    setFailure(null)
    let result: WriteResult
    try {
      // Nothing below runs unless the write actually succeeded.
      result = await onCreate(parsed)
    } catch (err) {
      // Caught to put the message on screen, then re-thrown so AIEventInput
      // still marks its own input as failed. On desktop that component reports
      // errors only through a `title` tooltip, which you have to hover to find
      // — on the surface whose whole purpose is that creating an event has a
      // visible outcome, a failure has to be as visible as the confirmation.
      setFailure(err instanceof Error ? err.message : 'Could not save the event.')
      throw err
    }

    // Built from the parse plus the shared calendar resolution rather than from
    // the refetched row: an insert that RLS lets through but blocks reading back
    // would otherwise leave a successful create with no confirmation at all.
    const calendar = resolveDefaultCalendar(calendars)
    const when = parsed.all_day
      ? format(parseISO(parsed.starts_at), 'EEE')
      : format(parseISO(parsed.starts_at), 'EEE h:mm a')
    // The event is saved either way. When Google did not get it, say so rather
    // than implying a sync that has not happened.
    //
    // A dead token gets its own wording because it is the only push failure
    // that never resolves on its own: "not in Google yet" is true but useless
    // when the answer is "and it never will be until you reconnect".
    const google = result.pushedToGoogle
      ? ''
      : result.needsGoogleReconnect
        ? ' · reconnect Google in Settings to sync it'
        : ' · not in Google yet'
    setConfirmation(
      `Added · ${parsed.title} · ${when}${calendar ? ` · ${calendar.name}` : ''}${google}`
    )
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setConfirmation(null), CONFIRM_MS)
  }

  // Same visibility rule CalendarView applies: an event on a hidden calendar is
  // filtered out, but one with no calendar at all still shows.
  const visibleIds = new Set(calendars.filter((c) => c.is_visible).map((c) => c.id))
  const upcoming = events
    .filter((e) => !e.calendar_id || visibleIds.has(e.calendar_id))
    // The query fetches from the start of today so that today's all-day events
    // survive; drop the timed ones that have already been and gone.
    .filter((e) => e.all_day || parseISO(e.starts_at) >= now)
    .slice(0, MAX_ROWS)

  return (
    <section style={PANEL} className="flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold" style={{ color: INK.strong }}>
          Events
        </h3>
        <button
          type="button"
          onClick={onOpenManual}
          className="shrink-0 px-2 py-1 text-[9.5px] uppercase text-[#5d5660] transition-colors hover:text-[#0b3a50]"
          style={{ ...MONO, letterSpacing: '.12em', borderRadius: RADIUS.control }}
        >
          Manual +
        </button>
      </div>

      <div className="flex items-center gap-2">
        <AIEventInput
          ref={focusRef}
          onEventParsed={handleParsed}
          className="flex-1"
          inputWidthClassName="w-full"
        />
        {/* Below `sm` AIEventInput collapses to a sparkle button that opens a
            sheet, so the panel needs its own prompt beside it or the row reads
            as a lone unexplained icon. */}
        <span className="text-[11.5px] sm:hidden" style={{ color: INK.tertiary }}>
          Add an event with AI
        </span>
      </div>

      {/* aria-live so the outcome is announced, not just drawn — this line is
          the only feedback that a create worked or didn't. The failure has no
          timeout: it stays until the next attempt, because a message that
          deletes itself is a message that can be missed. */}
      {failure ? (
        <p aria-live="polite" role="alert" className="mt-2 text-[10px]" style={{ ...MONO, color: '#8a2b12' }}>
          {failure}
        </p>
      ) : confirmation ? (
        <p aria-live="polite" className="mt-2 text-[10px]" style={{ ...MONO, color: '#2f6b45' }}>
          {confirmation}
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-0.5">
        {failed ? (
          // Never render "Nothing coming up" for a read that failed — that is a
          // claim about the calendar we cannot make.
          <>
            <p className="px-2 text-[12.5px] font-medium" style={{ color: INK.primary }}>
              Couldn’t load your events
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 self-start px-2 py-1 text-[9.5px] uppercase text-[#5d5660] transition-colors hover:text-[#0b3a50]"
              style={{ ...MONO, letterSpacing: '.12em', borderRadius: RADIUS.control }}
            >
              Try again →
            </button>
          </>
        ) : upcoming.length === 0 ? (
          <p className="px-2 text-[12.5px] font-medium" style={{ color: INK.tertiary }}>
            Nothing coming up.
          </p>
        ) : (
          upcoming.map((event) => (
            <EventRow key={event.id} event={event} calendars={calendars} onOpen={onOpenEvent} />
          ))
        )}
      </div>
    </section>
  )
}
