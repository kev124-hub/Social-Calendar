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

export type ReelMode = 'empty' | 'single' | 'cylinder'

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

/**
 * Faces are 9:16 — the shape of the thing they show.
 *
 * The reference drew them at 84×132, which is 2:3 and squarer than any reel.
 * `object-fit: cover` then cropped the top and bottom off every frame, which is
 * the worst place to lose a vertical video: that is where the hook text sits.
 */
const FACE_ASPECT = 16 / 9

/**
 * Breathing room between neighbouring faces, in px. Folded into the radius
 * calculation as extra side length so the faces never quite touch.
 */
const FACE_GAP = 8

/**
 * How big each face is drawn, given how many there are.
 *
 * Fewer files get bigger cards. The ring's width is roughly `2·radius + faceW`,
 * so a small count at a fixed face size left the card adrift in a well twice
 * its width — which is what a three-file reel looked like on 28 July. Growing
 * the face fills that space instead of padding it, and at Kevin's usual volume
 * it also means the thumbnails are large enough to tell apart.
 */
export function faceSize(count: number): { w: number; h: number } {
  const w = count <= 3 ? 100 : count <= 5 ? 88 : 78
  return { w, h: Math.round(w * FACE_ASPECT) }
}

/** The hero card at one file. Bigger again, because it is the only thing there. */
export const HERO_FACE = { w: 108, h: Math.round(108 * FACE_ASPECT) }

/**
 * Floor under the computed radius, as a fraction of the face width.
 *
 * The exact apothem collapses at low face counts — 27% of a face width at
 * three, zero at two — which would stack the faces almost on top of one another
 * and turn the spin into a flicker. A radius *larger* than the apothem never
 * causes interpenetration; only a smaller one does. So clamping upward is safe
 * in a way clamping downward would not be, and this is the value the small
 * counts Kevin actually has end up using.
 *
 * Expressed against the face rather than as a flat pixel count because that is
 * the thing it means: a little under one face width of clearance. The reference
 * implementation's fixed 104px is roughly this at eight faces and far too wide
 * at three, where it flung them out to a 208px ring with 144px of empty air in
 * between.
 */
const MIN_RADIUS_RATIO = 0.8

/**
 * Which arrangement a folder of `count` files renders as.
 *
 * The reference v2 gave 2–3 files a static fan and only spun at 4+. Kevin saw
 * that at three files on 28 July and it read as broken — a revolving display
 * that does not revolve. The fan is gone: two files up is a cylinder, because
 * that is the volume this feature actually runs at.
 *
 * One file stays the floating hero card. A single face on a cylinder spends
 * half of every revolution showing its own blank back, which looks like a
 * missing thumbnail rather than like motion.
 */
export function reelMode(count: number): ReelMode {
  if (count <= 0) return 'empty'
  if (count === 1) return 'single'
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
 * which n faces of that width tile a closed cylinder edge to edge. Two faces
 * have no polygon to take an apothem of (the tangent runs to infinity and the
 * expression collapses to zero), so they fall through to the floor, which is
 * the right answer anyway: two cards on opposite sides of a short axis.
 */
export function cylinderRadius(faces: number, faceW: number): number {
  const floor = faceW * MIN_RADIUS_RATIO
  if (faces < 3) return floor
  return Math.max(floor, (faceW + FACE_GAP) / 2 / Math.tan(Math.PI / faces))
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
 * The mono strap line under the panel heading: how much is waiting, how long.
 *
 * Deliberately does NOT repeat "READY TO POST" — the reference implementation
 * had no heading above it and led with those words, which under the panel's own
 * "Ready to post" title read as a stutter. It went out that way on 28 July and
 * is visible in Kevin's screenshot.
 *
 * Reports the true file count even when only MAX_FACES of them are drawn.
 */
export function reelSummary(items: ReelItem[], now: number): string {
  if (items.length === 0) return 'EMPTY'
  const waiting = oldestWaiting(items, now)
  const plural = items.length === 1 ? '' : 'S'
  return `${items.length} EXPORT${plural}` + (waiting ? ` · OLDEST ${waiting.toUpperCase()}` : '')
}
