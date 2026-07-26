// Surface compositions shared by the /home blocks.
//
// These are arrangements of tokens that already live in glass.ts and
// globals.css, not new tokens — glass.ts stays the single source of truth for
// the values themselves. They sit here so the four blocks can't drift apart
// from one another.

import type { CSSProperties } from 'react'
import { RADIUS } from '@/lib/glass'

export const MONO = { fontFamily: 'var(--font-mono-num)' } as const

/**
 * The frosted panel each home block sits on.
 *
 * Backdrop blur belongs on panels only — never on the rows, tiles or chips
 * inside them. Stage 4 shipped `backdrop-filter` on all 42 month cells and it
 * was dropped again in #27: each blurred element is its own compositing
 * surface, and the cost is paid per element, not per screen.
 */
export const PANEL: CSSProperties = {
  background: 'var(--glass-panel)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  borderRadius: RADIUS.panel,
  border: '1px solid var(--glass-hairline)',
  boxShadow: 'var(--shadow-panel)',
}
