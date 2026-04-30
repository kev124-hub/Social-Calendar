'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, ExternalLink, Image, Video, Link, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { Inspiration, InspirationItemType } from '@/types/database'
import { InspirationDialog } from './InspirationDialog'
import { format } from 'date-fns'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function getPublicUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/inspirations/${path}`
}

function getYouTubeId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

const TYPE_FILTERS: { value: InspirationItemType | 'all'; label: string; icon?: React.ReactNode }[] = [
  { value: 'all', label: 'All' },
  { value: 'image', label: 'Images', icon: <Image size={13} /> },
  { value: 'video_link', label: 'Videos', icon: <Video size={13} /> },
  { value: 'url_clip', label: 'URLs', icon: <Link size={13} /> },
  { value: 'text_note', label: 'Notes', icon: <FileText size={13} /> },
]

function InspirationCard({ item, onDelete }: { item: Inspiration; onDelete: () => void }) {
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()

  async function handleDelete() {
    setDeleting(true)
    if (item.image_path) {
      await supabase.storage.from('inspirations').remove([item.image_path])
    }
    await supabase.from('inspirations').delete().eq('id', item.id)
    onDelete()
  }

  const ytId = item.type === 'video_link' && item.source_url ? getYouTubeId(item.source_url) : null

  return (
    <div className="group relative rounded-xl border border-border overflow-hidden bg-card break-inside-avoid mb-4">
      {/* Image */}
      {item.type === 'image' && item.image_path && (
        <img
          src={getPublicUrl(item.image_path)}
          alt={item.title ?? ''}
          className="w-full object-cover"
          loading="lazy"
        />
      )}

      {/* Video */}
      {item.type === 'video_link' && (
        <div className="relative">
          {ytId ? (
            <img
              src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
              alt={item.title ?? ''}
              className="w-full object-cover"
            />
          ) : (
            <div className="bg-muted h-28 flex items-center justify-center">
              <Video size={32} className="text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow">
              <div className="w-0 h-0 border-t-[7px] border-b-[7px] border-l-[12px] border-transparent border-l-black ml-1" />
            </div>
          </div>
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute inset-0"
              aria-label="Open video"
            />
          )}
        </div>
      )}

      {/* URL clip */}
      {item.type === 'url_clip' && item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-3 bg-muted hover:bg-muted/80 transition-colors"
        >
          <Link size={14} className="text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate">{new URL(item.source_url).hostname}</span>
          <ExternalLink size={12} className="text-muted-foreground shrink-0 ml-auto" />
        </a>
      )}

      {/* Text note header */}
      {item.type === 'text_note' && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 flex items-center gap-2">
          <FileText size={13} className="text-amber-600" />
          <span className="text-xs font-medium text-amber-700">Note</span>
        </div>
      )}

      {/* Card body */}
      <div className="px-3 py-3 space-y-1.5">
        {item.title && (
          <p className="text-sm font-medium leading-tight">{item.title}</p>
        )}
        {item.notes && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{item.notes}</p>
        )}
        {item.trip_name && (
          <p className="text-xs text-primary font-medium">✈ {item.trip_name}</p>
        )}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {item.tags.map((tag) => (
              <span key={tag} className="text-xs bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground/60">{format(new Date(item.created_at), 'MMM d, yyyy')}</p>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-black/60 text-white rounded-full p-1.5 hover:bg-destructive transition-all"
        aria-label="Delete"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

export function InspirationBoard() {
  const [items, setItems] = useState<Inspiration[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<InspirationItemType | 'all'>('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [tripFilter, setTripFilter] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('inspirations')
      .select('*')
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }

  // Derived filter options
  const allTags = [...new Set(items.flatMap((i) => i.tags))].sort()
  const allTrips = [...new Set(items.map((i) => i.trip_name).filter(Boolean) as string[])].sort()

  const filtered = items.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (tagFilter && !item.tags.includes(tagFilter)) return false
    if (tripFilter && item.trip_name !== tripFilter) return false
    return true
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Type filter */}
          <div className="flex gap-1">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value as InspirationItemType | 'all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  typeFilter === f.value
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.icon}{f.label}
              </button>
            ))}
          </div>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <select
              value={tagFilter ?? ''}
              onChange={(e) => setTagFilter(e.target.value || null)}
              className="text-xs px-2 py-1.5 rounded-md border border-border bg-background"
            >
              <option value="">All tags</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {/* Trip filter */}
          {allTrips.length > 0 && (
            <select
              value={tripFilter ?? ''}
              onChange={(e) => setTripFilter(e.target.value || null)}
              className="text-xs px-2 py-1.5 rounded-md border border-border bg-background"
            >
              <option value="">All trips</option>
              {allTrips.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={14} className="mr-1" /> Add
        </Button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
            <p className="text-sm">{items.length === 0 ? 'Nothing here yet' : 'No items match your filters'}</p>
            {items.length === 0 && (
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                <Plus size={14} className="mr-1" /> Add your first item
              </Button>
            )}
          </div>
        ) : (
          /* CSS masonry — 2 cols on mobile, 3 on md, 4 on xl */
          <div className="columns-2 md:columns-3 xl:columns-4 gap-4">
            {filtered.map((item) => (
              <InspirationCard key={item.id} item={item} onDelete={load} />
            ))}
          </div>
        )}
      </div>

      <InspirationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={() => { setDialogOpen(false); load() }}
      />
    </div>
  )
}
