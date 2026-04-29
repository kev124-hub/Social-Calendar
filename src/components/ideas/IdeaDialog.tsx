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
import type { Idea, Platform } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDelete: (id: string) => void
  idea: Idea | null
}

const PLATFORMS: (Platform | '')[] = ['', 'instagram', 'tiktok', 'linkedin', 'any']

export function IdeaDialog({ open, onClose, onSave, onDelete, idea }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [tripName, setTripName] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    if (idea) {
      setTitle(idea.title)
      setDescription(idea.description ?? '')
      setPlatform(idea.platform ?? '')
      setDateStart(idea.date_start ?? '')
      setDateEnd(idea.date_end ?? '')
      setTripName(idea.trip_name ?? '')
    } else {
      setTitle('')
      setDescription('')
      setPlatform('')
      setDateStart('')
      setDateEnd('')
      setTripName('')
    }
  }, [open, idea])

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)

    const payload = {
      title: title.trim(),
      description: description || null,
      platform: platform || null,
      date_start: dateStart || null,
      date_end: dateEnd || null,
      trip_name: tripName || null,
    }

    if (idea) {
      await supabase.from('ideas').update(payload).eq('id', idea.id)
    } else {
      await supabase.from('ideas').insert(payload)
    }

    setSaving(false)
    onSave()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{idea ? 'Edit Idea' : 'Capture Idea'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium block mb-1">Title *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Idea title"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="What's the idea?"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Platform target</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform | '')}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring capitalize"
            >
              <option value="">No preference</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="linkedin">LinkedIn</option>
              <option value="any">Any</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Trip / event</label>
            <input
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Monaco GP, Maldives trip…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Date / from</label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">To</label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {idea && (
            <Button variant="destructive" size="sm" onClick={() => onDelete(idea.id)}>
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
