'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { addDays, parseISO, startOfDay, startOfWeek } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { createEventFromParsed, deleteEvent } from '@/lib/events'
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
import { ReadyReel } from './ReadyReel'
import { QuickActions } from './QuickActions'
import { titleFromFilename, type ReelItem } from '@/lib/ready-reel'
import { useFocusSync } from '@/lib/use-focus-sync'

const READY_STAGES = new Set(['scheduled', 'published'])
const QUEUED_STATUSES = new Set(['pending', 'processing'])

// Dropbox temporary links expire in about four hours, and this page is the kind
// of thing that gets left open all day. A stale link paints nothing, so the reel
// would sit on placeholder stripes with no error anywhere to explain it. Re-mint
// when the tab comes back to the front and the links are old enough to be worth
// worrying about — well inside the four hours, and only on a real return to the
// page, so it is not a background poll.
const REEL_LINK_STALE_MS = 3 * 60 * 60 * 1000

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

  // Phase C: the ReadyReel's own data — the Dropbox "Ready to Post" folder,
  // read through our API route because the Dropbox credentials are server-side
  // only. Its own failure flag for the same reason the events block has one: a
  // Dropbox outage is no reason to blank the four blocks that never asked it
  // anything.
  const [reelItems, setReelItems] = useState<ReelItem[]>([])
  const [reelLoading, setReelLoading] = useState(true)
  const [reelFailed, setReelFailed] = useState(false)
  const [reelAttempt, setReelAttempt] = useState(0)
  // When the links currently on screen were minted. A ref, not state: nothing
  // renders from it, and re-rendering the page on a bookkeeping write would be
  // the only effect of making it state.
  const reelFetchedAt = useRef(0)

  // Dialogs mounted by the quick actions and the events block.
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [ideaDialogOpen, setIdeaDialogOpen] = useState(false)
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  // Which row the event dialog is editing, or null for `Manual +`'s new event.
  // Deliberately NOT cleared on close: clearing it there would swap the dialog's
  // title and fields back to the empty state mid close-animation. Each opener
  // sets it explicitly instead, which is what CalendarView does.
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  // Which Dropbox export the post dialog is seeded from, or null for a blank
  // new post. Same contract as `editingEvent` above and for the same reason:
  // clearing it on close would swap the dialog's title and attached file back
  // to empty mid close-animation. Every opener sets it explicitly.
  const [reelPick, setReelPick] = useState<ReelItem | null>(null)
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

  // The Ready-to-Post folder. Same 12s bound as the two Supabase reads above —
  // this one crosses two networks (us → our route → Dropbox) and mints a
  // temporary link per file, so it is the read most likely to hang.
  useEffect(() => {
    let live = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)

    ;(async () => {
      try {
        const res = await fetch('/api/dropbox/ready?links=1', { signal: controller.signal })
        const data = await res.json()
        if (!live) return
        if (!res.ok) throw new Error(data?.error ?? 'Failed to load Dropbox folder')
        setReelItems(data.files ?? [])
        setReelFailed(false)
        reelFetchedAt.current = Date.now()
      } catch {
        // Everything here rejects rather than reporting in a body — an aborted
        // fetch, a network failure and the throw above all land in this catch.
        if (live) setReelFailed(true)
      } finally {
        clearTimeout(timeout)
        if (live) setReelLoading(false)
      }
    })()

    return () => {
      live = false
      clearTimeout(timeout)
    }
  }, [reelAttempt])

  const refetchReel = useCallback(() => setReelAttempt((a) => a + 1), [])

  // Re-mint expiring links when the tab is brought back to the front. Gated on
  // age so returning to the page ten times an hour costs one Dropbox call, not
  // ten. `visibilitychange` rather than `focus`: clicking back into an
  // already-visible window is not a reason to re-fetch anything.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      // Nothing has succeeded yet, so there is nothing expiring to re-mint. The
      // zero would otherwise read as "fetched in 1970" and make every return to
      // a still-loading or failed page fire another request; the panel's own
      // "Try again" is the retry, and it is the one the user asked for.
      if (reelFetchedAt.current === 0) return
      if (Date.now() - reelFetchedAt.current < REEL_LINK_STALE_MS) return
      setReelAttempt((a) => a + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const refetchEvents = useCallback(() => setEventsAttempt((a) => a + 1), [])

  // Same throttle and the same in-flight guard as the calendar — the interval is
  // shared through localStorage, so having both views ask does not double the work.
  // /home is the page most likely to be opened cold in the morning, which is
  // exactly when a Google-side change is most likely to be waiting.
  useFocusSync({ onSynced: refetchEvents })

  // Throws on a failed write; AIEventInput renders the message. The refetch
  // only runs on success, so the list never implies an event that isn't there.
  const handleCreateFromParsed = useCallback(
    async (parsed: ParsedEvent) => {
      const result = await createEventFromParsed(createClient(), parsed, calendars)
      refetchEvents()
      return result
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
      // Clears the reel's pick explicitly rather than on close — see the
      // `reelPick` comment. "New post" means a blank one.
      onNewPost={() => {
        setReelPick(null)
        setPostDialogOpen(true)
      }}
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

      {/* Row 3 — needs-attention over events on the left, ReadyReel on the
          right. Phase A shipped this row full-width because the right column had
          nothing in it yet; Phase B put events there; Phase C takes that slot
          for the reel and stacks events under needs-attention.

          Kevin ruled this on 28 July, and it supersedes the home plan (and this
          comment's earlier wording), both of which moved events down to a
          full-width Row 4. There is no Row 4. His reasoning: "At my volume of
          content its unlikely that the needs attention panel is ever going to be
          very large" — so the left column has the room, and events does not need
          a row of its own.

          The single-column case needs the explicit minmax(0,1fr) for the same
          reason Row 1 does — a bare `grid` sizes an auto column to min-content,
          and `truncate` reports the whole untruncated string.

          `items-start` rather than the grid default of `stretch`: "All clear —
          nothing needs attention" is the state this page is trying to be in, and
          stretched to the events panel's height it became a 340px empty box that
          read as a rendering fault. It now governs the reel too, which must not
          stretch to the height of two stacked panels for the same reason.

          The 1.35/1 ratio is deliberately unchanged. It is worth revisiting now
          that the bulk moved left and the right cell holds a fixed-size widget,
          but there is no preview access from the build container, and a ratio is
          exactly the kind of change that has to be looked at rather than
          reasoned about. */}
      <div className="mt-3.5 grid items-start gap-3.5 [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <NeedsAttention posts={posts} now={now} />
          <EventsPanel
            events={events}
            calendars={calendars}
            now={now}
            failed={eventsFailed}
            onRetry={refetchEvents}
            onCreate={handleCreateFromParsed}
            onOpenManual={() => {
              setEditingEvent(null)
              setEventDialogOpen(true)
            }}
            onOpenEvent={(event) => {
              setEditingEvent(event)
              setEventDialogOpen(true)
            }}
            focusRef={aiInputRef}
          />
        </div>
        <ReadyReel
          items={reelItems}
          now={now}
          loading={reelLoading}
          failed={reelFailed}
          onRetry={refetchReel}
          // Clicking a face opens the ordinary new-post dialog with the export
          // already attached. Deliberately not a second write path: PostDialog
          // owns post creation, media_dropbox_path is the column the publish
          // worker reads, and the reel only prefills the form.
          onPick={(item) => {
            setReelPick(item)
            setPostDialogOpen(true)
          }}
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
        // An export sitting in Ready to Post is shot and cut, so it starts at
        // the last stage before scheduling rather than at "idea". That is also
        // what makes the next step one field: PostDialog auto-advances any of
        // the pre-scheduled stages to `scheduled` the moment a date is set
        // (STAGES_BEFORE_SCHEDULED), so filling in the time is the whole job.
        defaultStage={reelPick ? 'editing' : 'idea'}
        defaultDropboxPath={reelPick?.path ?? null}
        defaultTitle={reelPick ? titleFromFilename(reelPick.name) : ''}
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
        // Reachable now that rows open for editing — before this the dialog only
        // ever opened on a new event, so `event` was null and Delete never
        // rendered. Not caught on purpose: EventDialog awaits this and shows the
        // message, so a failed delete leaves the dialog open rather than closing
        // over something that did not happen. Same contract as CalendarView.
        onDelete={async (id) => {
          await deleteEvent(createClient(), id)
          setEventDialogOpen(false)
          refetchEvents()
        }}
        event={editingEvent}
        // A date only seeds a NEW event; passing one while editing would fight
        // the row's own start time.
        defaultDate={editingEvent ? null : now}
        calendars={calendars}
      />
    </div>
  )
}
