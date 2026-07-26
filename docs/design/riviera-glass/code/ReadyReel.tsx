'use client'

// src/components/calendar/ReadyReel.tsx — v2 (replaces v1 from the first handoff).
//
// DELTA vs v1: the sparse state is now the PRIMARY design, not a fallback.
// The real Dropbox "Ready to Post" folder usually holds 1–3 files. v1 cloned
// items to keep a 6-face cylinder solid — that faked queue depth. Gone.
//
//   1 item   → single hero card, front-facing, slow idle float. No rotation.
//   2–3      → a fanned arc. Static; hover brings one card forward.
//   4+       → the cylinder, with EXACTLY n faces (360/n apart), 22s spin.
//   0        → a stated empty state. Low/zero queue is signal, not failure.
//
// Real thumbnails are expected (thumbUrl). The striped placeholder only shows
// while a thumb is missing or still loading.
//
// Tokens come from src/lib/glass.ts — no new colours introduced here.

import { useMemo, useState } from 'react'
import { GLASS, INK, MOTION } from '@/lib/glass'

export interface ReelItem {
  name: string
  thumbUrl?: string | null
  /** ISO string — used for the "oldest waiting" line. Optional. */
  modifiedAt?: string | null
  /** Pre-formatted, e.g. "0:42" or "184 MB". Optional. */
  meta?: string | null
}

const FACE_W = 84
const FACE_H = 132
const RADIUS = 104

const panelStyle = {
  background: 'linear-gradient(160deg, rgba(214,164,240,.60), rgba(104,180,220,.55))',
  border: `1px solid ${GLASS.hairline}`,
  borderRadius: 17,
} as const

const faceStyle = (thumbUrl?: string | null) => ({
  borderRadius: 10,
  overflow: 'hidden' as const,
  border: '1px solid rgba(21,15,25,.40)',
  boxShadow: '0 10px 20px rgba(18,52,72,.30)',
  backgroundColor: '#3f7fa8',
  backgroundImage: thumbUrl
    ? `url(${thumbUrl})`
    : 'repeating-linear-gradient(135deg,#3f7fa8 0 6px,#e5edf3 6px 12px)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
})

function daysAgo(iso?: string | null): string | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  const d = Math.floor(ms / 86_400_000)
  if (d === 0) return 'today'
  if (d === 1) return '1 day'
  return `${d} days`
}

function Caption({ items }: { items: ReelItem[] }) {
  const oldest = items
    .map((i) => i.modifiedAt)
    .filter(Boolean)
    .sort()[0]
  const waiting = daysAgo(oldest)
  return (
    <p className="m-0 tracking-[.14em]" style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10, color: '#3d3743' }}>
      {items.length === 0
        ? 'READY TO POST · EMPTY'
        : `READY TO POST · ${items.length} EXPORT${items.length === 1 ? '' : 'S'}${waiting ? ` · OLDEST ${waiting.toUpperCase()}` : ''}`}
    </p>
  )
}

export function ReadyReel({
  items,
  onPick,
  onOpenFolder,
  className = '',
}: {
  items: ReelItem[]
  onPick?: (item: ReelItem) => void
  /** Deep link to the Dropbox folder. Shown in the empty state. */
  onOpenFolder?: () => void
  className?: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const mode = items.length === 0 ? 'empty' : items.length === 1 ? 'single' : items.length <= 3 ? 'fan' : 'cylinder'
  const angle = useMemo(() => 360 / Math.max(items.length, 1), [items.length])

  return (
    <div className={`flex flex-col gap-3 p-[13px] ${className}`} style={panelStyle}>
      <Caption items={items} />

      {/* ── 0 items: stated, not apologised for ───────────────────────── */}
      {mode === 'empty' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <span
            className="flex h-[52px] w-[36px] items-center justify-center"
            style={{ ...faceStyle(null), opacity: 0.5, boxShadow: 'none' }}
          />
          <p className="m-0 text-[12.5px] font-semibold" style={{ color: INK.primary }}>Queue is clear</p>
          <p className="m-0 max-w-[210px] text-[11.5px] leading-[1.45]" style={{ color: '#2b2530', textWrap: 'pretty' }}>
            Nothing waiting in Ready&nbsp;to&nbsp;Post. Export something and it lands here.
          </p>
          {onOpenFolder && (
            <button
              type="button"
              onClick={onOpenFolder}
              className="mt-1 rounded-full px-3 py-[5px] text-[11px] font-semibold"
              style={{ background: 'rgba(255,255,255,.80)', color: INK.primary, border: `1px solid ${GLASS.hairline}` }}
            >
              Open Dropbox folder
            </button>
          )}
        </div>
      )}

      {/* ── 1 item: hero card, front-facing, idle float ───────────────── */}
      {mode === 'single' && (
        <button
          type="button"
          onClick={() => onPick?.(items[0])}
          title={items[0].name}
          className="flex flex-1 items-center gap-3 p-0 text-left"
        >
          <span
            className="block shrink-0"
            style={{
              ...faceStyle(items[0].thumbUrl),
              width: 108,
              height: 168,
              animation: 'glass-float 6s ease-in-out infinite',
              transform: 'rotateY(-8deg)',
            }}
          />
          <span className="flex min-w-0 flex-col gap-[6px]">
            <span className="text-[13px] font-semibold leading-[1.3]" style={{ color: INK.primary, overflowWrap: 'anywhere' }}>
              {items[0].name}
            </span>
            {items[0].meta && (
              <span style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10.5, color: '#2b2530' }}>{items[0].meta}</span>
            )}
            <span className="text-[11.5px] leading-[1.45]" style={{ color: '#2b2530', textWrap: 'pretty' }}>
              One export ready. Drop it on a day to schedule it.
            </span>
          </span>
        </button>
      )}

      {/* ── 2–3 items: static fan, hover pulls one forward ────────────── */}
      {mode === 'fan' && (
        <div className="flex flex-1 items-center justify-center" style={{ perspective: 900 }}>
          <div className="flex items-center" style={{ transformStyle: 'preserve-3d' }}>
            {items.map((item, i) => {
              const offset = i - (items.length - 1) / 2
              const active = hovered === i
              return (
                <button
                  key={item.name + i}
                  type="button"
                  onClick={() => onPick?.(item)}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  title={item.name}
                  style={{
                    ...faceStyle(item.thumbUrl),
                    width: FACE_W,
                    height: FACE_H,
                    marginLeft: i === 0 ? 0 : -18,
                    transform: active
                      ? `translateY(-8px) rotateY(0deg) translateZ(40px) scale(1.05)`
                      : `rotateY(${offset * -16}deg) translateZ(${active ? 40 : 0}px)`,
                    transition: MOTION.cardHover,
                    zIndex: active ? 10 : items.length - i,
                  }}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* ── 4+ items: the cylinder, n faces, no cloning ───────────────── */}
      {mode === 'cylinder' && (
        <div
          className="flex flex-1 items-center justify-center"
          style={{ minHeight: 168, perspective: 620 }}
          onMouseEnter={() => setHovered(-1)}
          onMouseLeave={() => setHovered(null)}
        >
          <div
            style={{
              position: 'relative',
              width: FACE_W,
              height: FACE_H,
              transformStyle: 'preserve-3d',
              animation: 'glass-reel-spin 22s linear infinite',
              animationPlayState: hovered === -1 ? 'paused' : 'running',
            }}
          >
            {items.map((item, i) => (
              <button
                key={item.name + i}
                type="button"
                onClick={() => onPick?.(item)}
                title={item.name}
                style={{
                  ...faceStyle(item.thumbUrl),
                  position: 'absolute',
                  inset: 0,
                  padding: 0,
                  transform: `rotateY(${i * angle}deg) translateZ(${RADIUS}px)`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {items.length > 1 && (
        <p className="m-0 text-[11.5px] leading-[1.45]" style={{ color: '#2b2530', textWrap: 'pretty' }}>
          Click one to open it in a new post, or drag it onto a day.
        </p>
      )}
    </div>
  )
}

/* Add to globals.additions.css:

@keyframes glass-float {
  0%, 100% { transform: rotateY(-8deg) translateY(0); }
  50%      { transform: rotateY(-8deg) translateY(-7px); }
}
*/
