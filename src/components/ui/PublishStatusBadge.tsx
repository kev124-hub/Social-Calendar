'use client'

import type { SocialPost } from '@/types/database'
import { cn } from '@/lib/utils'

// Publish state as shown to Kevin. Deliberately coarser than the DB columns:
// the worker's internal bookkeeping (attempts, container ids, leases) is noise
// here — what matters on a card is "is this going out, is it out, did it break".

export type PublishState = 'queued' | 'processing' | 'published' | 'failed'

type PublishFields = Pick<
  SocialPost,
  'platform' | 'stage' | 'publish_mode' | 'publish_status' | 'ig_media_id'
>

/**
 * Derive the badge state, or null when publishing simply doesn't apply to this
 * post (the common case — a notify-mode idea has nothing to report).
 */
export function derivePublishState(post: PublishFields): PublishState | null {
  // An ig_media_id is the only unambiguous proof the post is live, so it
  // outranks publish_status: the worker writes the id first and can fail to
  // update the status afterwards (see publisher.ts publishFinished). Trusting
  // the status alone could show "failed" for a post that is actually on
  // Instagram — the one wrong answer that might make someone publish twice.
  if (post.ig_media_id) return 'published'

  switch (post.publish_status) {
    case 'published': return 'published'
    case 'failed': return 'failed'
    case 'processing': return 'processing'
    case 'pending': return 'queued'
  }

  // No status written yet. The worker treats a NULL status as pending, so an
  // auto post sitting in 'scheduled' really is queued — mirror the selection
  // rule in publisher.ts selectCandidates rather than showing nothing. A post
  // hand-moved to 'published' without the worker has no id and no status, and
  // correctly gets no badge: we didn't publish it.
  if (post.platform === 'instagram' && post.publish_mode === 'auto' && post.stage === 'scheduled') {
    return 'queued'
  }
  return null
}

const STATE_CONFIG: Record<PublishState, { label: string; className: string; title: string }> = {
  queued: {
    label: 'Queued',
    className: 'bg-[#f5f2f0] text-[#7b7b7b] border-[#d6d6d6]',
    title: 'Waiting for its scheduled time — the publisher will pick it up automatically.',
  },
  processing: {
    label: 'Publishing',
    className: 'bg-[#f0faff] text-[#0369a1] border-[#c0eaff]',
    title: 'Instagram is ingesting the video. This finishes on its own, usually within minutes.',
  },
  published: {
    label: 'Published',
    className: 'bg-[#fdf4ff] text-[#8b3fb0] border-[#e8c0ff]',
    title: 'Live on Instagram.',
  },
  failed: {
    label: 'Failed',
    className: 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]',
    title: 'This post did not go out. Open it to see why.',
  },
}

export function PublishStatusBadge({
  post,
  size = 'sm',
  className,
}: {
  post: PublishFields
  size?: 'xs' | 'sm'
  className?: string
}) {
  const state = derivePublishState(post)
  if (!state) return null

  const { label, className: stateClass, title } = STATE_CONFIG[state]

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center rounded-[10px] border font-medium whitespace-nowrap',
        size === 'xs' ? 'text-[9px] px-1 py-px' : 'text-[10px] px-1.5 py-0.5',
        stateClass,
        className
      )}
    >
      {label}
    </span>
  )
}
