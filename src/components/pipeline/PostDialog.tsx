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

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDelete: (id: string) => void
  post: SocialPost | null
  defaultStage: PostStage
}

const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'linkedin']
const POST_TYPES: PostType[] = ['reel', 'carousel', 'story', 'static', 'video', 'article']
const STAGES: PostStage[] = ['idea', 'scripted', 'shot', 'editing', 'scheduled', 'published']

export function PostDialog({ open, onClose, onSave, onDelete, post, defaultStage }: Props) {
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
      setScheduledAt('')
      setNotes('')
    }
  }, [open, post, defaultStage])

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
          <DialogTitle>{post ? 'Edit Post' : 'New Post'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Platform *</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring capitalize"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Type</label>
              <select
                value={postType}
                onChange={(e) => setPostType(e.target.value as PostType | '')}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring capitalize"
              >
                <option value="">Select type</option>
                {POST_TYPES.map((t) => (
                  <option key={t} value={t} className="capitalize">{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Stage</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as PostStage)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring capitalize"
            >
              {STAGES.map((s) => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Short working title"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="Write your caption here…"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Hashtags <span className="text-muted-foreground font-normal">(max 5)</span></label>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="#luxury #travel #f1"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Media link</label>
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Dropbox or Google Drive URL"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Scheduled date</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {post && (
            <Button variant="destructive" size="sm" onClick={() => onDelete(post.id)}>
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
