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
import type { Calendar } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDelete?: (id: string) => void
  calendar: Calendar | null
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#64748b', '#78716c',
]

export function CalendarManageDialog({ open, onClose, onSave, onDelete, calendar }: Props) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    if (calendar) {
      setName(calendar.name)
      setColor(calendar.color)
    } else {
      setName('')
      setColor('#6366f1')
    }
  }, [open, calendar])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    if (calendar) {
      await supabase.from('calendars').update({ name: name.trim(), color }).eq('id', calendar.id)
    } else {
      await supabase.from('calendars').insert({ name: name.trim(), color, source: 'app' })
    }
    setSaving(false)
    onSave()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{calendar ? 'Edit Calendar' : 'New Calendar'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium block mb-1">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Calendar name"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  style={{ backgroundColor: c, outline: color === c ? `3px solid ${c}` : undefined, outlineOffset: color === c ? '2px' : undefined }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <label className="text-xs text-muted-foreground">Custom</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-7 w-12 rounded cursor-pointer border border-input"
              />
              <span className="text-xs text-muted-foreground font-mono">{color}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {calendar && calendar.source === 'app' && onDelete && (
            <Button variant="destructive" size="sm" onClick={() => onDelete(calendar.id)}>
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
