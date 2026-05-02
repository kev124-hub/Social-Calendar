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
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDelete: (id: string) => void
  idea: Idea | null
}

const PLATFORMS: (Platform | '')[] = ['', 'instagram', 'tiktok', 'linkedin', 'any']

const inputClass =
  'w-full px-3.5 py-2.5 rounded-[10px] border border-[#d6d6d6] bg-white text-[13px] text-[#333] focus:outline-none focus:ring-2 focus:ring-[#f1ccff] focus:border-[#f1ccff] transition-colors'

const labelClass = 'text-[13px] font-medium text-[#333] block mb-1.5 tracking-tight'

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
          <DialogTitle className="font-heading text-[22px] font-normal tracking-tight">
            {idea ? 'Edit Idea' : 'Capture Idea'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className={labelClass}>Title *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Idea title"
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputClass + ' resize-none'}
              placeholder="What's the idea?"
            />
          </div>

          {/* Platform segmented control */}
          <div>
            <label className={labelClass}>Platform target</label>
            <div className="flex gap-1 flex-wrap">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p as Platform | '')}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-[10px] transition-colors capitalize',
                    platform === p
                      ? 'bg-[#f1ccff] text-black'
                      : 'bg-[#f5f2f0] text-[#7b7b7b] hover:text-black border border-[#d6d6d6]'
                  )}
                >
                  {p === '' ? 'Any' : p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Trip / event</label>
            <input
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              className={inputClass}
              placeholder="Monaco GP, Maldives trip…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Date / from</label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>To</label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {idea && (
            <Button variant="destructive" size="sm" className="rounded-[10px]" onClick={() => onDelete(idea.id)}>
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-[10px]" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="rounded-[10px]" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
