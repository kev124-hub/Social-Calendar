'use client'

import { useState, useEffect } from 'react'
import { Plus, ExternalLink, LayoutGrid, Columns } from 'lucide-react'
import { format, parseISO, isBefore, isToday, addDays } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import type { SocialPost, PostStage, Platform } from '@/types/database'
import { PostDialog } from './PostDialog'
import { cn } from '@/lib/utils'

const STAGES: { key: PostStage; label: string; color: string; dot: string }[] = [
  { key: 'idea',      label: 'Idea',      color: 'bg-slate-100 border-slate-200',  dot: 'bg-slate-400' },
  { key: 'scripted',  label: 'Scripted',  color: 'bg-blue-50 border-blue-100',    dot: 'bg-blue-400' },
  { key: 'shot',      label: 'Shot',      color: 'bg-purple-50 border-purple-100', dot: 'bg-purple-400' },
  { key: 'editing',   label: 'Editing',   color: 'bg-amber-50 border-amber-100',   dot: 'bg-amber-400' },
  { key: 'scheduled', label: 'Scheduled', color: 'bg-green-50 border-green-100',   dot: 'bg-green-500' },
  { key: 'published', label: 'Published', color: 'bg-emerald-50 border-emerald-100', dot: 'bg-emerald-500' },
]

const PLATFORM_CONFIG: Record<Platform, { label: string; color: string }> = {
  instagram: { label: 'IG', color: 'bg-pink-100 text-pink-700' },
  tiktok:    { label: 'TT', color: 'bg-slate-100 text-slate-700' },
  linkedin:  { label: 'LI', color: 'bg-blue-100 text-blue-700' },
  any:       { label: 'Any', color: 'bg-gray-100 text-gray-700' },
}

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

  const supabase = createClient()

  useEffect(() => { loadPosts() }, [])

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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border gap-2">
        <h1 className="text-xl font-semibold">Content Pipeline</h1>
        <div className="flex items-center gap-2">
          {/* Platform filter */}
          <div className="flex rounded-md border border-border overflow-hidden">
            {(['all', 'instagram', 'tiktok', 'linkedin'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPlatform(p)}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-medium transition-colors',
                  filterPlatform === p ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'
                )}
              >
                {p === 'all' ? 'All' : p === 'instagram' ? 'IG' : p === 'tiktok' ? 'TT' : 'LI'}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('kanban')}
              title="Kanban"
              className={cn('px-2.5 py-1.5 transition-colors', viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent')}
            >
              <Columns size={14} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Grid preview"
              className={cn('px-2.5 py-1.5 transition-colors', viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent')}
            >
              <LayoutGrid size={14} />
            </button>
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
      <div className="flex gap-4 p-6 h-full min-w-max">
        {stages.map(({ key, label, color }) => {
          const stagePosts = filtered.filter((p) => p.stage === key)
          return (
            <div key={key} className={cn('flex flex-col w-64 rounded-xl border', color)}>
              <div className="flex items-center justify-between px-3 py-3 border-b border-inherit">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{label}</span>
                  <Badge variant="secondary" className="text-xs h-5 px-1.5">{stagePosts.length}</Badge>
                </div>
                <button onClick={() => onNew(key)} className="text-muted-foreground hover:text-foreground">
                  <Plus size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {stagePosts.map((post) => (
                  <PostCard key={post.id} post={post} stages={stages} onEdit={() => onEdit(post)} onMove={(s) => onMove(post, s)} />
                ))}
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
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">No posts yet</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8">
      {overdue.length > 0 && (
        <GridSection title="Overdue" titleClass="text-destructive" posts={overdue} onEdit={onEdit} />
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
  title, titleClass, posts, onEdit,
}: {
  title: string
  titleClass?: string
  posts: SocialPost[]
  onEdit: (p: SocialPost) => void
}) {
  return (
    <div>
      <h2 className={cn('text-sm font-semibold mb-3', titleClass ?? 'text-foreground')}>{title} <span className="text-muted-foreground font-normal">({posts.length})</span></h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {posts.map((post) => (
          <GridCard key={post.id} post={post} onEdit={() => onEdit(post)} />
        ))}
      </div>
    </div>
  )
}

function GridCard({ post, onEdit }: { post: SocialPost; onEdit: () => void }) {
  const platform = PLATFORM_CONFIG[post.platform]
  const stage = STAGES.find((s) => s.key === post.stage)

  return (
    <div
      onClick={onEdit}
      className="group cursor-pointer rounded-xl border border-border bg-card hover:shadow-md transition-all overflow-hidden"
    >
      {/* Thumbnail placeholder / media indicator */}
      <div className="aspect-square bg-muted/50 relative flex items-center justify-center">
        {post.media_url ? (
          <a
            href={post.media_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 flex items-center justify-center bg-black/5 hover:bg-black/10 transition-colors"
          >
            <ExternalLink size={20} className="text-muted-foreground" />
          </a>
        ) : (
          <span className="text-2xl text-muted-foreground/30 font-bold select-none">
            {post.platform === 'instagram' ? '📸' : post.platform === 'tiktok' ? '🎵' : '💼'}
          </span>
        )}
        {/* Stage dot */}
        <div className={cn('absolute top-2 right-2 w-2.5 h-2.5 rounded-full', stage?.dot ?? 'bg-slate-400')} title={stage?.label} />
      </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-xs font-medium truncate leading-snug">
          {post.title || post.caption?.slice(0, 40) || 'Untitled'}
        </p>
        <div className="flex items-center justify-between mt-1.5 gap-1">
          <span className={cn('text-xs font-semibold px-1 py-0.5 rounded', platform.color)}>
            {platform.label}
          </span>
          {post.scheduled_at ? (
            <span className="text-xs text-muted-foreground truncate">
              {format(parseISO(post.scheduled_at), 'MMM d')}
            </span>
          ) : post.post_type ? (
            <span className="text-xs text-muted-foreground">{POST_TYPE_LABELS[post.post_type]}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Kanban Post Card
// ─────────────────────────────────────────────
function PostCard({
  post, stages, onEdit, onMove,
}: {
  post: SocialPost
  stages: typeof STAGES
  onEdit: () => void
  onMove: (stage: PostStage) => void
}) {
  const platform = PLATFORM_CONFIG[post.platform]
  return (
    <div className="bg-white rounded-lg border border-border p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={onEdit}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium leading-snug flex-1 min-w-0">
          {post.title || post.caption?.slice(0, 50) || 'Untitled post'}
        </p>
        <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded shrink-0', platform.color)}>
          {platform.label}
        </span>
      </div>
      {post.post_type && <p className="text-xs text-muted-foreground mb-2">{POST_TYPE_LABELS[post.post_type]}</p>}
      {post.caption && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{post.caption}</p>}
      <div className="flex items-center justify-between mt-2">
        {post.scheduled_at ? (
          <span className="text-xs text-muted-foreground">{format(parseISO(post.scheduled_at), 'MMM d')}</span>
        ) : <span />}
        {post.media_url && (
          <a href={post.media_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground">
            <ExternalLink size={12} />
          </a>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs text-muted-foreground">Move:</p>
        {stages.filter((s) => s.key !== post.stage).map((s) => (
          <button key={s.key} onClick={() => onMove(s.key)} className="text-xs text-muted-foreground hover:text-primary underline">
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
