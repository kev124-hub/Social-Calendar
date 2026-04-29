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

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDelete: (id: string) => void
  event: CalendarEvent | null
  defaultDate: Date | null
  calendars: Calendar[]
}

function toDatetimeLocal(iso: string) {
  return iso.slice(0, 16)
}

function toDateLocal(iso: string) {
  return iso.slice(0, 10)
}

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
          <DialogTitle>{event ? 'Edit Event' : 'New Event'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium block mb-1">Title *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Event title"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="allday"
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="allday" className="text-sm font-medium">All day</label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1">Start *</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">End</label>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              placeholder="Optional"
            />
          </div>

          {calendars.length > 1 && (
            <div>
              <label className="text-sm font-medium block mb-1">Calendar</label>
              <select
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {event && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(event.id)}
            >
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
