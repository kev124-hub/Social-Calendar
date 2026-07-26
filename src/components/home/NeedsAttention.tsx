'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import type { SocialPost } from '@/types/database'
import { derivePublishState } from '@/components/ui/PublishStatusBadge'
import { INK, RADIUS } from '@/lib/glass'
import { MONO, PANEL } from './glass-home'

const FAILED_INK = '#8a2b12'
const OVERDUE_INK = '#8a4b06'
const MAX_ROWS = 5

type Row = { post: SocialPost; kind: 'failed' | 'overdue' }

function AttentionRow({ post, kind }: Row) {
  const accent = kind === 'failed' ? FAILED_INK : OVERDUE_INK
  return (
    <Link
      href={`/pipeline?post=${post.id}`}
      className="flex items-start gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors hover:bg-white/55"
    >
      <span className="mt-[3px] block h-[26px] w-[3px] shrink-0 rounded-full" style={{ background: accent }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold" style={{ color: INK.primary }}>
          {post.title || 'Untitled'}
        </span>
        <span className="block truncate text-[11.5px]" style={{ color: kind === 'failed' ? accent : INK.tertiary }}>
          {kind === 'failed'
            ? post.publish_error || 'Publish failed'
            : 'Scheduled time has passed'}
        </span>
      </span>
      {post.scheduled_at && (
        <span className="shrink-0 text-[10px]" style={{ ...MONO, color: INK.tertiary }}>
          {format(parseISO(post.scheduled_at), 'd MMM h:mm a')}
        </span>
      )}
    </Link>
  )
}

export function NeedsAttention({ posts, now }: { posts: SocialPost[]; now: Date }) {
  // Failures are listed however old they are. A publish that broke three days
  // ago still needs fixing, and a 24h window would quietly drop it off the one
  // surface that reports problems at all.
  const failed: Row[] = posts
    .filter((p) => derivePublishState(p) === 'failed')
    .map((post) => ({ post, kind: 'failed' as const }))

  const failedIds = new Set(failed.map((r) => r.post.id))

  const overdue: Row[] = posts
    .filter(
      (p) =>
        !failedIds.has(p.id) &&
        p.scheduled_at &&
        parseISO(p.scheduled_at) < now &&
        p.stage !== 'published'
    )
    .map((post) => ({ post, kind: 'overdue' as const }))

  const rows = [...failed, ...overdue]
  const shown = rows.slice(0, MAX_ROWS)
  const extra = rows.length - shown.length

  return (
    <section style={PANEL} className="p-4">
      <h3 className="mb-2 text-[12px] font-semibold" style={{ color: INK.strong }}>
        Needs attention
      </h3>

      {/* The panel is never hidden when the list is empty. A missing panel is
          ambiguous — it could mean "all clear" or "this never loaded" — and
          the whole point of this block is to be the honest problem report. */}
      {rows.length === 0 ? (
        <p className="text-[12.5px] font-medium" style={{ color: INK.tertiary }}>
          All clear — nothing needs attention.
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {shown.map(({ post, kind }) => (
            <AttentionRow key={post.id} post={post} kind={kind} />
          ))}
          {extra > 0 && (
            // Colour as a class — an inline `color` would beat the hover.
            <Link
              href="/pipeline"
              className="mt-1 px-2 text-[9.5px] uppercase text-[#5d5660] transition-colors hover:text-[#0b3a50]"
              style={{ ...MONO, letterSpacing: '.12em', borderRadius: RADIUS.control }}
            >
              +{extra} more →
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
