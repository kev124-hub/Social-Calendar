// Pure helpers behind the ReadyReel display (Stage 5) — the revolving 3D view of
// the Dropbox "Ready to Post" folder on /home.
//
// Deliberately free of React and of the `@/` alias: tests/ready-reel.test.mjs
// loads this file directly under `node --experimental-strip-types`, which
// resolves neither JSX nor the tsconfig path alias.

/** One export sitting in the Ready-to-Post folder, as the reel renders it. */
export interface ReelItem {
  name: string
  /** path_lower — the value PostDialog stores in social_posts.media_dropbox_path. */
  path: string
  size: number
  /** ISO string, or null when Dropbox did not report one. */
  modified: string | null
  /**
   * Dropbox temporary download link (~4h). The face plays its first frame from
   * this. Null/absent when the link could not be minted, or when the item sits
   * past the last visible face and never needed one.
   */
  link?: string | null
}

export type ReelMode = 'empty' | 'single' | 'fan' | 'cylinder'

/**
 * Faces the cylinder will draw at most; the rest become a "+n more" count.
 *
 * This is one half of the fix for the reference implementation's hardcoded
 * `RADIUS = 104`. A regular n-gon of side FACE_W needs an apothem of
 * `(FACE_W/2)/tan(π/n)`, which passes 104 at n≈9 — beyond that the faces
 * interpenetrate and the cylinder renders as a knot. Capping the face count
 * also keeps the widget a fixed size no matter how full the folder gets, which
 * matters because it shares a grid row with two panels that size to content.
 */
export const MAX_FACES = 8

export const FACE_W = 84
export const FACE_H = 132

/**
 * Breathing room between neighbouring faces, in px. Folded into the radius
 * calculation as extra side length so the faces never quite touch.
 */
const FACE_GAP = 8

/**
 * The radius the reference implementation was drawn at. Kept as a floor: below
 * ~8 faces the exact apothem is *smaller* than this (46px at n=4), which would
 * pull the ring into a tight box and lose the carousel read. A radius larger
 * than the apothem never causes interpenetration — only a smaller one does — so
 * clamping upward is safe in a way clamping downward would not be.
 */
const BASE_RADIUS = 104

export function reelMode(count: number): ReelMode {
  if (count <= 0) return 'empty'
  if (count === 1) return 'single'
  if (count <= 3) return 'fan'
  return 'cylinder'
}

/** How many faces actually get drawn for a folder of `count` files. */
export function visibleFaceCount(count: number): number {
  return Math.max(0, Math.min(count, MAX_FACES))
}

/**
 * Distance from the cylinder's axis to each face, in px.
 *
 * `(side/2)/tan(π/n)` is the apothem of a regular n-gon — the exact radius at
 * which n faces of that width tile a closed cylinder edge to edge. Fewer than
 * three faces have no cylinder to speak of; the caller is in `fan` or `single`
 * mode there, and the value is unused.
 */
export function cylinderRadius(faces: number): number {
  if (faces < 3) return BASE_RADIUS
  return Math.max(BASE_RADIUS, (FACE_W + FACE_GAP) / 2 / Math.tan(Math.PI / faces))
}

/** Degrees between neighbouring faces. */
export function faceAngle(faces: number): number {
  return 360 / Math.max(faces, 1)
}

/**
 * Extensions the face renders as a <video> first frame. Everything else the
 * folder filter admits (jpg/png/heic — see MEDIA_EXT in lib/dropbox.ts) is a
 * still and renders as an <img>; feeding a JPEG to a <video> paints nothing at
 * all, which would read as a broken thumbnail rather than a photo.
 */
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i

export function isVideoName(name: string): boolean {
  return VIDEO_EXT.test(name)
}

/** "Need a minute.mp4" → "Need a minute" — the title a picked export seeds. */
export function titleFromFilename(name: string): string {
  return name.replace(/\.[^./\\]+$/, '') || name
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/**
 * How long something modified at `iso` has been waiting, as a short phrase.
 *
 * `now` is injected rather than read from the clock so the caller can pass
 * /home's single `now` reading — HomeView takes the clock once, after mount, so
 * the server's markup and the browser's cannot disagree during hydration.
 * Returns null for a missing, unparseable or future timestamp: "-2 days" is
 * worse than saying nothing.
 */
export function waitingFor(iso: string | null | undefined, now: number): string | null {
  if (!iso) return null
  const ms = now - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  const days = Math.floor(ms / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}

/** The wait of the oldest export in the folder — the number worth reporting. */
export function oldestWaiting(items: ReelItem[], now: number): string | null {
  const oldest = items
    .map((i) => i.modified)
    .filter((m): m is string => Boolean(m))
    .sort()[0]
  return waitingFor(oldest, now)
}

/**
 * The mono strap line above the reel: what is waiting, how much, how long.
 * Reports the true file count even when only MAX_FACES of them are drawn.
 */
export function reelSummary(items: ReelItem[], now: number): string {
  if (items.length === 0) return 'READY TO POST · EMPTY'
  const waiting = oldestWaiting(items, now)
  const plural = items.length === 1 ? '' : 'S'
  return (
    `READY TO POST · ${items.length} EXPORT${plural}` +
    (waiting ? ` · OLDEST ${waiting.toUpperCase()}` : '')
  )
}
