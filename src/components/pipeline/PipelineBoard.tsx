'use client'

import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, ExternalLink, LayoutGrid, Columns } from 'lucide-react'
import { format, parseISO, isBefore, isToday, addDays } from 'date-fns'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { GLASS, INK, MOTION, PLATFORM, PLATFORM_NEUTRAL, STAGE } from '@/lib/glass'
import type { SocialPost, PostStage, Platform } from '@/types/database'
import { PublishStatusBadge, derivePublishState } from '@/components/ui/PublishStatusBadge'
import { PostDialog } from './PostDialog'
import { cn } from '@/lib/utils'

// The column keeps the label "Published" even though its chip reads "Live" —
// as a Move: target, "Published" is the clearer verb.
const STAGES: { key: PostStage; label: string }[] = [
  { key: 'idea',      label: 'Idea' },
  { key: 'scripted',  label: 'Scripted' },
  { key: 'shot',      label: 'Shot' },
  { key: 'editing',   label: 'Editing' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
]

// Depth planes, idea → published (design README §6). Applied at lg+ only; see
// KanbanView for why perspective and horizontal scrolling can't coexist.
const PLANE_Z = [-90, -70, -50, -30, -10, 10]

// Kept as Record<Platform, …> so TypeScript still forces an entry for every
// platform — that exhaustiveness is why this board never had the 'any'-renders-
// as-Instagram bug the calendar did. The neutral values come from glass.ts
// rather than being restated, so the two can't drift apart.
const PF: Record<Platform, { code: string; ink: string; fill: string }> = {
  instagram: { code: PLATFORM.instagram.code, ink: PLATFORM.instagram.ink, fill: PLATFORM.instagram.fill },
  tiktok:    { code: PLATFORM.tiktok.code,    ink: PLATFORM.tiktok.ink,    fill: PLATFORM.tiktok.fill },
  linkedin:  { code: PLATFORM.linkedin.code,  ink: PLATFORM.linkedin.ink,  fill: PLATFORM.linkedin.fill },
  any:       { code: PLATFORM_NEUTRAL.code,   ink: PLATFORM_NEUTRAL.ink,   fill: PLATFORM_NEUTRAL.fill },
}

const MONO = { fontFamily: 'var(--font-mono-num)' } as const
const ERROR_INK = '#8a2b12'

const POST_TYPE_LABELS: Record<string, string> = {
  reel: 'Reel', carousel: 'Carousel', story: 'Story',
  static: 'Static', video: 'Video', article: 'Article',
}

type ViewMode = 'kanban' | 'grid'

export function PipelineBoard() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null)
  const [defaultStage, setDefaultStage] = useState<PostStage>('idea')
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const searchParams = useSearchParams()
  const openedFromUrl = useRef(false)

  const supabase = createClient()

  useEffect(() => { loadPosts() }, [])

  // Auto-open dialog when navigated from calendar with ?post=<id>
  useEffect(() => {
    if (loading || openedFromUrl.current) return
    const postId = searchParams.get('post')
    if (!postId) return
    const post = posts.find((p) => p.id === postId)
    if (post) {
      openedFromUrl.current = true
      openEdit(post)
    }
  }, [loading, posts])

  async function loadPosts() {
    setLoading(true)
    const { data } = await supabase
      .from('social_posts')
      .select('*')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (data) setPosts(data)
    setLoading(false)
  }

  function openNew(stage: PostStage = 'idea') {
    setEditingPost(null)
    setDefaultStage(stage)
    setDialogOpen(true)
  }

  function openEdit(post: SocialPost) {
    setEditingPost(post)
    setDialogOpen(true)
  }

  async function handleSave() { setDialogOpen(false); await loadPosts() }
  async function handleDelete(id: string) {
    await supabase.from('social_posts').delete().eq('id', id)
    setDialogOpen(false)
    await loadPosts()
  }
  async function moveStage(post: SocialPost, newStage: PostStage) {
    await supabase.from('social_posts').update({ stage: newStage }).eq('id', post.id)
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, stage: newStage } : p)))
  }

  const filtered = filterPlatform === 'all' ? posts : posts.filter((p) => p.platform === filterPlatform)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 backdrop-blur-[14px]"
        style={{ background: GLASS.panelSoft, borderBottom: `1px solid ${GLASS.hairline}` }}
      >
        <h1 className="font-heading text-2xl font-normal tracking-tight" style={{ color: INK.primary }}>Content Pipeline</h1>
        <div className="flex items-center gap-2">
          {/* Platform filter */}
          <div
            className="flex gap-[2px] rounded-[13px] p-[3px]"
            style={{ background: 'rgba(255,255,255,.50)', border: '1px solid rgba(255,255,255,.9)' }}
          >
            {(['all', 'instagram', 'tiktok', 'linkedin'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPlatform(p)}
                className={cn(
                  'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-colors',
                  filterPlatform === p
                    ? 'bg-[rgba(255,255,255,.92)] text-[#150f19]'
                    : 'text-[rgba(27,20,31,.6)] hover:text-[#150f19]',
                )}
              >
                {p === 'all' ? 'All' : PF[p].code}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div
            className="flex gap-[2px] rounded-[13px] p-[3px]"
            style={{ background: 'rgba(255,255,255,.50)', border: '1px solid rgba(255,255,255,.9)' }}
          >
            {([['kanban', Columns, 'Kanban'], ['grid', LayoutGrid, 'Grid preview']] as const).map(([mode, Icon, title]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={title}
                className={cn(
                  'rounded-[10px] px-2.5 py-1.5 transition-colors',
                  viewMode === mode
                    ? 'bg-[rgba(255,255,255,.92)] text-[#150f19]'
                    : 'text-[rgba(27,20,31,.6)] hover:text-[#150f19]',
                )}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>

          <Button size="sm" onClick={() => openNew()}>
            <Plus size={14} className="mr-1" />
            <span className="hidden sm:inline">New Post</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {viewMode === 'kanban' ? (
        <KanbanView
          filtered={filtered}
          stages={STAGES}
          onNew={openNew}
          onEdit={openEdit}
          onMove={moveStage}
        />
      ) : (
        <GridView posts={filtered} onEdit={openEdit} />
      )}

      <PostDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        post={editingPost}
        defaultStage={defaultStage}
      />
    </div>
  )
}

// ─────────────────────────────────────────────
// Kanban view
// ─────────────────────────────────────────────
function KanbanView({
  filtered, stages, onNew, onEdit, onMove,
}: {
  filtered: SocialPost[]
  stages: typeof STAGES
  onNew: (stage: PostStage) => void
  onEdit: (post: SocialPost) => void
  onMove: (post: SocialPost, stage: PostStage) => void
}) {
  return (
    <div className="flex-1 overflow-x-auto">
      {/* Depth planes are lg+ only. The mock's pipeline is a strip that fits its
          container; this board is w-64 columns in overflow-x-auto, and
          perspective plus horizontal scrolling skews each column by a different
          amount as you scroll — it reads as broken, not as depth. Below lg the
          columns stay flat and scroll exactly as they do today. */}
      <div className="flex h-full min-w-max gap-[14px] p-[18px] xl:min-w-0 xl:[perspective:1500px] xl:[perspective-origin:50%_40%]">
        {stages.map(({ key, label }, i) => {
          const stagePosts = filtered.filter((p) => p.stage === key)
          // scheduled + published sit forward and read as more solid: these are
          // the committed columns.
          const elevated = i > 3
          // An empty column recedes: thinner surface, softer border, lighter
          // shadow. Deliberately NOT opacity on the panel — that would drag the
          // stage label below the #5d5660 text floor, which is the complaint
          // this redesign exists to fix. Label and count stay at full ink.
          const empty = stagePosts.length === 0
          return (
            <div
              key={key}
              style={{ '--plane-z': `${PLANE_Z[i]}px` } as CSSProperties}
              className="w-64 shrink-0 transition-transform duration-[350ms] ease-[cubic-bezier(.2,.8,.2,1)] xl:w-auto xl:min-w-0 xl:flex-1 xl:shrink xl:[transform:translateZ(var(--plane-z))] xl:hover:[transform:translateZ(70px)]"
            >
              <div
                className={cn(
                  'flex h-full flex-col gap-2 rounded-[16px] p-[10px] backdrop-blur-[12px] transition-[background,border-color,box-shadow] duration-300',
                  empty ? 'shadow-[0_6px_14px_rgba(63,43,80,.07)]' : 'shadow-[0_16px_28px_rgba(63,43,80,.16)]',
                )}
                style={{
                  background: empty
                    ? (elevated ? 'rgba(255,255,255,.46)' : 'rgba(255,255,255,.18)')
                    : (elevated ? 'rgba(255,255,255,.78)' : 'rgba(255,255,255,.42)'),
                  border: `1px solid ${
                    empty
                      ? (elevated ? 'rgba(20,16,20,.22)' : 'rgba(255,255,255,.40)')
                      : (elevated ? 'rgba(20,16,20,.50)' : 'rgba(255,255,255,.70)')
                  }`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Larger than the plan's 12/700 and 11/600 — Kevin, looking
                      at it on a phone: the column is 256px wide and the header
                      had room to spare. The depth planes shrink the furthest
                      column by about 6%, so this keeps Idea legible too. */}
                  <span className="text-[15px] font-bold" style={{ color: INK.primary }}>{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold" style={{ ...MONO, color: INK.tertiary }}>
                      {stagePosts.length}
                    </span>
                    <button
                      onClick={() => onNew(key)}
                      title={`New post in ${label}`}
                      className="text-[#5d5660] transition-colors hover:text-[#150f19]"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                {empty ? (
                  // Stated, not apologised for — same voice as the ReadyReel's
                  // "Queue is clear". A blank panel reads as a loading failure.
                  <div className="flex flex-1 items-center justify-center">
                    <span className="text-[10px] tracking-[.14em]" style={{ ...MONO, color: INK.tertiary }}>
                      EMPTY
                    </span>
                  </div>
                ) : (
                  <div className="flex-1 space-y-2 overflow-y-auto">
                    {stagePosts.map((post, idx) => (
                      <PostCard key={post.id} post={post} index={idx} stages={stages} onEdit={() => onEdit(post)} onMove={(s) => onMove(post, s)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Grid preview view
// ─────────────────────────────────────────────
function GridView({ posts, onEdit }: { posts: SocialPost[]; onEdit: (p: SocialPost) => void }) {
  const now = new Date()
  const soon = addDays(now, 7)

  // Group: overdue scheduled, this week, scheduled future, in-progress, ideas
  const overdue   = posts.filter((p) => p.stage === 'scheduled' && p.scheduled_at && isBefore(parseISO(p.scheduled_at), now))
  const thisWeek  = posts.filter((p) => p.stage === 'scheduled' && p.scheduled_at && !isBefore(parseISO(p.scheduled_at), now) && isBefore(parseISO(p.scheduled_at), soon))
  const upcoming  = posts.filter((p) => p.stage === 'scheduled' && p.scheduled_at && !isBefore(parseISO(p.scheduled_at), soon))
  const unscheduled = posts.filter((p) => p.stage !== 'published' && p.stage !== 'scheduled')
  const published = posts.filter((p) => p.stage === 'published')

  if (posts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: INK.secondary }}>No posts yet</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8">
      {overdue.length > 0 && (
        <GridSection title="Overdue" titleColor={ERROR_INK} posts={overdue} onEdit={onEdit} />
      )}
      {thisWeek.length > 0 && (
        <GridSection title="This Week" posts={thisWeek} onEdit={onEdit} />
      )}
      {upcoming.length > 0 && (
        <GridSection title="Upcoming" posts={upcoming} onEdit={onEdit} />
      )}
      {unscheduled.length > 0 && (
        <GridSection title="In Progress" posts={unscheduled} onEdit={onEdit} />
      )}
      {published.length > 0 && (
        <GridSection title="Published" posts={published} onEdit={onEdit} />
      )}
    </div>
  )
}

function GridSection({
  title, titleColor, posts, onEdit,
}: {
  title: string
  titleColor?: string
  posts: SocialPost[]
  onEdit: (p: SocialPost) => void
}) {
  return (
    <div>
      <h2 className="font-heading mb-3 text-[19px] font-semibold" style={{ color: titleColor ?? INK.primary }}>
        {title}{' '}
        <span className="text-[11px] font-normal" style={{ ...MONO, color: INK.tertiary }}>({posts.length})</span>
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {posts.map((post) => (
          <GridCard key={post.id} post={post} onEdit={() => onEdit(post)} />
        ))}
      </div>
    </div>
  )
}

function GridCard({ post, onEdit }: { post: SocialPost; onEdit: () => void }) {
  const pf = PF[post.platform]
  const stage = STAGE[post.stage as keyof typeof STAGE] ?? STAGE.idea

  return (
    <div
      onClick={onEdit}
      // Same hover classes as the kanban card, and no backdrop blur — cards
      // never get it, only the six column panels do.
      // Resting shadow as a class — see the kanban card for why inline loses.
      className="group cursor-pointer overflow-hidden rounded-[14px] shadow-[0_3px_8px_rgba(63,43,80,.10)] transition-[translate,scale,box-shadow] duration-[250ms] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_14px_22px_rgba(63,43,80,.2)]"
      style={{ background: GLASS.card, border: `1px solid ${GLASS.hairline}` }}
    >
      <div className={cn('relative flex aspect-square items-center justify-center', !post.media_url && 'glass-thumb-placeholder')}>
        {post.media_url ? (
          <a
            href={post.media_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 flex items-center justify-center bg-black/5 transition-colors hover:bg-black/10"
          >
            <ExternalLink size={20} style={{ color: INK.secondary }} />
          </a>
        ) : (
          <span className="text-[10px] tracking-[.06em]" style={{ ...MONO, color: INK.tertiary }}>
            {(post.post_type ?? pf.code).toUpperCase()}
          </span>
        )}
        {/* Stage becomes a filled pill rather than a bare dot — this is where
            "Live" appears, matching the week card. */}
        <span
          className="absolute right-1.5 top-1.5 rounded-full px-[6px] py-[2px] text-[9px] font-semibold"
          style={{ background: stage.bg, color: stage.fg }}
        >
          {stage.label}
        </span>
        <PublishStatusBadge post={post} size="xs" className="absolute left-1.5 top-1.5" />
      </div>

      <div className="p-2.5">
        <p className="truncate text-[11.5px] font-semibold leading-snug" style={{ color: INK.primary }}>
          {post.title || post.caption?.slice(0, 40) || 'Untitled'}
        </p>
        <div className="mt-1.5 flex items-center justify-between gap-1 text-[9.5px]" style={MONO}>
          <span style={{ color: pf.ink, fontWeight: 600 }}>{pf.code}</span>
          <span className="truncate" style={{ color: INK.tertiary }}>
            {post.scheduled_at
              ? format(parseISO(post.scheduled_at), 'MMM d')
              : (post.post_type ? POST_TYPE_LABELS[post.post_type] : '')}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Kanban Post Card
// ─────────────────────────────────────────────
function PostCard({
  post, stages, index, onEdit, onMove,
}: {
  post: SocialPost
  stages: typeof STAGES
  index: number
  onEdit: () => void
  onMove: (stage: PostStage) => void
}) {
  const pf = PF[post.platform]
  const meta = post.scheduled_at
    ? format(parseISO(post.scheduled_at), 'MMM d')
    : (post.post_type ? POST_TYPE_LABELS[post.post_type] : 'no date')

  return (
    // Entry animation on the wrapper, hover on the card — same split as the
    // week's GlassPostCard, so the keyframe's transform can't fight the hover.
    // The stagger is capped: a column can hold dozens of cards and an
    // uncapped delay would leave the last ones arriving seconds late.
    <div style={{ animation: `glass-fade-up .55s ${MOTION.ease} both`, animationDelay: `${Math.min(index, 8) * MOTION.staggerMs}ms` }}>
      <div
        onClick={onEdit}
        // Hover is a CSS class, never onMouseEnter: Tailwind v4 compiles the
        // hover: variant inside @media (hover: hover), so a tap on iOS can't
        // leave a card stuck mid-lift. translate and scale are separate
        // properties in v4, so they compose instead of clobbering each other.
        // The resting shadow is a CLASS, not an inline style. Inline styles beat
        // stylesheet rules whatever the pseudo-class, so an inline boxShadow
        // here silently kills hover:shadow-… — the card lifted but stayed flat,
        // losing the depth cue. Same family as the inline-vs-sm: trap the week
        // board hit; this is its :hover form.
        className="cursor-pointer rounded-[12px] p-3 shadow-[0_3px_8px_rgba(63,43,80,.10)] transition-[translate,scale,box-shadow] duration-[250ms] hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_14px_22px_rgba(63,43,80,.2)]"
        style={{ background: GLASS.card, border: `1px solid ${GLASS.hairline}` }}
      >
        <div className="flex gap-2">
          {/* 30x38 thumb, striped placeholder when there is no media — the same
              language as the week card. No backdrop-filter on cards. */}
          <div
            className={cn('h-[38px] w-[30px] shrink-0 overflow-hidden rounded-[7px]', !post.media_url && 'glass-thumb-placeholder')}
          >
            {post.media_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.media_url} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[11.5px] font-semibold leading-[1.3]" style={{ color: INK.primary }}>
              {post.title || post.caption?.slice(0, 50) || 'Untitled post'}
            </p>
            <p className="mt-[3px] text-[9.5px]" style={{ ...MONO, color: INK.tertiary }}>
              <span style={{ color: pf.ink, fontWeight: 600 }}>{pf.code}</span>
              {' · '}{meta}
            </p>
          </div>
        </div>

        {post.caption && (
          <p className="mt-2 line-clamp-2 text-[10.5px] leading-snug" style={{ color: INK.tertiary }}>{post.caption}</p>
        )}

        <div className="mt-2 flex items-center gap-1.5">
          <PublishStatusBadge post={post} />
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {post.ig_permalink && (
              <a
                href={post.ig_permalink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="View on Instagram"
                style={{ color: PLATFORM.instagram.ink }}
              >
                <ExternalLink size={12} />
              </a>
            )}
            {post.media_url && !post.ig_permalink && (
              <a
                href={post.media_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: INK.tertiary }}
              >
                <ExternalLink size={12} />
              </a>
            )}
          </span>
        </div>

        {/* Why a post didn't go out belongs on the card — an email is easy to miss. */}
        {derivePublishState(post) === 'failed' && post.publish_error && (
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug" style={{ color: ERROR_INK }}>{post.publish_error}</p>
        )}

        <div
          className="mt-2 flex flex-wrap items-center gap-1 pt-2"
          style={{ borderTop: '1px solid rgba(21,15,25,.08)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[10px]" style={{ color: INK.tertiary }}>Move:</p>
          {stages.filter((s) => s.key !== post.stage).map((s) => (
            <button
              key={s.key}
              onClick={() => onMove(s.key)}
              className="text-[10px] text-[#5d5660] transition-colors hover:text-[#150f19] hover:underline"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
