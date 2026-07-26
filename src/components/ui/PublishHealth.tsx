'use client'

// src/components/ui/PublishHealth.tsx — new in this delta.
//
// Replaces the hardcoded "IG token 41d · queue 2" line in Sidebar.tsx.
// Publish health is a nice-to-have, so it must never assert something it
// doesn't know. Four states, and "unknown" is a first-class one:
//
//   live     token days known and >= 10, worker ran recently   → pulsing dot
//   warning  token days known and < 10                          → static amber
//   unknown  token expiry NOT inspectable (META_APP_ID/SECRET   → static grey,
//            missing) or the status endpoint failed                no pulse
//   error    publishing unconfigured, refresh failed, or a post  → static red
//            terminally failed
//
// Rules:
//  · Never render a number you didn't receive. `tokenDays === null` prints
//    "expiry unknown", not a placeholder.
//  · `queueDepth === null` omits the queue clause entirely (no "queue 0" —
//    that asserts an empty queue you haven't verified).
//  · The pulse animation runs ONLY in `live`. A pulsing dot means "the worker
//    is running"; pulsing while unknown would be a lie.
//
// NOT RENDERED YET. Sidebar's `health` prop is optional and nothing passes it,
// because no endpoint reports these values today. Wiring it means deriving the
// state server-side per the note at the bottom of this file — until then the
// block is absent rather than fabricated.
//
// Tokens from src/lib/glass.ts. No new colours.

import { GLASS, INK } from '@/lib/glass'

export type PublishHealthState = 'live' | 'warning' | 'unknown' | 'error'

export interface PublishHealthData {
  state: PublishHealthState
  /** Days until the IG token expires. null = not inspectable. */
  tokenDays: number | null
  /** Posts in pending/processing. null = not read. */
  queueDepth: number | null
  /** One short sentence for warning/error/unknown. Optional. */
  detail?: string | null
}

const DOT: Record<PublishHealthState, { color: string; pulse: boolean; label: string }> = {
  live:    { color: '#0b4f6c', pulse: true,  label: 'Worker live' },
  warning: { color: '#8a4b06', pulse: false, label: 'Needs attention' },
  unknown: { color: '#5d5660', pulse: false, label: 'Status unknown' },
  error:   { color: '#8a2b12', pulse: false, label: 'Publishing blocked' },
}

export function PublishHealth({ data, collapsed = false }: { data: PublishHealthData; collapsed?: boolean }) {
  const dot = DOT[data.state]

  // Collapsed sidebar: dot only, tooltip carries the detail.
  if (collapsed) {
    return (
      <div className="flex justify-center py-2" title={`${dot.label}${data.detail ? ` — ${data.detail}` : ''}`}>
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: dot.color, animation: dot.pulse ? 'glass-pulse 2.4s ease-in-out infinite' : undefined }}
        />
      </div>
    )
  }

  const parts: string[] = []
  parts.push(data.tokenDays === null ? 'IG token expiry unknown' : `IG token ${data.tokenDays}d`)
  if (data.queueDepth !== null) parts.push(`queue ${data.queueDepth}`)

  return (
    <div className="rounded-[15px] p-3" style={{ background: 'rgba(255,255,255,.62)', border: `1px solid ${GLASS.hairline}` }}>
      <p className="m-0 tracking-[.14em]" style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10, color: '#7a7280' }}>
        PUBLISH HEALTH
      </p>
      <div className="mt-[9px] flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: dot.color, animation: dot.pulse ? 'glass-pulse 2.4s ease-in-out infinite' : undefined }}
        />
        <span className="text-[13px] font-medium" style={{ color: INK.primary }}>{dot.label}</span>
      </div>
      <p className="m-0 mt-2 text-[12px] leading-[1.45]" style={{ color: INK.tertiary }}>
        {parts.join(' · ')}
      </p>
      {data.detail && (
        <p className="m-0 mt-1 text-[11.5px] leading-[1.45]" style={{ color: INK.tertiary, textWrap: 'pretty' }}>
          {data.detail}
        </p>
      )}
    </div>
  )
}

/* Suggested server shape — derive, don't guess:

   state:
     error   → INSTAGRAM_USER_ID or token missing, last refresh failed,
               or any post with publish_status = 'failed' in the last 24h
     warning → tokenDays !== null && tokenDays < 10
     unknown → META_APP_ID/META_APP_SECRET unset (expiry can't be inspected),
               or the status read threw
     live    → everything else

   tokenDays: from app_credentials, else null. Never fall back to a constant.
   queueDepth: count(social_posts where publish_status in ('pending','processing')),
               null if the query failed.
*/
