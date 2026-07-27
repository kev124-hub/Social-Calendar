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
import { createEvent, updateEvent } from '@/lib/events'
import { toDatetimeLocalInput, toDateInput } from '@/lib/datetime-local'
import type { CalendarEvent, Calendar } from '@/types/database'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
  // Async so a failed delete can be caught and shown in this dialog's error
  // panel rather than rejecting unhandled behind a dialog that already closed.
  onDelete: (id: string) => void | Promise<void>
  event: CalendarEvent | null
  defaultDate: Date | null
  calendars: Calendar[]
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-[10px] border border-[#d6d6d6] bg-white text-[13px] text-[#333] focus:outline-none focus:ring-2 focus:ring-[#f1ccff] focus:border-[#f1ccff] transition-colors'

const labelClass = 'text-[13px] font-medium text-[#333] block mb-1.5 tracking-tight'

// See src/lib/datetime-local.ts — these must never be `iso.slice(...)`.
const toDatetimeLocal = toDatetimeLocalInput
const toDateLocal = toDateInput

// The start/end inputs switch between type="date" and type="datetime-local"
// with the all-day toggle, but the value in state does not follow. A browser
// silently rejects a value the input's type can't parse — it blanks the field
// WITHOUT firing onChange — so state kept the old datetime string and
// `new Date('2026-07-26T14:31' + 'T00:00:00')` threw "Invalid time value"
// before the row was ever written. Convert on toggle so the two stay in step.
const asDate = (v: string) => (v ? v.slice(0, 10) : v)
const asDatetime = (v: string, time = 'T09:00') => (v && v.length <= 10 ? v + time : v)

export function EventDialog({ open, onClose, onSave, onDelete, event, defaultDate, calendars }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [calendarId, setCalendarId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Calendars un-hidden from inside this dialog. The parent reloads on save,
  // but until then its `calendars` prop still says hidden.
  const [unhidden, setUnhidden] = useState<string[]>([])

  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    setError(null)
    setUnhidden([])
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
    setError(null)
    if (!title.trim()) return setError('Give the event a title.')
    if (!startsAt) return setError('Pick a start date.')

    const starts = new Date(allDay ? asDate(startsAt) + 'T00:00:00' : startsAt)
    if (Number.isNaN(starts.getTime())) return setError('That start date is not valid.')

    let ends: Date | null = null
    if (endsAt) {
      ends = new Date(allDay ? asDate(endsAt) + 'T23:59:59' : endsAt)
      if (Number.isNaN(ends.getTime())) return setError('That end date is not valid.')
      if (ends < starts) return setError('The end is before the start.')
    }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description || null,
        location: location || null,
        starts_at: starts.toISOString(),
        ends_at: ends ? ends.toISOString() : null,
        all_day: allDay,
        calendar_id: calendarId || null,
      }
      // Both writes go through `src/lib/events.ts` — the choke point Stage 9
      // patches to push app-created events to Google. A private insert here is
      // the specific thing that would make Stage 9 miss a path.
      //
      // The helpers throw rather than returning an error, and the catch below
      // surfaces it. Both writes used to discard their result, so an RLS
      // refusal, a bad foreign key or a stale schema cache looked exactly like
      // success: the dialog closed and the event silently never appeared.
      if (event) {
        // Note the payload carries no `source`. An edit must not rewrite a
        // row's provenance — this update runs on pulled Google events too, and
        // stamping those `source: 'app'` would misfile them for Stage 9.
        await updateEvent(supabase, event.id, payload)
      } else {
        await createEvent(supabase, payload)
      }
      onSave()
    } catch (err) {
      // Load-bearing, not belt-and-braces: the helpers signal failure by
      // throwing, so this catch IS the error surface. Never fail silently.
      setError(err instanceof Error ? err.message : 'Could not save the event.')
    } finally {
      setSaving(false)
    }
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
              onChange={(e) => {
                const on = e.target.checked
                setAllDay(on)
                setStartsAt((v) => (on ? asDate(v) : asDatetime(v)))
                setEndsAt((v) => (on ? asDate(v) : asDatetime(v, 'T10:00')))
              }}
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

          {calendars.length > 0 && (
            <div>
              <label className={labelClass}>Calendar</label>
              <select
                value={calendarId}
                onChange={(e) => setCalendarId(e.target.value)}
                className={inputClass}
              >
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.name}{cal.is_visible === false && !unhidden.includes(cal.id) ? ' (hidden)' : ''}
                  </option>
                ))}
              </select>
              {/* An event saved to a hidden calendar is filtered straight back
                  out of every view (CalendarView's visibleEvents), so it looks
                  like the save silently failed. The picker used to be hidden
                  entirely when there was only one calendar, which made the
                  destination invisible as well as the consequence.
                  The un-hide button matters as much as the warning: the only
                  other visibility control lives in RightPanel, which is
                  `hidden md:flex`, so on a phone there was no way out of this
                  at all. */}
              {calendars.find((c) => c.id === calendarId)?.is_visible === false
                && !unhidden.includes(calendarId) && (
                <div className="mt-1.5 space-y-1.5">
                  <p className="text-[12px] text-[#8a4b06]">
                    This calendar is hidden, so the event won&apos;t show on the calendar
                    until you make it visible again.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-[10px]"
                    onClick={async () => {
                      const { error: showError } = await supabase
                        .from('calendars')
                        .update({ is_visible: true })
                        .eq('id', calendarId)
                      if (showError) return setError(showError.message)
                      setUnhidden((u) => [...u, calendarId])
                    }}
                  >
                    Show this calendar
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="text-[13px] text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-[10px]"
          >
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          {/* Delete is offered only for events this app owns. A synced event
              has to be deleted in the calendar it came from — `deleteEvent`
              refuses it, and offering a button whose only outcome is an error
              message is a worse way to say so than not offering it. */}
          {event && event.source !== 'app' && (
            <p className="mr-auto self-center text-[11.5px] text-[#5d5660]">
              Synced from Google — delete it there.
            </p>
          )}
          {event && event.source === 'app' && (
            <Button
              variant="destructive"
              size="sm"
              className="rounded-[10px]"
              disabled={saving}
              onClick={async () => {
                setError(null)
                setSaving(true)
                try {
                  await onDelete(event.id)
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not delete the event.')
                } finally {
                  // Must run on the success path too. The open-effect resets
                  // `error` but not `saving`, so leaving it true here would
                  // disable Save and Delete for good the next time the dialog
                  // opened. No flicker: the parent has already closed the
                  // dialog by the time a successful onDelete resolves.
                  setSaving(false)
                }
              }}
            >
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
