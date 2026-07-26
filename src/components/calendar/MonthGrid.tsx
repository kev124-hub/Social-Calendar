'use client'

// src/components/calendar/MonthGrid.tsx — Riviera Glass month view.
//
// Extracted out of CalendarView.tsx, where it was a local function. Same
// inputs and the same click behaviour as before: onDayClick(day) opens a new
// event, onEventClick(event) edits one, post and idea rows route to
// /pipeline?post= and /ideas?idea= as the old PostChip / IdeaChip did.
//
// What changed: cells are 158px tall and each row carries real content — time,
// a type code, and a two-line title with a coloured left edge — instead of one
// truncated line. Cells are tinted weekday-blue / weekend-yellow, carry a
// per-day count badge, and lift on hover.
//
// Deviations from the design bundle, each explained at its site:
//   · no second copy of the app wash
//   · the hover lift is gated on a real hover pointer
//   · outside-month numerals respect the "nothing lighter than #5d5660" rule

import { useRouter } from 'next/navigation'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO,
} from 'date-fns'
import type { CalendarEvent, Calendar, SocialPost, Idea } from '@/types/database'
import { GLASS, INK, MOTION, PLATFORM, canHover, dayTint, TODAY_BORDER } from '@/lib/glass'
import { eventCoversDay } from '@/lib/calendar-utils'

const MAX_ROWS = 3

type Row = {
  kind: 'event' | 'post' | 'idea'
  id: string
  time: string
  label: string
  title: string
  edge: string
}

export function MonthGrid({
  currentDate, events, posts, ideas, onDayClick, onEventClick,
}: {
  currentDate: Date
  events: CalendarEvent[]
  posts: SocialPost[]
  ideas: Idea[]
  onDayClick: (d: Date) => void
  onEventClick: (e: CalendarEvent) => void
}) {
  const router = useRouter()
  const monthStart = startOfMonth(currentDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    // No background here. Stage 1 put the wash on the app container; a second
    // copy anchors its radial gradients to this box and shows a seam at the
    // sidebar edge. Same deviation as the week board.
    <div className="flex h-full flex-col overflow-y-auto p-[14px]">
      <div className="mb-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(7, minmax(0,1fr))' }}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
          <p
            key={d}
            className="m-0 pl-1 tracking-[.16em]"
            style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10, color: INK.tertiary }}
          >
            {d}
          </p>
        ))}
      </div>

      {/* minmax(0,1fr) plus min-width:0 on the cells is required — with plain
          1fr and nowrap titles the tracks blow past the container. */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(7, minmax(0,1fr))', perspective: 1400 }}>
        {days.map((day) => {
          const outside = !isSameMonth(day, currentDate)
          const today = isToday(day)
          const tint = dayTint(day.getDay())

          const rows: Row[] = [
            ...events.filter((e) => eventCoversDay(e, day)).map<Row>((e) => ({
              kind: 'event',
              id: e.id,
              time: e.all_day ? 'ALL DAY' : format(parseISO(e.starts_at), 'HH:mm'),
              label: 'EVT',
              title: e.title,
              edge: (e.calendar as Calendar | undefined)?.color ?? '#0b3a50',
            })),
            ...posts.filter((p) => p.scheduled_at && isSameDay(parseISO(p.scheduled_at), day)).map<Row>((p) => {
              const pf = PLATFORM[p.platform as keyof typeof PLATFORM] ?? PLATFORM.instagram
              return {
                kind: 'post',
                id: p.id,
                time: format(parseISO(p.scheduled_at!), 'HH:mm'),
                label: pf.code,
                title: p.title ?? `${p.platform} ${p.post_type ?? ''}`,
                edge: pf.ink,
              }
            }),
            ...ideas.filter((i) => i.date_start && isSameDay(parseISO(i.date_start), day)).map<Row>((i) => ({
              kind: 'idea', id: i.id, time: '—', label: 'IDEA', title: i.title, edge: '#8a4b06',
            })),
          ]

          const shown = rows.slice(0, MAX_ROWS)
          const overflow = rows.length - shown.length

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              // min-height as classes, not inline: an inline value would beat
              // the sm: variant (the trap that nearly re-broke the week board).
              // 158px is a desktop cell; at 390px seven of them are ~45px wide,
              // so a full-height cell would just be empty space to scroll past.
              className="flex min-h-[78px] cursor-pointer flex-col gap-[6px] px-1.5 py-[7px] sm:min-h-[158px] sm:px-2 sm:py-[9px]"
              style={{
                minWidth: 0,
                borderRadius: 15,
                backdropFilter: 'blur(10px)',
                background: outside ? 'rgba(214,222,231,.30)' : (today ? 'rgba(255,255,255,.88)' : tint.bg),
                border: `1px solid ${today ? TODAY_BORDER : (outside ? 'rgba(11,79,108,.14)' : tint.border)}`,
                transition: `transform .26s ${MOTION.ease}, box-shadow .26s ease`,
              }}
              // Gated: mouseenter fires on tap on a touch screen with no
              // matching mouseleave, which would leave the cell lifted.
              onMouseEnter={(e) => {
                if (!canHover()) return
                e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)'
                e.currentTarget.style.boxShadow = GLASS.shadowPanel
              }}
              onMouseLeave={(e) => {
                if (!canHover()) return
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = ''
              }}
            >
              <div className="flex min-w-0 items-baseline gap-[3px] sm:gap-[6px]">
                <span
                  // fontSize as a class, not inline, so the sm: variant applies:
                  // at 45px wide a 19px numeral plus the count badge overflowed
                  // the cell by 2px.
                  className="text-[15px] sm:text-[19px]"
                  style={{
                    fontFamily: 'var(--font-playfair)', fontWeight: 600, lineHeight: 1,
                    // The bundle uses rgba(27,20,31,.34) here, which composites
                    // to roughly #a8a5aa — lighter than the design's own hard
                    // floor of #5d5660, and light-on-light was Kevin's original
                    // complaint. INK.tertiary is still clearly recessive next to
                    // INK.primary without breaking that rule.
                    color: outside ? INK.tertiary : INK.primary,
                  }}
                >
                  {format(day, 'd')}
                </span>
                {rows.length > 0 && (
                  <span
                    className="ml-auto shrink-0 rounded-full px-[4px] py-[1px] sm:px-[6px] sm:py-[2px]"
                    style={{ fontFamily: 'var(--font-mono-num)', fontSize: 9, fontWeight: 700, color: '#0b3a50', background: 'rgba(255,255,255,.80)' }}
                  >
                    {rows.length}
                  </span>
                )}
              </div>

              {/* Phones: coloured dots, not rows. Seven columns at 390px gives
                  a ~45px cell, where a time + type chip + title renders one
                  character per line and spills outside the card. Tapping the day
                  still opens it, and the count badge above carries the number.
                  Verified at 390x844 — the spec was authored at desktop width
                  and does not survive a phone. */}
              {rows.length > 0 && (
                <div className="flex flex-wrap items-center gap-[3px] sm:hidden">
                  {rows.slice(0, 6).map((row) => (
                    <span
                      key={`dot-${row.kind}-${row.id}`}
                      className="h-[6px] w-[6px] shrink-0 rounded-full"
                      style={{ background: row.edge, boxShadow: '0 0 0 1px rgba(255,255,255,.75)' }}
                    />
                  ))}
                </div>
              )}

              <div className="hidden flex-col gap-[6px] sm:flex">
              {shown.map((row) => (
                <button
                  key={`${row.kind}-${row.id}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (row.kind === 'event') {
                      const ev = events.find((x) => x.id === row.id)
                      if (ev) onEventClick(ev)
                    } else if (row.kind === 'post') router.push(`/pipeline?post=${row.id}`)
                    else router.push(`/ideas?idea=${row.id}`)
                  }}
                  className="flex min-w-0 flex-col gap-[3px] px-[7px] py-[5px] text-left"
                  style={{
                    borderRadius: 9,
                    background: 'rgba(255,255,255,.90)',
                    borderLeft: `3px solid ${row.edge}`,
                    boxShadow: '0 1px 3px rgba(11,79,108,.12)',
                  }}
                >
                  <span className="flex min-w-0 items-center gap-[5px]">
                    <span style={{ fontFamily: 'var(--font-mono-num)', fontSize: 9.5, fontWeight: 700, color: '#0b3a50' }}>
                      {row.time}
                    </span>
                    <span
                      className="rounded-[4px] px-[4px] py-[1px] tracking-[.06em]"
                      style={{ fontFamily: 'var(--font-mono-num)', fontSize: 8.5, fontWeight: 700, color: INK.primary, background: 'rgba(126,196,231,.45)' }}
                    >
                      {row.label}
                    </span>
                  </span>
                  <span
                    className="block overflow-hidden"
                    style={{
                      fontSize: 10.5, fontWeight: 600, lineHeight: 1.28, color: INK.primary,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {row.title}
                  </span>
                </button>
              ))}

              {/* Derived from the real row count, so it never appears on an
                  empty day. */}
              {overflow > 0 && (
                <span className="pl-[3px]" style={{ fontFamily: 'var(--font-mono-num)', fontSize: 9, fontWeight: 600, color: '#0b3a50' }}>
                  +{overflow} more
                </span>
              )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
