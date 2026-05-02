'use client'

import { useRouter } from 'next/navigation'
import type { Idea } from '@/types/database'

export function IdeaCard({ idea }: { idea: Idea }) {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push(`/ideas?idea=${idea.id}`)}
      className="w-full text-left rounded-md bg-white border border-amber-100 shadow-sm hover:shadow transition-shadow px-2.5 py-2 space-y-0.5"
    >
      <div className="flex items-start gap-1.5 min-w-0">
        <span className="text-[11px] shrink-0 mt-px">💡</span>
        <span className="text-[12px] font-medium text-gray-800 leading-snug line-clamp-2">
          {idea.title}
        </span>
      </div>
      {idea.platform && (
        <p className="text-[10px] text-amber-500 capitalize pl-4">{idea.platform}</p>
      )}
    </button>
  )
}
