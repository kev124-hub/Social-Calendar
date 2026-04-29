'use client'

import { useState, useEffect } from 'react'
import { Plus, ExternalLink } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import type { SocialPost, PostStage, Platform } from '@/types/database'
import { PostDialog } from './PostDialog'
import { cn } from '@/lib/utils'

const STAGES: { key: PostStage; label: string; color: string }[] = [
  { key: 'idea', label: 'Idea', color: 'bg-slate-100 border-slate-200' },
  { key: 'scripted', label: 'Scripted', color: 'bg-blue-50 border-blue-100' },
  { key: 'shot', label: 'Shot', color: 'bg-purple-50 border-purple-100' },
  { key: 'editing', label: 'Editing', color: 'bg-amber-50 border-amber-100' },
  { key: 'scheduled', label: 'Scheduled', color: 'bg-green-50 border-green-100' },
  { key: 'published', label: 'Published', color: 'bg-emerald-50 border-emerald-100' },
]

const PLATFORM_CONFIG: Record<Platform, { label: string; color: string }> = {
  instagram: { label: 'IG', color: 'bg-pink-100 text-pink-700' },
  tiktok: { label: 'TT', color: 'bg-slate-100 text-slate-700' },
  linkedin: { label: 'LI', color: 'bg-blue-100 text-blue-700' },
  any: { label: 'Any', color: 'bg-gray-100 text-gray-700' },
}

const POST_TYPE_LABELS: Record<string, string> = {
  reel: 'Reel',
  carousel: 'Carousel',
  story: 'Story',
  static: 'Static',
  video: 'Video',
  article: 'Article',
}

export function PipelineBoard() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null)
  const [defaultStage, setDefaultStage] = useState<PostStage>('idea')
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all')

  const supabase = createClient()

  useEffect(() => { loadPosts() }, [])

  async function loadPosts() {
    setLoading(true)
    const { data } = await supabase
      .from('social_posts')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setPosts(data)
    setLoading(false)
  }

  function openNew(stage: PostStage) {
    setEditingPost(null)
    setDefaultStage(stage)
    setDialogOpen(true)
  }

  function openEdit(post: SocialPost) {
    setEditingPost(post)
    setDialogOpen(true)
  }

  async function handleSave() {
    setDialogOpen(false)
    await loadPosts()
  }

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
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-xl font-semibold">Content Pipeline</h1>
        <div className="flex items-center gap-3">
          {/* Platform filter */}
          <div className="flex rounded-md border border-border overflow-hidden">
            {(['all', 'instagram', 'tiktok', 'linkedin'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPlatform(p)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                  filterPlatform === p
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent'
                )}
              >
                {p === 'all' ? 'All' : p === 'instagram' ? 'IG' : p === 'tiktok' ? 'TT' : 'LI'}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => openNew('idea')}>
            <Plus size={14} className="mr-1" />
            New Post
          </Button>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 h-full min-w-max">
          {STAGES.map(({ key, label, color }) => {
            const stagePosts = filtered.filter((p) => p.stage === key)
            return (
              <div
                key={key}
                className={cn('flex flex-col w-64 rounded-xl border', color)}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-3 border-b border-inherit">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{label}</span>
                    <Badge variant="secondary" className="text-xs h-5 px-1.5">
                      {stagePosts.length}
                    </Badge>
                  </div>
                  <button
                    onClick={() => openNew(key)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stagePosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      stages={STAGES}
                      onEdit={() => openEdit(post)}
                      onMove={(stage) => moveStage(post, stage)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

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

function PostCard({
  post,
  stages,
  onEdit,
  onMove,
}: {
  post: SocialPost
  stages: typeof STAGES
  onEdit: () => void
  onMove: (stage: PostStage) => void
}) {
  const platform = PLATFORM_CONFIG[post.platform]

  return (
    <div
      className="bg-white rounded-lg border border-border p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium leading-snug flex-1 min-w-0">
          {post.title || post.caption?.slice(0, 50) || 'Untitled post'}
        </p>
        <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded shrink-0', platform.color)}>
          {platform.label}
        </span>
      </div>

      {post.post_type && (
        <p className="text-xs text-muted-foreground mb-2">{POST_TYPE_LABELS[post.post_type]}</p>
      )}

      {post.caption && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{post.caption}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        {post.scheduled_at ? (
          <span className="text-xs text-muted-foreground">
            {format(parseISO(post.scheduled_at), 'MMM d')}
          </span>
        ) : (
          <span />
        )}
        {post.media_url && (
          <a
            href={post.media_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      {/* Quick move arrows */}
      <div className="flex gap-1 mt-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs text-muted-foreground mr-1">Move:</p>
        {stages
          .filter((s) => s.key !== post.stage)
          .map((s) => (
            <button
              key={s.key}
              onClick={() => onMove(s.key)}
              className="text-xs text-muted-foreground hover:text-primary underline"
            >
              {s.label}
            </button>
          ))}
      </div>
    </div>
  )
}
