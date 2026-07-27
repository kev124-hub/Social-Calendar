'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { addDays, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { createEventFromParsed } from '@/lib/events'
import type { CalendarEvent, Calendar, SocialPost } from '@/types/database'
import type { AIEventInputHandle, ParsedEvent } from '@/components/calendar/AIEventInput'
import { EventDialog } from '@/components/calendar/EventDialog'
import { PostDialog } from '@/components/pipeline/PostDialog'
import { IdeaDialog } from '@/components/ideas/IdeaDialog'
import { INK, RADIUS } from '@/lib/glass'
import { MONO, PANEL } from './glass-home'
import { NextPublishHero } from './NextPublishHero'
import { StatTiles } from './StatTiles'
import { WeekStrip } from './WeekStrip'
import { NeedsAttention } from './NeedsAttention'
import { EventsPanel } from './EventsPanel'
import { QuickActions } from './QuickActions'

const READY_STAGES = new Set(['scheduled', 'published'])
const QUEUED_STATUSES = new Set(['pending', 'processing'])

function greetingFor(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function Header({ now, actions }: { now: Date; actions?: React.ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] uppercase" style={{ ...MONO, color: INK.tertiary, letterSpacing: '.14em' }}>
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="mt-1 font-heading text-[28px] leading-tight" style={{ color: INK.primary }}>
          {greetingFor(now.getHours())}, Kevin
        </h1>
      </div>
      {actions}
    </header>
  )
}

export function HomeView() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // Bumped by the retry button to re-run the query effect.
  const [attempt, setAttempt] = useState(0)

  // Phase B: the events block's own data. Kept in a separate query and a
  // separate failure flag from the posts read — a calendar that won't load is
  // no reason to blank the four blocks that don't depend on it, so this failure
  // stays inside the events panel.
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<Calendar[]>([])
  const [eventsFailed, setEventsFailed] = useState(false)
  const [eventsAttempt, setEventsAttempt] = useState(0)

  // Dialogs mounted by the quick actions and the events block.
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [ideaDialogOpen, setIdeaDialogOpen] = useState(false)
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const aiInputRef = useRef<AIEventInputHandle>(null)

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

  // Calendars + upcoming events. Same 12s bound and same catch as the posts
  // query above, for the same reason: a host that accepts the socket and never
  // answers would otherwise leave this block on "Loading…" with nothing to
  // retry.
  useEffect(() => {
    const supabase = createClient()
    let live = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)

    ;(async () => {
      try {
        // From the start of today, not from now: an all-day event happening
        // today has a `starts_at` of 00:00, so a `>= now` filter would hide
        // exactly the events most worth seeing. EventsPanel drops the timed
        // ones that have already passed.
        const from = startOfDay(new Date()).toISOString()
        const [calendarsRes, eventsRes] = await Promise.all([
          supabase.from('calendars').select('*').order('name').abortSignal(controller.signal),
          supabase
            .from('calendar_events')
            .select('*, calendar:calendars(*)')
            .gte('starts_at', from)
            .order('starts_at')
            // Over-fetch: the visible-calendar filter runs client-side, so
            // limiting to 5 here would return 5 rows that could all be hidden
            // and render an empty list while events exist.
            .limit(40)
            .abortSignal(controller.signal),
        ])
        if (!live) return
        if (calendarsRes.error || eventsRes.error || !calendarsRes.data || !eventsRes.data) {
          setEventsFailed(true)
        } else {
          setCalendars(calendarsRes.data)
          setEvents(eventsRes.data)
          setEventsFailed(false)
        }
      } catch {
        if (live) setEventsFailed(true)
      } finally {
        clearTimeout(timeout)
      }
    })()

    return () => {
      live = false
      clearTimeout(timeout)
    }
  }, [eventsAttempt])

  const refetchEvents = useCallback(() => setEventsAttempt((a) => a + 1), [])

  // Throws on a failed write; AIEventInput renders the message. The refetch
  // only runs on success, so the list never implies an event that isn't there.
  const handleCreateFromParsed = useCallback(
    async (parsed: ParsedEvent) => {
      await createEventFromParsed(createClient(), parsed, calendars)
      refetchEvents()
    },
    [calendars, refetchEvents]
  )

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

  const quickActions = (
    <QuickActions
      onNewPost={() => setPostDialogOpen(true)}
      onCaptureIdea={() => setIdeaDialogOpen(true)}
      onPasteEvent={() => aiInputRef.current?.focus()}
    />
  )

  return (
    <div className="mx-auto w-full max-w-[1180px] p-4 sm:p-6">
      <Header now={now} actions={quickActions} />

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

      {/* Row 3 — needs-attention + events. Phase A shipped this full-width
          because the right column had nothing in it yet; Phase B fills it.
          Both blocks are standalone, so Phase C moving the events panel down
          to a full-width Row 4 (ReadyReel takes this slot) stays a layout-only
          change. The single-column case needs the explicit minmax(0,1fr) for
          the same reason Row 1 does — a bare `grid` sizes an auto column to
          min-content, and `truncate` reports the whole untruncated string. */}
      {/* `items-start` rather than the grid default of `stretch`: "All clear —
          nothing needs attention" is the state this page is trying to be in, and
          stretched to the events panel's height it became a 340px empty box that
          read as a rendering fault. Panels size to their content instead. */}
      <div className="mt-3.5 grid items-start gap-3.5 [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.35fr)_minmax(0,1fr)]">
        <NeedsAttention posts={posts} now={now} />
        <EventsPanel
          events={events}
          calendars={calendars}
          now={now}
          failed={eventsFailed}
          onRetry={refetchEvents}
          onCreate={handleCreateFromParsed}
          onOpenManual={() => setEventDialogOpen(true)}
          focusRef={aiInputRef}
        />
      </div>

      {/* Quick-action and events-block dialogs. Each is self-contained and does
          its own write; they only need telling to refetch afterwards. */}
      <PostDialog
        open={postDialogOpen}
        onClose={() => setPostDialogOpen(false)}
        onSave={() => {
          setPostDialogOpen(false)
          setAttempt((a) => a + 1)
        }}
        onDelete={() => {
          setPostDialogOpen(false)
          setAttempt((a) => a + 1)
        }}
        post={null}
        defaultStage="idea"
      />

      <IdeaDialog
        open={ideaDialogOpen}
        onClose={() => setIdeaDialogOpen(false)}
        onSave={() => setIdeaDialogOpen(false)}
        onDelete={() => setIdeaDialogOpen(false)}
        idea={null}
      />

      <EventDialog
        open={eventDialogOpen}
        onClose={() => setEventDialogOpen(false)}
        onSave={() => {
          setEventDialogOpen(false)
          refetchEvents()
        }}
        // No delete path here: this dialog only ever opens on a new event, so
        // `event` is null and the Delete button never renders.
        onDelete={() => setEventDialogOpen(false)}
        event={null}
        defaultDate={now}
        calendars={calendars}
      />
    </div>
  )
}
