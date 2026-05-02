'use client'

import { format, parseISO } from 'date-fns'
import { PlatformIcon } from '@/components/ui/PlatformIcon'
import type { SocialPost } from '@/types/database'

const STAGE_LABELS: Record<string, string> = {
  idea: 'Idea',
  scripted: 'Scripted',
  shot: 'Shot',
  editing: 'Editing',
  scheduled: 'Scheduled',
  published: 'Published',
}

export function PostCard({ post, onClick }: { post: SocialPost; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md bg-white border border-gray-100 shadow-sm hover:shadow transition-shadow px-2.5 py-2 space-y-1.5"
    >
      {post.media_url && (
        <div className="relative h-14 rounded overflow-hidden bg-muted">
          <img src={post.media_url} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-medium text-gray-800 leading-snug flex-1 line-clamp-2">
          {post.title ?? `${post.platform} ${post.post_type ?? ''}`}
        </span>
        {post.scheduled_at && (
          <span className="text-[10px] text-gray-400 shrink-0 pt-px">
            {format(parseISO(post.scheduled_at), 'h:mm a')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <PlatformIcon platform={post.platform} size={11} />
        <span className="text-[10px] text-gray-400 capitalize">
          {STAGE_LABELS[post.stage] ?? post.stage}
        </span>
      </div>
    </button>
  )
}
