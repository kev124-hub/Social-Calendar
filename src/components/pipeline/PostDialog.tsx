'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { SocialPost, PostStage, Platform, PostType } from '@/types/database'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDelete: (id: string) => void
  post: SocialPost | null
  defaultStage: PostStage
  defaultScheduledAt?: string
}

const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'linkedin']
const POST_TYPES: PostType[] = ['reel', 'carousel', 'story', 'static', 'video', 'article']
const STAGES: PostStage[] = ['idea', 'scripted', 'shot', 'editing', 'scheduled', 'published']

const inputClass =
  'w-full px-3.5 py-2.5 rounded-[10px] border border-[#d6d6d6] bg-white text-[13px] text-[#333] focus:outline-none focus:ring-2 focus:ring-[#f1ccff] focus:border-[#f1ccff] transition-colors'

const labelClass = 'text-[13px] font-medium text-[#333] block mb-1.5 tracking-tight'

export function PostDialog({ open, onClose, onSave, onDelete, post, defaultStage, defaultScheduledAt }: Props) {
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [postType, setPostType] = useState<PostType | ''>('')
  const [stage, setStage] = useState<PostStage>(defaultStage)
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    if (post) {
      setPlatform(post.platform)
      setPostType(post.post_type ?? '')
      setStage(post.stage)
      setTitle(post.title ?? '')
      setCaption(post.caption ?? '')
      setHashtags(post.hashtags ?? '')
      setMediaUrl(post.media_url ?? '')
      setScheduledAt(post.scheduled_at ? post.scheduled_at.slice(0, 16) : '')
      setNotes(post.notes ?? '')
    } else {
      setPlatform('instagram')
      setPostType('')
      setStage(defaultStage)
      setTitle('')
      setCaption('')
      setHashtags('')
      setMediaUrl('')
      setScheduledAt(defaultScheduledAt ?? '')
      setNotes('')
    }
  }, [open, post, defaultStage, defaultScheduledAt])

  async function handleSave() {
    setSaving(true)
    const payload = {
      platform,
      post_type: postType || null,
      stage,
      title: title || null,
      caption: caption || null,
      hashtags: hashtags || null,
      media_url: mediaUrl || null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      notes: notes || null,
    }
    if (post) {
      await supabase.from('social_posts').update(payload).eq('id', post.id)
    } else {
      await supabase.from('social_posts').insert(payload)
    }
    setSaving(false)
    onSave()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-[22px] font-normal tracking-tight">
            {post ? 'Edit Post' : 'New Post'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Platform segmented control */}
          <div>
            <label className={labelClass}>Platform *</label>
            <div className="flex gap-1 flex-wrap">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-[10px] transition-colors capitalize',
                    platform === p
                      ? 'bg-[#f1ccff] text-black'
                      : 'bg-[#f5f2f0] text-[#7b7b7b] hover:text-black border border-[#d6d6d6]'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Stage segmented control */}
          <div>
            <label className={labelClass}>Stage</label>
            <div className="flex gap-1 flex-wrap">
              {STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStage(s)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-[10px] transition-colors capitalize',
                    stage === s
                      ? 'bg-[#f1ccff] text-black'
                      : 'bg-[#f5f2f0] text-[#7b7b7b] hover:text-black border border-[#d6d6d6]'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Type</label>
            <select
              value={postType}
              onChange={(e) => setPostType(e.target.value as PostType | '')}
              className={inputClass + ' capitalize'}
            >
              <option value="">Select type</option>
              {POST_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Short working title"
            />
          </div>

          <div>
            <label className={labelClass}>Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              className={inputClass + ' resize-none'}
              placeholder="Write your caption here…"
            />
          </div>

          <div>
            <label className={labelClass}>Hashtags <span className="text-[#7b7b7b] font-normal">(max 5)</span></label>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className={inputClass}
              placeholder="#luxury #travel #f1"
            />
          </div>

          <div>
            <label className={labelClass}>Media link</label>
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className={inputClass}
              placeholder="Dropbox or Google Drive URL"
            />
          </div>

          <div>
            <label className={labelClass}>Scheduled date</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputClass + ' resize-none'}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {post && (
            <Button variant="destructive" size="sm" className="rounded-[10px]" onClick={() => onDelete(post.id)}>
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-[10px]" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="rounded-[10px]" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
