'use client'

import { useEffect, useState } from 'react'
import { addDays, parseISO, startOfWeek } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import type { SocialPost } from '@/types/database'
import { INK, RADIUS } from '@/lib/glass'
import { MONO, PANEL } from './glass-home'
import { NextPublishHero } from './NextPublishHero'
import { StatTiles } from './StatTiles'
import { WeekStrip } from './WeekStrip'
import { NeedsAttention } from './NeedsAttention'

const READY_STAGES = new Set(['scheduled', 'published'])
const QUEUED_STATUSES = new Set(['pending', 'processing'])

function greetingFor(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function Header({ now }: { now: Date }) {
  return (
    <header className="mb-4">
      <p className="text-[11px] uppercase" style={{ ...MONO, color: INK.tertiary, letterSpacing: '.14em' }}>
        {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <h1 className="mt-1 font-heading text-[28px] leading-tight" style={{ color: INK.primary }}>
        {greetingFor(now.getHours())}, Kevin
      </h1>
    </header>
  )
}

export function HomeView() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // Bumped by the retry button to re-run the query effect.
  const [attempt, setAttempt] = useState(0)

  // `now` is null until after mount, and every clock-dependent string on this
  // page derives from it. Reading the clock during render would make the
  // server's markup (UTC, build/request time) disagree with the browser's
  // (local, now) and hydration would fail — the same trap the phone day-view
  // default hit in Stage 4. Deliberately a mount effect, not a lazy useState
  // initialiser.
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    // Scheduled via rAF rather than called inline so the first paint is not a
    // synchronous setState inside the effect body.
    const frame = requestAnimationFrame(() => setNow(new Date()))
    // A minute is the resolution the countdown renders at; a per-second timer
    // would re-render the page 60× more often to show the same string.
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    let live = true

    // A request that never settles is worse than one that fails: the page sits
    // on "Loading…" indefinitely with nothing to retry and nothing explaining
    // why. Verified by pointing the client at a host that accepts the socket
    // and never answers — without this the dashboard span forever. Bounded so
    // the failure becomes visible and recoverable.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('social_posts')
          .select('*')
          .order('scheduled_at', { ascending: true, nullsFirst: false })
          .abortSignal(controller.signal)
        if (!live) return
        if (error || !data) setFailed(true)
        else setPosts(data)
      } catch {
        // supabase-js normally reports network failures in `error` rather than
        // rejecting, but not always — an unreachable host rejects. Without this
        // catch the loading flag was never cleared and the page sat on
        // "Loading…" forever with nothing on screen to say why. Found by
        // pointing the client at a dead host.
        if (live) setFailed(true)
      } finally {
        clearTimeout(timeout)
        if (live) setLoading(false)
      }
    })()

    return () => {
      live = false
      clearTimeout(timeout)
    }
  }, [attempt])

  // Everything below needs the clock. Holding the whole page until `now` lands
  // costs one frame and keeps every derived value on a single consistent
  // reading, rather than mixing a null-guarded clock through five components.
  if (!now || loading) {
    return (
      <div className="mx-auto w-full max-w-[1180px] p-4 sm:p-6">
        <p className="text-[12.5px]" style={{ ...MONO, color: INK.tertiary }}>
          Loading…
        </p>
      </div>
    )
  }

  // Every block on this page is derived from the posts query. If it failed we
  // have nothing, and rendering the normal layout would put three zeros and
  // "All clear — nothing needs attention" on screen — all four of which are
  // assertions we cannot make. Say what happened instead.
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-[1180px] p-4 sm:p-6">
        <Header now={now} />
        <section style={PANEL} className="p-4">
          <p className="text-[13px] font-semibold" style={{ color: INK.primary }}>
            Couldn’t load your posts
          </p>
          <p className="mt-1 text-[12.5px]" style={{ color: INK.tertiary }}>
            Counts are hidden rather than shown as zero — nothing here would be true.
          </p>
          <button
            type="button"
            onClick={() => {
              setFailed(false)
              setLoading(true)
              setAttempt((a) => a + 1)
            }}
            className="mt-3 inline-flex items-center px-3 py-1.5 text-[11px] font-semibold transition-transform hover:-translate-y-[2px]"
            style={{ borderRadius: RADIUS.chipPill, background: 'rgba(255,255,255,.72)', color: INK.strong }}
          >
            Try again
          </button>
        </section>
      </div>
    )
  }

  const weekStart = startOfWeek(now, { weekStartsOn: 0 })
  const weekEnd = addDays(weekStart, 7)

  const nextUp =
    posts.find(
      (p) => p.stage === 'scheduled' && p.scheduled_at && parseISO(p.scheduled_at) > now
    ) ?? null

  const ready = posts.filter((p) => {
    if (!p.scheduled_at) return false
    const at = parseISO(p.scheduled_at)
    return at >= weekStart && at < weekEnd && READY_STAGES.has(p.stage)
  }).length

  const behind = posts.filter(
    (p) => p.scheduled_at && parseISO(p.scheduled_at) < now && p.stage !== 'published'
  ).length

  // A failed read no longer reaches here — it returns the error state above,
  // which is a better answer than a lone em dash beside two confident zeros.
  // StatTile still renders `—` for a null value; Phase C's separate queries
  // can fail independently of this one.
  const queued = posts.filter((p) => p.publish_status && QUEUED_STATUSES.has(p.publish_status)).length

  return (
    <div className="mx-auto w-full max-w-[1180px] p-4 sm:p-6">
      <Header now={now} />

      {/* Row 1 — hero + stats. Stacks below sm:; the 1.55/1 split only makes
          sense once there is room for a 132px thumb beside the copy.
          The single-column case needs an explicit minmax(0,1fr) too. A bare
          `grid` gives an `auto` column, which sizes to the item's min-content
          — and the hero's title is `truncate`, i.e. white-space:nowrap, whose
          min-content is the *entire* untruncated string. That made the column
          490px wide inside a 342px phone and scrolled the page sideways.
          `min-w-0` does not help here: it governs shrinking once the column
          has a definite size, not the intrinsic measurement that sets it. */}
      <div className="grid gap-3.5 [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:minmax(0,1.55fr)_minmax(0,1fr)]">
        <NextPublishHero post={nextUp} now={now} />
        <StatTiles ready={ready} behind={behind} queued={queued} />
      </div>

      {/* Row 2 */}
      <div className="mt-3.5">
        <WeekStrip posts={posts} now={now} />
      </div>

      {/* Row 3 — full width in Phase A. Phase B puts the events block in a
          right-hand column here and this becomes the 1.35/1 grid the plan
          describes; NeedsAttention is standalone so that stays a layout
          change. Shipping an empty column now would just look broken. */}
      <div className="mt-3.5">
        <NeedsAttention posts={posts} now={now} />
      </div>
    </div>
  )
}
