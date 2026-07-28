'use client'

import type { CSSProperties } from 'react'
import { GLASS, INK, MOTION, RADIUS } from '@/lib/glass'
import { MONO, PANEL } from './glass-home'
import {
  FACE_H,
  FACE_W,
  cylinderRadius,
  faceAngle,
  formatBytes,
  isVideoName,
  reelMode,
  reelSummary,
  visibleFaceCount,
  type ReelItem,
} from '@/lib/ready-reel'

// The revolving display of what is sitting in Dropbox ready to post — Phase C
// of the riviera-glass home plan. Ported from the v2 reference at
// docs/design/riviera-glass/code/ReadyReel.tsx with its three known defects
// fixed (see the notes below and in lib/ready-reel.ts).
//
// v2 is sparse-first on purpose: the real folder usually holds one to three
// files, and today it holds exactly one. `single` is the mode this ships into,
// not an edge case.
//
//   0   → a stated empty state. A clear queue is signal, not failure.
//   1   → one hero card, front-facing, slow idle float. No rotation.
//   2–3 → a static fan; hover brings one card forward.
//   4+  → the cylinder, MAX_FACES faces at 360/n apart, 22s spin.
//
// Deviations from the reference, both deliberate:
//
//   • The outer surface is the frosted PANEL every other /home block sits on,
//     not the reference's saturated purple/blue gradient. Beside NeedsAttention
//     and EventsPanel that gradient read as a different design system. The
//     gradient survives as the inner well the faces revolve against, which is
//     what gave the reel its identity in the first place.
//   • Hover lives in CSS (see `.glass-reel*` in globals.css) rather than in
//     React state. `mouseenter` fires on a tap with no matching `mouseleave`,
//     so a state-driven hover leaves the cylinder paused and a fan card stuck
//     forward after the first touch — the exact bug glass.ts's `canHover`
//     comment records from Stage 3. A `@media (hover: hover)` block cannot fire
//     on a finger at all, and needs no mount effect to know that.

const WELL: CSSProperties = {
  background: 'linear-gradient(160deg, rgba(214,164,240,.60), rgba(104,180,220,.55))',
  border: `1px solid ${GLASS.hairline}`,
  borderRadius: RADIUS.card,
}

/**
 * The striped placeholder under every face. It shows through until the frame
 * paints, and stays for good when Dropbox would not mint a link — a face that
 * renders as nothing is indistinguishable from a layout bug.
 */
const faceBox: CSSProperties = {
  borderRadius: 10,
  overflow: 'hidden',
  border: '1px solid rgba(21,15,25,.40)',
  boxShadow: '0 10px 20px rgba(18,52,72,.30)',
  backgroundColor: '#3f7fa8',
  backgroundImage: 'repeating-linear-gradient(135deg,#3f7fa8 0 6px,#e5edf3 6px 12px)',
}

/**
 * One face of the reel.
 *
 * The frame comes from the file itself rather than from Dropbox's thumbnail
 * API. `getTemporaryLink` is already proven in production — it is the URL the
 * Instagram publish worker ingests — whereas `/2/files/get_thumbnail_v2` has
 * never been called with this app's scoped-app credentials against a video.
 * Adding a thumbnail endpoint stays available later as an optimisation if video
 * faces prove heavy; it is not needed to make the feature work.
 *
 * `preload="metadata"` keeps this to a range request for the header rather than
 * a download of an 84 MB export. The explicit seek in `onLoadedMetadata` is
 * belt and braces: `#t=0.1` alone paints the frame in Safari and Firefox, but
 * Chrome has been inconsistent about honouring a media fragment without a
 * decode being asked for.
 *
 * `pointer-events-none` matters: the media element sits inside a <button>, and
 * without it a tap on a phone lands on the video instead of the control.
 */
function Face({ item, style }: { item: ReelItem; style?: CSSProperties }) {
  const isVideo = isVideoName(item.name)

  // A still paints as the box's own background rather than as an <img>: a
  // signed link that expires in four hours is not a URL next/image can
  // optimise, and its host is not in the images config, so an <img> would only
  // buy a lint suppression. Video has no such shorthand and needs an element.
  const still = !isVideo && item.link ? { backgroundImage: `url("${item.link}")` } : null

  return (
    <span
      className="block"
      style={{ ...faceBox, ...(still ?? {}), backgroundSize: 'cover', backgroundPosition: 'center', ...style }}
    >
      {isVideo && item.link && (
        <video
          src={`${item.link}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          disablePictureInPicture
          aria-hidden
          className="pointer-events-none h-full w-full object-cover"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget
            if (el.currentTime === 0 && el.duration > 0.1) el.currentTime = 0.1
          }}
        />
      )}
    </span>
  )
}

export interface ReadyReelProps {
  items: ReelItem[]
  /** /home's single clock reading — never read the clock during render here. */
  now: Date
  loading: boolean
  failed: boolean
  onRetry: () => void
  /** Opens a new post prefilled from this export. */
  onPick: (item: ReelItem) => void
  className?: string
}

export function ReadyReel({ items, now, loading, failed, onRetry, onPick, className = '' }: ReadyReelProps) {
  const mode = failed || loading ? 'empty' : reelMode(items.length)
  const faces = visibleFaceCount(items.length)
  const shown = items.slice(0, faces)
  const overflow = items.length - shown.length
  const radius = cylinderRadius(faces)
  const angle = faceAngle(faces)

  return (
    <section style={PANEL} className={`flex flex-col p-4 ${className}`}>
      <h3 className="text-[12px] font-semibold" style={{ color: INK.strong }}>
        Ready to post
      </h3>
      <p
        className="mt-1 text-[10px] uppercase"
        style={{ ...MONO, color: INK.tertiary, letterSpacing: '.14em' }}
      >
        {/* Never claim "EMPTY" for a read that failed or has not landed — the
            folder being clear and the folder being unknown are different facts,
            and only one of them is good news. */}
        {failed
          ? 'READY TO POST · UNAVAILABLE'
          : loading
            ? 'READY TO POST · CHECKING'
            : reelSummary(items, now.getTime())}
      </p>

      {failed ? (
        <div className="mt-3 flex flex-col items-start">
          <p className="text-[12.5px] font-medium" style={{ color: INK.primary }}>
            Couldn’t reach Dropbox
          </p>
          <p className="mt-0.5 text-[11.5px] leading-[1.45]" style={{ color: INK.secondary, textWrap: 'pretty' }}>
            What’s waiting to post is unknown — an empty queue and an unreachable
            Dropbox are not the same news.
          </p>
          {/* Colour as a class, matching EventsPanel: an inline `color` would
              beat the hover and the button would never respond. */}
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 py-1 text-[9.5px] uppercase text-[#5d5660] transition-colors hover:text-[#0b3a50]"
            style={{ ...MONO, letterSpacing: '.12em', borderRadius: RADIUS.control }}
          >
            Try again →
          </button>
        </div>
      ) : loading ? (
        <p className="mt-3 text-[12.5px]" style={{ color: INK.tertiary }}>
          Checking Dropbox…
        </p>
      ) : mode === 'empty' ? (
        /* A clear queue is stated, not apologised for. */
        <div className="mt-3 flex flex-col items-center justify-center gap-2 py-7 text-center" style={WELL}>
          <span
            className="block h-[52px] w-[36px]"
            style={{ ...faceBox, opacity: 0.5, boxShadow: 'none' }}
          />
          <p className="m-0 text-[12.5px] font-semibold" style={{ color: INK.primary }}>
            Queue is clear
          </p>
          <p className="m-0 max-w-[210px] text-[11.5px] leading-[1.45]" style={{ color: INK.secondary, textWrap: 'pretty' }}>
            Nothing waiting in Ready&nbsp;to&nbsp;Post. Export something and it lands here.
          </p>
        </div>
      ) : mode === 'single' ? (
        <button
          type="button"
          onClick={() => onPick(items[0])}
          title={items[0].name}
          className="mt-3 flex items-center gap-3 p-3 text-left"
          style={WELL}
        >
          <Face
            item={items[0]}
            style={{
              width: 108,
              height: 168,
              flexShrink: 0,
              animation: 'glass-float 6s ease-in-out infinite',
              transform: 'rotateY(-8deg)',
            }}
          />
          <span className="flex min-w-0 flex-col gap-[6px]">
            <span
              className="text-[13px] font-semibold leading-[1.3]"
              style={{ color: INK.primary, overflowWrap: 'anywhere' }}
            >
              {items[0].name}
            </span>
            <span style={{ ...MONO, fontSize: 10.5, color: INK.secondary }}>
              {formatBytes(items[0].size)}
            </span>
            {/* Reworded from the reference's "Drop it on a day to schedule it."
                Only onPick is wired — there is no drag source here, and adding
                one is its own project: the week board's dnd-kit setup already
                has to suspend scroll-snap mid-drag on mobile. Promise the
                gesture that exists. */}
            <span className="text-[11.5px] leading-[1.45]" style={{ color: INK.secondary, textWrap: 'pretty' }}>
              One export ready. Click it to start a post from it.
            </span>
          </span>
        </button>
      ) : mode === 'fan' ? (
        <div
          className="mt-3 flex items-center justify-center py-5"
          style={{ ...WELL, perspective: 900 }}
        >
          <div className="flex items-center" style={{ transformStyle: 'preserve-3d' }}>
            {shown.map((item, i) => {
              const offset = i - (shown.length - 1) / 2
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => onPick(item)}
                  title={item.name}
                  className="glass-reel-face block p-0"
                  style={
                    {
                      width: FACE_W,
                      height: FACE_H,
                      marginLeft: i === 0 ? 0 : -18,
                      transition: MOTION.cardHover,
                      // Read by the CSS rules in globals.css so the resting
                      // transform can be per-index while the hover state stays
                      // a single stylesheet rule — an inline `transform` would
                      // beat any :hover rule that tried to override it.
                      '--face-transform': `rotateY(${offset * -16}deg)`,
                      '--face-z': shown.length - i,
                    } as CSSProperties
                  }
                >
                  <Face item={item} style={{ width: '100%', height: '100%' }} />
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div
          className="mt-3 flex items-center justify-center py-5"
          style={{ ...WELL, minHeight: 188, perspective: 620 }}
        >
          <div
            className="glass-reel"
            style={{
              position: 'relative',
              width: FACE_W,
              height: FACE_H,
              transformStyle: 'preserve-3d',
              animation: 'glass-reel-spin 22s linear infinite',
            }}
          >
            {shown.map((item, i) => (
              <button
                key={item.path}
                type="button"
                onClick={() => onPick(item)}
                title={item.name}
                className="block p-0"
                style={{
                  position: 'absolute',
                  inset: 0,
                  transform: `rotateY(${i * angle}deg) translateZ(${radius}px)`,
                }}
              >
                <Face item={item} style={{ width: '100%', height: '100%' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {!failed && !loading && items.length > 1 && (
        <p className="mt-2.5 text-[11.5px] leading-[1.45]" style={{ color: INK.secondary, textWrap: 'pretty' }}>
          Click one to start a post from it.
          {overflow > 0 && ` ${overflow} more ${overflow === 1 ? 'is' : 'are'} waiting behind these.`}
        </p>
      )}
    </section>
  )
}
