// The arithmetic and the wording behind the ReadyReel display (Stage 5).
//
// Two of these guard defects that were diagnosed in the reference
// implementation before it was ported, and that are invisible in production
// today: the folder holds exactly one file, so the cylinder never draws. A
// wrong radius would only show up the week Kevin exports a ninth video, which
// is precisely when nobody would connect it to this code.
//
// See docs/design/riviera-glass/code/ReadyReel.tsx for the reference.

import assert from 'node:assert/strict'

const {
  HERO_FACE,
  MAX_FACES,
  cylinderRadius,
  faceAngle,
  faceSize,
  formatBytes,
  isVideoName,
  oldestWaiting,
  reelMode,
  reelSummary,
  titleFromFilename,
  visibleFaceCount,
  waitingFor,
} = await import('../src/lib/ready-reel.ts')

let pass = 0
const ok = (n) => { pass++; console.log(`  ✓ ${n}`) }
console.log(`\nready reel  [TZ=${process.env.TZ ?? 'UTC'}]`)

const item = (o) => ({ name: 'a.mp4', path: '/a.mp4', size: 0, modified: null, ...o })

// ── Which mode the folder puts the reel in ──────────────────────────────
// v2 is sparse-first: the design is driven off the file count, and `single`
// is today's reality rather than an edge case.
assert.equal(reelMode(0), 'empty')
assert.equal(reelMode(1), 'single')
assert.equal(reelMode(4), 'cylinder')
assert.equal(reelMode(40), 'cylinder')
ok('the file count picks the mode, and n=1 is `single`')

// The regression this guards: v2 gave 2–3 files a static fan and only spun at
// 4+. Kevin saw that at three files — "thumbnails show, but just still images,
// no revolving". Two files up is a cylinder now, and it has to stay one.
assert.equal(reelMode(2), 'cylinder')
assert.equal(reelMode(3), 'cylinder')
ok('two and three files revolve — the volume this actually runs at')

// A negative count is not reachable from a length, but `empty` is the only
// honest answer if it ever were — certainly not `single`, which would index
// items[0] of an empty array.
assert.equal(reelMode(-1), 'empty')
ok('a nonsensical count degrades to `empty`, not to `single`')

// ── Defect 1: the hardcoded radius ──────────────────────────────────────
// The reference fixed RADIUS at 104px. A regular n-gon of side FACE_W needs an
// apothem of (FACE_W/2)/tan(π/n), which passes 104 at n≈9 — beyond that the
// faces cut through one another and the cylinder renders as a knot.
for (let n = 3; n <= 64; n++) {
  const w = faceSize(n).w
  const apothem = w / 2 / Math.tan(Math.PI / n)
  assert.ok(
    cylinderRadius(n, w) >= apothem,
    `radius at n=${n} is ${cylinderRadius(n, w)}, below the ${apothem.toFixed(1)} the faces need`
  )
}
ok('the radius always clears the apothem, so faces never interpenetrate')

// The failing case, stated on its own so a regression names itself: at nine
// faces the reference's fixed 104px was already smaller than the apothem.
const w9 = faceSize(9).w
assert.ok(cylinderRadius(9, w9) >= w9 / 2 / Math.tan(Math.PI / 9))
ok('n=9 — the first count the reference radius was too small for — is clear')

// ...and never exceeds it either, from three faces up. Kevin on the 0.8-of-a-
// face-width floor this used to carry: "the spacing between them is very wide.
// Is it possible to make them closer together?" It forced a 260px ring at three
// faces where the geometry asked for 162px. The apothem is by definition the
// radius at which the faces close edge to edge; anything above it is invented
// space, so the floor must not bind here.
for (let n = 3; n <= MAX_FACES; n++) {
  const w = faceSize(n).w
  assert.equal(
    cylinderRadius(n, w),
    Math.max(w * 0.3, (w + 8) / 2 / Math.tan(Math.PI / n)),
    `n=${n} is padded above its apothem`
  )
  assert.ok(cylinderRadius(n, w) > w * 0.3, `the floor still binds at n=${n}`)
}
ok('three faces up sit at their exact apothem, with no invented spacing')

// The floor exists for two faces alone: a two-sided polygon has no apothem —
// the tangent runs to infinity and the expression collapses to zero — so
// without it the two cards would sit coplanar, occupying the same space.
assert.equal(cylinderRadius(2, 100), 30)
ok('two faces, which have no apothem at all, get the floor')

// ── The other half of defect 1: a bounded number of faces ───────────────
// Capping the drawn faces keeps the widget a fixed size however full the
// folder gets — it shares a grid row with two panels that size to content.
assert.equal(visibleFaceCount(1), 1)
assert.equal(visibleFaceCount(MAX_FACES), MAX_FACES)
assert.equal(visibleFaceCount(MAX_FACES + 30), MAX_FACES)
assert.equal(visibleFaceCount(0), 0)
ok('the drawn faces are capped at MAX_FACES')

// ── Face size scales down as the folder fills ───────────────────────────
// The ring is roughly 2·radius + faceW wide. At a fixed face size a small
// count left the card adrift in a well twice its width; growing the face fills
// that space rather than padding it.
assert.ok(faceSize(2).w > faceSize(8).w)
assert.ok(faceSize(3).w >= faceSize(5).w)
assert.ok(faceSize(5).w >= faceSize(8).w)
ok('fewer files get bigger cards')

// 9:16, the shape of the thing being shown. The reference's 84x132 is 2:3, and
// object-fit: cover cropped the top and bottom off every frame — which is
// where the hook text sits.
for (const n of [1, 2, 3, 4, 6, 8]) {
  const { w, h } = n === 1 ? HERO_FACE : faceSize(n)
  assert.ok(Math.abs(h / w - 16 / 9) < 0.02, `n=${n} is ${w}x${h}, not 9:16`)
}
ok('every face is 9:16, including the single-file hero')

// The faces have to close the ring, whatever the count.
assert.equal(faceAngle(4) * 4, 360)
assert.equal(faceAngle(MAX_FACES) * MAX_FACES, 360)
// Guards a division by zero rather than returning Infinity into a transform.
assert.equal(faceAngle(0), 360)
ok('the face angle closes the ring and survives a zero count')

// ── Something is always facing the viewer ───────────────────────────────
// The faces are backface-hidden, so a card past 90° from the front is drawn as
// nothing at all — without that the far side of the ring shows through the near
// side as a MIRRORED thumbnail, which is what Chromium rendered on 28 July.
// The cost is that a ring whose faces sit more than 180° apart has an angle
// with nothing on screen, and the widget blinks empty mid-spin. Spacing at or
// under 180° means the ±90° windows meet, so every count from two up is
// covered — and this is what a face cap must not be allowed to break.
for (let n = 2; n <= MAX_FACES; n++) {
  assert.ok(faceAngle(n) <= 180, `${n} faces sit ${faceAngle(n)}° apart — the ring blinks empty`)
}
ok('no face count leaves the ring empty mid-spin')

// ── The count reported is the folder's, not the reel's ──────────────────
// A folder of 12 draws 8 faces. Reporting "8 exports" would quietly lose four
// videos on the one surface whose job is to say what is waiting.
const twelve = Array.from({ length: 12 }, (_, i) => item({ name: `v${i}.mp4`, path: `/v${i}.mp4` }))
assert.match(reelSummary(twelve, Date.UTC(2026, 6, 28)), /12 EXPORTS/)
ok('the strap line counts the folder, not the visible faces')

// ── The "oldest waiting" line ───────────────────────────────────────────
const now = Date.UTC(2026, 6, 28, 12, 0, 0)
assert.equal(waitingFor(new Date(now - 3 * 86_400_000).toISOString(), now), '3 days')
assert.equal(waitingFor(new Date(now - 86_400_000).toISOString(), now), '1 day')
assert.equal(waitingFor(new Date(now - 3_600_000).toISOString(), now), 'today')
ok('a wait reads in whole days, singular at one')

// Nothing rather than "-2 days": a clock skew between Dropbox's server_modified
// and the browser is entirely ordinary, and a negative age reads as a bug in
// the app rather than as the non-event it is.
assert.equal(waitingFor(new Date(now + 2 * 86_400_000).toISOString(), now), null)
assert.equal(waitingFor(null, now), null)
assert.equal(waitingFor('not a date', now), null)
ok('a future, missing or unparseable timestamp reports nothing at all')

// Oldest, not newest — the number worth reporting is the longest wait.
const mixed = [
  item({ name: 'new.mp4', path: '/new.mp4', modified: new Date(now - 86_400_000).toISOString() }),
  item({ name: 'old.mp4', path: '/old.mp4', modified: new Date(now - 9 * 86_400_000).toISOString() }),
]
assert.equal(oldestWaiting(mixed, now), '9 days')
// A folder where Dropbox reported no timestamps at all must not throw.
assert.equal(oldestWaiting([item(), item()], now), null)
ok('the oldest file sets the wait, and no timestamps means no claim')

// ── The strap line ──────────────────────────────────────────────────────
assert.equal(reelSummary([], now), 'EMPTY')
assert.equal(
  reelSummary([item({ modified: new Date(now - 2 * 86_400_000).toISOString() })], now),
  '1 EXPORT · OLDEST 2 DAYS'
)
// Singular at one, and the age clause is dropped rather than left dangling.
assert.equal(reelSummary([item()], now), '1 EXPORT')
assert.equal(reelSummary([item(), item()], now), '2 EXPORTS')
ok('the strap line pluralises and drops the age clause when there is no age')

// It must NOT lead with "READY TO POST" — the panel's own heading says that
// directly above it, and the reference's wording read as a stutter on screen.
assert.doesNotMatch(reelSummary(twelve, now), /READY TO POST/)
ok('the strap line does not repeat the heading above it')

// ── Which element paints the face ───────────────────────────────────────
// The Ready-to-Post filter admits stills as well as video (MEDIA_EXT in
// lib/dropbox.ts). Feeding a JPEG to a <video> paints nothing, which reads as a
// broken thumbnail rather than as a photo.
assert.equal(isVideoName('Need a minute.mp4'), true)
assert.equal(isVideoName('CLIP.MOV'), true)
assert.equal(isVideoName('b-roll.webm'), true)
assert.equal(isVideoName('cover.jpg'), false)
assert.equal(isVideoName('shot.HEIC'), false)
// The extension decides, not a substring of the name.
assert.equal(isVideoName('mp4 notes.jpg'), false)
ok('video and still faces are told apart by extension, not by substring')

// ── The title a picked export seeds ─────────────────────────────────────
assert.equal(titleFromFilename('Need a minute.mp4'), 'Need a minute')
assert.equal(titleFromFilename('monaco.final.v2.mov'), 'monaco.final.v2')
// No extension at all, and a name that is nothing but one — neither should
// produce an empty title, which would look like the prefill silently failed.
assert.equal(titleFromFilename('untitled'), 'untitled')
assert.equal(titleFromFilename('.mp4'), '.mp4')
ok('the filename becomes a title without ever becoming an empty one')

// ── File size ───────────────────────────────────────────────────────────
assert.equal(formatBytes(88_080_384), '84.0 MB')
assert.equal(formatBytes(2048), '2 KB')
assert.equal(formatBytes(512), '512 B')
assert.equal(formatBytes(0), '0 B')
// Dropbox omits `size` on some entries; lib/dropbox.ts defaults it to 0, but a
// NaN must not reach the screen as "NaN MB".
assert.equal(formatBytes(Number.NaN), '')
ok('sizes format, and a missing one renders as nothing rather than NaN')

console.log(`\n${pass} checks passed.\n`)
