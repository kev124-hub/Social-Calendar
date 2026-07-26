'use client'

// Replaces the MonthGrid function inside src/components/calendar/CalendarView.tsx
// (or extract to src/components/calendar/MonthGrid.tsx and import it).
//
// Same inputs and same click behaviour as today: onDayClick(day) opens a new
// event, onEventClick(event) edits. PostChip / IdeaChip navigation is preserved
// via the router pushes below.
//
// What changed: the cell is now 158px tall and each row carries real content —
// time, platform code, and a two-line title with a coloured left edge — instead
// of a single truncated line. Cells are tinted weekday-blue / weekend-yellow,
// carry a per-day count badge, and lift on hover.

import { useRouter } from 'next/navigation'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO, startOfDay,
} from 'date-fns'
import { cn } from '@/lib/utils'
import type { CalendarEvent, Calendar, SocialPost, Idea } from '@/types/database'
import { GLASS, INK, MOTION, PLATFORM, dayTint, TODAY_BORDER } from '@/lib/glass'

const MAX_ROWS = 3

function eventCoversDay(event: CalendarEvent, day: Date): boolean {
  const start = startOfDay(parseISO(event.starts_at))
  const end = event.ends_at ? startOfDay(parseISO(event.ends_at)) : start
  const d = startOfDay(day)
  return d >= start && d <= end
}

type Row =
  | { kind: 'event'; id: string; time: string; label: string; title: string; edge: string }
  | { kind: 'post'; id: string; time: string; label: string; title: string; edge: string }
  | { kind: 'idea'; id: string; time: string; label: string; title: string; edge: string }

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
    <div className="flex h-full flex-col overflow-y-auto p-[14px]" style={{ background: GLASS.wash }}>
      <div className="mb-2 grid gap-2" style={{ gridTemplateColumns: 'repeat(7, minmax(0,1fr))' }}>
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
          <p key={d} className="m-0 pl-1 tracking-[.16em]" style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10, color: INK.tertiary }}>
            {d}
          </p>
        ))}
      </div>

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
              className="flex cursor-pointer flex-col gap-[6px] px-2 py-[9px] transition-transform"
              style={{
                minHeight: 158,
                minWidth: 0,
                borderRadius: 15,
                backdropFilter: 'blur(10px)',
                background: outside ? 'rgba(214,222,231,.30)' : (today ? 'rgba(255,255,255,.88)' : tint.bg),
                border: `1px solid ${today ? TODAY_BORDER : (outside ? 'rgba(11,79,108,.14)' : tint.border)}`,
                transition: `transform .26s ${MOTION.ease}, box-shadow .26s ease`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)'; e.currentTarget.style.boxShadow = GLASS.shadowPanel }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
            >
              <div className="flex min-w-0 items-baseline gap-[6px]">
                <span
                  style={{
                    fontFamily: 'var(--font-playfair)', fontSize: 19, fontWeight: 600, lineHeight: 1,
                    color: outside ? 'rgba(27,20,31,.34)' : INK.primary,
                  }}
                >
                  {format(day, 'd')}
                </span>
                {rows.length > 0 && (
                  <span
                    className="ml-auto rounded-full px-[6px] py-[2px]"
                    style={{ fontFamily: 'var(--font-mono-num)', fontSize: 9, fontWeight: 700, color: '#0b3a50', background: 'rgba(255,255,255,.80)' }}
                  >
                    {rows.length}
                  </span>
                )}
              </div>

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
                    className={cn('block overflow-hidden')}
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

              {overflow > 0 && (
                <span className="pl-[3px]" style={{ fontFamily: 'var(--font-mono-num)', fontSize: 9, fontWeight: 600, color: '#0b3a50' }}>
                  +{overflow} more
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
