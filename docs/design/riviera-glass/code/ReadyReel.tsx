'use client'

// src/components/calendar/ReadyReel.tsx
//
// 3D cylinder of the exports sitting in Dropbox "Ready to Post".
// Six faces on a preserve-3d cylinder, one slow revolution every 22s.
// Pure CSS transforms — no canvas, no three.js, no dependency.
//
// Data: pass the listing you already fetch for the post dialog's Dropbox
// picker (see src/lib/dropbox.ts). Each item needs a name; thumbUrl optional.
// With fewer than 6 items the faces repeat so the cylinder stays solid.

import { useMemo, useState } from 'react'

export interface ReelItem {
  name: string
  thumbUrl?: string | null
}

const FACES = 6
const ANGLE = 360 / FACES     // 60deg
const RADIUS = 96             // translateZ — matches the mock exactly
const FACE_W = 76
const FACE_H = 118

export function ReadyReel({
  items,
  label = 'READY REEL',
  onPick,
  className = '',
}: {
  items: ReelItem[]
  label?: string
  onPick?: (item: ReelItem) => void
  className?: string
}) {
  const [paused, setPaused] = useState(false)

  // Always render exactly 6 faces; cycle the source list if it's shorter.
  const faces = useMemo(() => {
    if (items.length === 0) return []
    return Array.from({ length: FACES }, (_, i) => items[i % items.length])
  }, [items])

  return (
    <div
      className={`flex flex-col gap-[11px] rounded-[17px] border p-[13px] ${className}`}
      style={{
        background: 'linear-gradient(160deg, rgba(214,164,240,.60), rgba(104,180,220,.55))',
        borderColor: 'rgba(255,255,255,.90)',
      }}
    >
      <p
        className="m-0 tracking-[.14em]"
        style={{ fontFamily: 'var(--font-mono-num)', fontSize: 10, color: '#3d3743' }}
      >
        {label}
        {items.length > 0 && ` · ${items.length} EXPORT${items.length === 1 ? '' : 'S'}`}
      </p>

      {faces.length === 0 ? (
        <div className="flex h-[150px] items-center justify-center">
          <p className="m-0 text-center text-[12px] leading-relaxed" style={{ color: '#3d3743' }}>
            Nothing in Ready&nbsp;to&nbsp;Post yet.
          </p>
        </div>
      ) : (
        <div
          className="flex items-center justify-center"
          style={{ height: 150, perspective: 620 }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div
            style={{
              position: 'relative',
              width: FACE_W,
              height: FACE_H,
              transformStyle: 'preserve-3d',
              animation: 'glass-reel-spin 22s linear infinite',
              animationPlayState: paused ? 'paused' : 'running',
            }}
          >
            {faces.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPick?.(item)}
                title={item.name}
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: 0,
                  borderRadius: 10,
                  overflow: 'hidden',
                  cursor: onPick ? 'pointer' : 'default',
                  transform: `rotateY(${i * ANGLE}deg) translateZ(${RADIUS}px)`,
                  border: '1px solid rgba(21,15,25,.40)',
                  boxShadow: '0 10px 20px rgba(18,52,72,.30)',
                  backgroundColor: '#3f7fa8',
                  backgroundImage: item.thumbUrl
                    ? `url(${item.thumbUrl})`
                    : 'repeating-linear-gradient(135deg,#3f7fa8 0 6px,#e5edf3 6px 12px)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            ))}
          </div>
        </div>
      )}

      <p className="m-0 text-[12px] leading-[1.45]" style={{ color: '#2b2530', textWrap: 'pretty' }}>
        Drag one onto a day, or drop it into the next open slot.
      </p>
    </div>
  )
}
