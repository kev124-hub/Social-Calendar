'use client'

import { FileText, Lightbulb, CalendarPlus } from 'lucide-react'
import { INK, RADIUS } from '@/lib/glass'
import { MONO } from './glass-home'

export interface QuickActionsProps {
  onNewPost: () => void
  onCaptureIdea: () => void
  /**
   * "Paste an event" is not a fourth dialog — it puts the cursor in the events
   * block's AI input, which is where events are actually created. A dialog here
   * would duplicate a surface that already exists further down the page.
   */
  onPasteEvent: () => void
}

const TILES = [
  { key: 'post', label: 'New post', icon: FileText },
  { key: 'idea', label: 'Capture idea', icon: Lightbulb },
  { key: 'event', label: 'Paste an event', icon: CalendarPlus },
] as const

export function QuickActions({ onNewPost, onCaptureIdea, onPasteEvent }: QuickActionsProps) {
  const handlers: Record<(typeof TILES)[number]['key'], () => void> = {
    post: onNewPost,
    idea: onCaptureIdea,
    event: onPasteEvent,
  }

  return (
    <div className="flex flex-wrap gap-2">
      {TILES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={handlers[key]}
          // Hover lift as a class, never an inline style — an inline value beats
          // a Tailwind `hover:` variant outright. Tailwind v4 also compiles this
          // to the CSS `translate` property, not `transform`, which is worth
          // knowing before auditing it.
          className="inline-flex items-center gap-1.5 border border-[color:var(--glass-hairline)] bg-white/60 px-3 py-1.5 text-[11px] font-semibold text-[#1b141f] transition-transform hover:-translate-y-[2px] hover:bg-white/80"
          style={{ ...MONO, borderRadius: RADIUS.chipPill, letterSpacing: '.04em' }}
        >
          <Icon size={13} strokeWidth={2} style={{ color: INK.tertiary }} />
          {label}
        </button>
      ))}
    </div>
  )
}
