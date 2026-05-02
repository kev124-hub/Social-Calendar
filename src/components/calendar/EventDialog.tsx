'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { CalendarEvent, Calendar } from '@/types/database'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDelete: (id: string) => void
  event: CalendarEvent | null
  defaultDate: Date | null
  calendars: Calendar[]
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-[10px] border border-[#d6d6d6] bg-white text-[13px] text-[#333] focus:outline-none focus:ring-2 focus:ring-[#f1ccff] focus:border-[#f1ccff] transition-colors'

const labelClass = 'text-[13px] font-medium text-[#333] block mb-1.5 tracking-tight'

function toDatetimeLocal(iso: string) { return iso.slice(0, 16) }
function toDateLocal(iso: string) { return iso.slice(0, 10) }

export function EventDialog({ open, onClose, onSave, onDelete, event, defaultDate, calendars }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [calendarId, setCalendarId] = useState('')
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    if (event) {
      setTitle(event.title)
      setDescription(event.description ?? '')
      setLocation(event.location ?? '')
      setStartsAt(event.all_day ? toDateLocal(event.starts_at) : toDatetimeLocal(event.starts_at))
      setEndsAt(event.ends_at ? (event.all_day ? toDateLocal(event.ends_at) : toDatetimeLocal(event.ends_at)) : '')
      setAllDay(event.all_day)
      setCalendarId(event.calendar_id ?? calendars[0]?.id ?? '')
    } else {
      setTitle('')
      setDescription('')
      setLocation('')
      const d = defaultDate ?? new Date()
      setStartsAt(format(d, "yyyy-MM-dd'T'HH:mm"))
      setEndsAt('')
      setAllDay(false)
      setCalendarId(calendars[0]?.id ?? '')
    }
  }, [open, event, defaultDate, calendars])

  async function handleSave() {
    if (!title.trim() || !startsAt) return
    setSaving(true)
    const payload = {
      title: title.trim(),
      description: description || null,
      location: location || null,
      starts_at: allDay ? new Date(startsAt + 'T00:00:00').toISOString() : new Date(startsAt).toISOString(),
      ends_at: endsAt ? (allDay ? new Date(endsAt + 'T23:59:59').toISOString() : new Date(endsAt).toISOString()) : null,
      all_day: allDay,
      calendar_id: calendarId || null,
      source: 'app' as const,
    }
    if (event) {
      await supabase.from('calendar_events').update(payload).eq('id', event.id)
    } else {
      await supabase.from('calendar_events').insert(payload)
    }
    setSaving(false)
    onSave()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-[22px] font-normal tracking-tight">
            {event ? 'Edit Event' : 'New Event'}
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
              placeholder="Event title"
            />
          </div>

          {/* All-day toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="sr-only"
            />
            <div className={cn(
              'w-9 h-5 rounded-full transition-colors relative',
              allDay ? 'bg-[#f1ccff]' : 'bg-[#d6d6d6]'
            )}>
              <div className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform',
                allDay ? 'translate-x-4' : 'translate-x-0.5'
              )} />
            </div>
            <span className="text-[13px] font-medium text-[#333] tracking-tight">All day</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Start *</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>End</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
              placeholder="Optional"
            />
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={inputClass + ' resize-none'}
              placeholder="Optional"
            />
          </div>

          {calendars.length > 1 && (
            <div>
              <label className={labelClass}>Calendar</label>
              <select
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                className={inputClass}
              >
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>{cal.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {event && (
            <Button variant="destructive" size="sm" className="rounded-[10px]" onClick={() => onDelete(event.id)}>
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
