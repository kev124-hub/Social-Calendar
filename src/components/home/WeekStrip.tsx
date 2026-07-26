'use client'

import Link from 'next/link'
import { addDays, format, isSameDay, parseISO, startOfWeek } from 'date-fns'
import type { SocialPost } from '@/types/database'
import { INK, RADIUS, dayTint } from '@/lib/glass'
import { MONO, PANEL } from './glass-home'

const READY_STAGES = new Set(['scheduled', 'published'])

export function WeekStrip({ posts, now }: { posts: SocialPost[]; now: Date }) {
  // weekStartsOn: 0 to match CalendarView — the week view and this strip must
  // agree on which seven days "this week" means, or the counts read as wrong.
  const start = startOfWeek(now, { weekStartsOn: 0 })

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    const onDay = posts.filter((p) => p.scheduled_at && isSameDay(parseISO(p.scheduled_at), date))
    return {
      date,
      total: onDay.length,
      ready: onDay.filter((p) => READY_STAGES.has(p.stage)).length,
    }
  })

  return (
    <section style={PANEL} className="p-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="text-[12px] font-semibold" style={{ color: INK.strong }}>
          This week
        </h3>
        {/* Colour is a class, not an inline style. An inline `color` beats
            `hover:text-[…]` and silently kills the hover — the exact defect
            found in three Stage 8 controls. Anything with a variant must be a
            class; MONO and letter-spacing have none, so they stay inline. */}
        <Link
          href="/calendar"
          className="text-[10px] uppercase text-[#5d5660] transition-colors hover:text-[#0b3a50]"
          style={{ ...MONO, letterSpacing: '.14em' }}
        >
          Open calendar →
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map(({ date, total, ready }) => {
          const tint = dayTint(date.getDay())
          const today = isSameDay(date, now)
          return (
            <Link
              key={date.toISOString()}
              href="/calendar"
              className="flex flex-col p-2 transition-transform hover:-translate-y-[5px]"
              style={{
                background: tint.bg,
                // Today is a dark outline, never its own hue — the weekday /
                // weekend colour split is the legibility device and a third
                // colour would break it.
                border: today ? '1.5px solid rgba(20,16,20,.62)' : `1px solid ${tint.border}`,
                borderRadius: RADIUS.card,
              }}
            >
              <span className="text-[9.5px] uppercase" style={{ ...MONO, color: INK.strong, letterSpacing: '.12em' }}>
                {format(date, 'EEE')}
              </span>
              <span className="font-heading text-[24px] leading-tight" style={{ color: INK.primary }}>
                {format(date, 'd')}
              </span>

              {/* Just the number. "2 posts" wrapped onto two lines in a 44px
                  phone chip and pushed the ready bar out of alignment across
                  the seven days. */}
              <span className="mt-0.5 text-[11px]" style={{ ...MONO, color: INK.strong }}>
                {total > 0 ? total : '—'}
              </span>

              {/* Ready share of the day, same rule as the week columns. Zero
                  posts renders the empty track rather than nothing, so the
                  seven chips keep a common baseline. */}
              <span className="mt-1.5 block h-[5px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.55)' }}>
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: total > 0 ? `${(ready / total) * 100}%` : '0%',
                    background: 'rgba(20,16,20,.55)',
                  }}
                />
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
