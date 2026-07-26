'use client'

import Link from 'next/link'
import { differenceInMinutes, format, parseISO } from 'date-fns'
import type { SocialPost } from '@/types/database'
import { INK, RADIUS, platformStyle } from '@/lib/glass'
import { MONO, PANEL } from './glass-home'

const EYEBROW_INK = '#0b3a50'

const POST_TYPE_LABELS: Record<string, string> = {
  reel: 'Reel', carousel: 'Carousel', story: 'Story',
  static: 'Static', video: 'Video', article: 'Article',
}

/**
 * Coarse by design: "in 3h 41m" is a glance, not a stopwatch. The caller
 * re-renders on a 60s interval, so seconds would only ever be stale.
 */
function countdown(from: Date, to: Date) {
  const mins = Math.max(0, differenceInMinutes(to, from))
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const rest = mins % 60
  if (days > 0) return `in ${days}d ${hours}h`
  if (hours > 0) return `in ${hours}h ${rest}m`
  return mins > 0 ? `in ${rest}m` : 'due now'
}

function Pill({ children, filled }: { children: React.ReactNode; filled?: boolean }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold"
      style={{
        borderRadius: RADIUS.chipPill,
        background: filled ? '#141014' : 'rgba(255,255,255,.72)',
        color: filled ? '#f7f3ef' : INK.strong,
      }}
    >
      {children}
    </span>
  )
}

/**
 * The panel is never removed when there is nothing scheduled. An absent panel
 * reads as "this feature is broken"; a stated empty state reads as "nothing to
 * do", which is the truth and is also good news.
 */
function EmptyHero() {
  return (
    <section style={PANEL} className="flex items-center gap-4 p-4">
      <div
        className="glass-thumb-placeholder shrink-0"
        style={{ width: 132, height: 132, borderRadius: RADIUS.card }}
      />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: INK.primary }}>
          Nothing scheduled yet
        </p>
        <p className="mt-1 text-[12.5px]" style={{ color: INK.tertiary }}>
          Posts with a date land here, soonest first.
        </p>
        <Link
          href="/calendar"
          className="mt-3 inline-flex items-center px-3 py-1.5 text-[11px] font-semibold transition-transform hover:-translate-y-[2px]"
          style={{
            borderRadius: RADIUS.chipPill,
            background: 'rgba(255,255,255,.72)',
            color: INK.strong,
          }}
        >
          Open calendar
        </Link>
      </div>
    </section>
  )
}

export function NextPublishHero({ post, now }: { post: SocialPost | null; now: Date }) {
  if (!post || !post.scheduled_at) return <EmptyHero />

  const when = parseISO(post.scheduled_at)
  const pf = platformStyle(post.platform)

  // The eyebrow states who acts next, because that is the only thing the two
  // publish modes differ on. `auto` means the worker will post it unattended,
  // so the label is a promise the app is keeping and the dot pulses to say
  // "running". `notify` means Kevin posts it himself — a pulse there would
  // claim an automation that does not exist for this post.
  const auto = post.publish_mode === 'auto'

  return (
    <section style={PANEL} className="flex gap-4 p-4">
      {post.media_url ? (
        // Supabase/Dropbox media URLs are arbitrary remote hosts; next/image
        // would need every one allowlisted in next.config, and this is a
        // single 132px thumb. Same call as PipelineBoard's card media.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.media_url}
          alt=""
          className="shrink-0 object-cover"
          style={{ width: 132, height: 132, borderRadius: RADIUS.card }}
        />
      ) : (
        <div
          className="glass-thumb-placeholder shrink-0 flex items-end p-2"
          style={{ width: 132, height: 132, borderRadius: RADIUS.card }}
        >
          <span className="text-[9px] uppercase" style={{ ...MONO, color: INK.tertiary, letterSpacing: '.12em' }}>
            {post.post_type ? POST_TYPE_LABELS[post.post_type] ?? post.post_type : 'No media'}
          </span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-[7px] w-[7px] rounded-full"
            style={{
              background: EYEBROW_INK,
              // Pulse only when something really is running unattended.
              animation: auto ? 'glass-pulse 2s infinite' : undefined,
            }}
          />
          <span className="text-[10px] uppercase" style={{ ...MONO, color: EYEBROW_INK, letterSpacing: '.14em' }}>
            {auto ? 'Next publish' : 'Next post'} · {countdown(now, when)}
          </span>
        </div>

        {/* line-clamp rather than `truncate`: at 390px a 30px Playfair single
            line fits about nine characters, so "Monaco at golden hour" became
            "Monaco a…". Two lines on phones, one on desktop where the row is
            wide enough. line-clamp also avoids white-space:nowrap, whose
            min-content is the whole untruncated string — see the grid comment
            in HomeView. */}
        <h2
          className="mt-1.5 line-clamp-2 font-heading text-[22px] leading-tight sm:line-clamp-1 sm:text-[30px]"
          style={{ color: INK.primary }}
        >
          {post.title || 'Untitled'}
        </h2>

        {post.caption && (
          <p
            className="mt-1 text-[13.5px] leading-snug"
            style={{ color: INK.secondary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {post.caption}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Pill>{format(when, 'EEE h:mm a')}</Pill>
          <span
            className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold"
            style={{ borderRadius: RADIUS.chipPill, background: pf.chip, color: pf.ink }}
          >
            {pf.label}
          </span>
          <Pill filled={auto}>{auto ? 'Auto-publish' : 'Notify me'}</Pill>
        </div>

        {/* Most notify-mode posts have no Dropbox path. An "—" or an empty
            label would be noise, so the line is absent rather than blank. */}
        {post.media_dropbox_path && (
          <p className="mt-2 truncate text-[9.5px]" style={{ ...MONO, color: INK.tertiary }}>
            {post.media_dropbox_path}
          </p>
        )}
      </div>
    </section>
  )
}
