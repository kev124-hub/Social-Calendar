'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { INK, RADIUS, STAT } from '@/lib/glass'
import { MONO } from './glass-home'

type Tile = { key: keyof typeof STAT; label: string; value: number | null; href: string }

/**
 * Ramps 0 → target over 1100ms on a cubic ease-out.
 *
 * The `prefers-reduced-motion` block in globals.css neutralises CSS animations
 * and transitions, but it has no reach into a requestAnimationFrame loop —
 * this is a JS animation and the media query cannot see it. The guard below is
 * therefore the only thing that honours the setting here, and removing it
 * would leave reduced-motion users with the one moving element on the page.
 */
function useCountUp(target: number | null) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (target === null) return

    let frame = 0
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Jump straight to the value. Scheduled rather than set inline so this
      // is not a synchronous setState in the effect body.
      frame = requestAnimationFrame(() => setValue(target))
      return () => cancelAnimationFrame(frame)
    }

    let start: number | null = null
    const step = (ts: number) => {
      if (start === null) start = ts
      const t = Math.min(1, (ts - start) / 1100)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target])

  return value
}

function StatTile({ tile }: { tile: Tile }) {
  const shown = useCountUp(tile.value)
  const tint = STAT[tile.key]

  return (
    // A tile that lifts on hover promises it does something. It didn't, which
    // read as the page being dead to touch — so each one now goes to the
    // surface that lists what it counts.
    <Link
      href={tile.href}
      className="block p-3 transition-transform hover:-translate-y-1"
      style={{
        background: tint.tint,
        borderRadius: RADIUS.card,
        border: '1px solid var(--glass-hairline)',
      }}
    >
      {/* A failed read shows an em dash, never 0 — "nothing queued" and "we
          could not find out" are different facts and 0 asserts the first. */}
      <div className="text-[40px] leading-none" style={{ ...MONO, color: tint.ink }}>
        {tile.value === null ? '—' : shown}
      </div>
      <div className="mt-1.5 text-[12px] font-semibold" style={{ color: INK.strong }}>
        {tile.label}
      </div>
    </Link>
  )
}

export function StatTiles({ ready, behind, queued }: { ready: number; behind: number; queued: number | null }) {
  const tiles: Tile[] = [
    { key: 'ready',  label: 'Ready this week', value: ready,  href: '/calendar?view=week' },
    // Both land on the pipeline: it is the only surface that lists posts by
    // state, and neither "overdue" nor "queued" has a filter of its own yet.
    { key: 'behind', label: 'Behind',          value: behind, href: '/pipeline' },
    { key: 'queued', label: 'Queued',          value: queued, href: '/pipeline' },
  ]

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
      {tiles.map((tile) => (
        <StatTile key={tile.key} tile={tile} />
      ))}
    </div>
  )
}
