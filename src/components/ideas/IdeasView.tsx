'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, ArrowRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import type { Idea, Platform } from '@/types/database'
import { IdeaDialog } from './IdeaDialog'
import { cn } from '@/lib/utils'

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  instagram: { label: 'IG', color: 'bg-pink-100 text-pink-700' },
  tiktok: { label: 'TT', color: 'bg-slate-100 text-slate-700' },
  linkedin: { label: 'LI', color: 'bg-blue-100 text-blue-700' },
  any: { label: 'Any', color: 'bg-gray-100 text-gray-700' },
}

export function IdeasView() {
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null)
  const [filterPlatform, setFilterPlatform] = useState<Platform | 'all'>('all')
  const searchParams = useSearchParams()
  const openedFromUrl = useRef(false)

  const supabase = createClient()

  useEffect(() => { loadIdeas() }, [])

  // Auto-open dialog when navigated from calendar with ?idea=<id>
  useEffect(() => {
    if (loading || openedFromUrl.current) return
    const ideaId = searchParams.get('idea')
    if (!ideaId) return
    const idea = ideas.find((i) => i.id === ideaId)
    if (idea) {
      openedFromUrl.current = true
      openEdit(idea)
    }
  }, [loading, ideas])

  async function loadIdeas() {
    setLoading(true)
    const { data } = await supabase
      .from('ideas')
      .select('*')
      .is('promoted_to_post', null)
      .order('created_at', { ascending: false })
    if (data) setIdeas(data)
    setLoading(false)
  }

  function openNew() {
    setEditingIdea(null)
    setDialogOpen(true)
  }

  function openEdit(idea: Idea) {
    setEditingIdea(idea)
    setDialogOpen(true)
  }

  async function handleSave() {
    setDialogOpen(false)
    await loadIdeas()
  }

  async function handleDelete(id: string) {
    await supabase.from('ideas').delete().eq('id', id)
    setDialogOpen(false)
    await loadIdeas()
  }

  async function promoteToPost(idea: Idea) {
    const { data: post } = await supabase
      .from('social_posts')
      .insert({
        platform: (idea.platform as Platform) === 'any' || !idea.platform ? 'instagram' : idea.platform as any,
        stage: 'idea' as const,
        title: idea.title,
        caption: idea.description ?? null,
        promoted_from_idea: idea.id,
      })
      .select()
      .single()

    if (post) {
      await supabase.from('ideas').update({ promoted_to_post: post.id }).eq('id', idea.id)
      await loadIdeas()
    }
  }

  const filtered = filterPlatform === 'all'
    ? ideas
    : ideas.filter((i) => i.platform === filterPlatform || (filterPlatform === 'any' && !i.platform))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold">Ideas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{ideas.length} captured</p>
        </div>
        <div className="flex items-center gap-3">
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
          <Button size="sm" onClick={openNew}>
            <Plus size={14} className="mr-1" />
            Capture idea
          </Button>
        </div>
      </div>

      {/* Ideas grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <p className="text-sm mb-3">No ideas yet</p>
            <Button variant="outline" size="sm" onClick={openNew}>
              <Plus size={14} className="mr-1" />
              Capture your first idea
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onEdit={() => openEdit(idea)}
                onPromote={() => promoteToPost(idea)}
              />
            ))}
          </div>
        )}
      </div>

      <IdeaDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
        idea={editingIdea}
      />
    </div>
  )
}

function IdeaCard({
  idea,
  onEdit,
  onPromote,
}: {
  idea: Idea
  onEdit: () => void
  onPromote: () => void
}) {
  const platform = idea.platform ? PLATFORM_CONFIG[idea.platform] : PLATFORM_CONFIG.any

  return (
    <div
      className="bg-card border border-border rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold leading-snug flex-1">{idea.title}</h3>
        <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded shrink-0', platform.color)}>
          {platform.label}
        </span>
      </div>

      {idea.description && (
        <p className="text-xs text-muted-foreground line-clamp-3 mb-3">{idea.description}</p>
      )}

      {(idea.trip_name || idea.date_start) && (
        <p className="text-xs text-muted-foreground mb-3">
          {idea.trip_name && `✈ ${idea.trip_name}`}
          {idea.date_start && !idea.trip_name && `📅 ${format(parseISO(idea.date_start), 'MMM d')}`}
        </p>
      )}

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
        <span className="text-xs text-muted-foreground">
          {format(parseISO(idea.created_at), 'MMM d')}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPromote()
          }}
          className="text-xs text-primary hover:underline font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Promote to pipeline
          <ArrowRight size={11} />
        </button>
      </div>
    </div>
  )
}
