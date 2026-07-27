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
import { formatInZone, instantFromLocalInput, dayEndInZone, offsetLabel } from '@/lib/zoned-time'
import { ZonePicker } from './ZonePicker'
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

// This dialog no longer routes through src/lib/datetime-local.ts: every value it
// shows or reads is now tied to an explicit zone, which those helpers have no
// parameter for. PostDialog still uses them, and should — `scheduled_at` is an
// absolute instant by ruling, so its inputs really are device-local.

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
  // The zone picked in this dialog, and whether it was picked at all.
  //
  // `zoneTouched` is the whole safety mechanism. An untouched dialog writes NO
  // `time_zone` — so a null row stays null, per the no-backfill ruling, and
  // looking at an event cannot pin it to wherever the reader happened to be.
  // A dialog that writes a value nobody typed is the drift bug this workstream
  // began with; this is that bug's shape in a new field.
  const [zone, setZone] = useState<string | null>(null)
  const [zoneTouched, setZoneTouched] = useState(false)

  // Calendars un-hidden from inside this dialog. The parent reloads on save,
  // but until then its `calendars` prop still says hidden.
  const [unhidden, setUnhidden] = useState<string[]>([])

  const supabase = createClient()

  useEffect(() => {
    if (!open) return
    setError(null)
    setUnhidden([])
    setZoneTouched(false)
    setZone(event?.time_zone ?? null)
    if (event) {
      setTitle(event.title)
      setDescription(event.description ?? '')
      setLocation(event.location ?? '')
      // Prefilled in the EVENT's zone, and read back in it on save below. The
      // two must move together: showing 8:00 PM Monaco and then reading it as
      // 8:00 PM device would write 2:00 AM Monaco — an event moved by opening a
      // dialog and pressing Save, which is the exact bug this workstream began
      // with. A NEW event still takes the device's zone below, because that is
      // genuinely where it is being typed.
      setStartsAt(
        event.all_day
          ? formatInZone(event.starts_at, event.time_zone, 'yyyy-MM-dd')
          : formatInZone(event.starts_at, event.time_zone, "yyyy-MM-dd'T'HH:mm")
      )
      setEndsAt(
        event.ends_at
          ? event.all_day
            ? formatInZone(event.ends_at, event.time_zone, 'yyyy-MM-dd')
            : formatInZone(event.ends_at, event.time_zone, "yyyy-MM-dd'T'HH:mm")
          : ''
      )
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

  /**
   * The zone the inputs are being read in — a pick if there was one, otherwise
   * the event's own, otherwise the device's.
   *
   * Deliberately the same value in both directions, and the reason changing the
   * zone does what you would want: the entered wall clock is KEPT and reinterpreted
   * in the new zone. Sitting in New York in October typing 8pm for a Monaco
   * dinner in May, then setting the zone to Monaco, gives 8pm Monaco — the whole
   * motivating case for this feature. The instant moves; the 8 does not, because
   * the 8 is what was meant.
   *
   * The alternative — holding the instant and letting the display change — would
   * turn that same act into "you typed 8pm, we stored 2am", which is what option
   * 2 in the plan was rejected for doing.
   */
  const effectiveZone = zoneTouched ? zone : (event?.time_zone ?? null)

  /**
   * The instant the picker computes its offsets and preview times at.
   *
   * The event's own start where there is a usable one, because an offset is a
   * function of the date — picking `Europe/Monaco` for a May event should read
   * GMT+2, not the GMT+1 it is in January. Falls back to now while the field is
   * empty or half-typed, which is the only honest answer at that point.
   */
  const zoneAnchorISO = (() => {
    if (startsAt) {
      try {
        return instantFromLocalInput(allDay ? startsAt.slice(0, 10) : startsAt, effectiveZone)
      } catch {
        // Half-typed date; fall through.
      }
    }
    return new Date().toISOString()
  })()

  // What the times on screen mean, when that is not the reader's own clock.
  // Computed from the instant Save WOULD write, not from the stored one, so it
  // stays truthful as the date or the zone is changed — including across a DST
  // boundary, where the offset for the same zone is not the same all year.
  const zoneNote = (() => {
    if (!effectiveZone || !startsAt) return null
    let at: string
    try {
      at = instantFromLocalInput(allDay ? startsAt.slice(0, 10) : startsAt, effectiveZone)
    } catch {
      return null   // Mid-edit and unparseable; the note is not the place to complain.
    }
    const label = offsetLabel(at, effectiveZone)
    if (!label) return null
    return allDay
      ? `Times in ${effectiveZone} (${label})`
      : `Times in ${effectiveZone} (${label}) · ${formatInZone(at, null, 'h:mm a')} your time`
  })()

  async function handleSave() {
    setError(null)
    if (!title.trim()) return setError('Give the event a title.')
    if (!startsAt) return setError('Pick a start date.')

    let startsISO: string
    try {
      startsISO = allDay
        ? instantFromLocalInput(asDate(startsAt), effectiveZone)
        : instantFromLocalInput(startsAt, effectiveZone)
    } catch {
      return setError('That start date is not valid.')
    }

    let endsISO: string | null = null
    if (endsAt) {
      try {
        endsISO = allDay
          ? dayEndInZone(asDate(endsAt), effectiveZone)
          : instantFromLocalInput(endsAt, effectiveZone)
      } catch {
        return setError('That end date is not valid.')
      }
      if (endsISO < startsISO) return setError('The end is before the start.')
    }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description || null,
        location: location || null,
        starts_at: startsISO,
        ends_at: endsISO,
        all_day: allDay,
        calendar_id: calendarId || null,
        // Present ONLY when the picker was used. Omitted, `createEvent` stamps
        // the device zone for a new event and `updateEvent` leaves an existing
        // row's zone exactly as it was — including null.
        ...(zoneTouched && zone ? { time_zone: zone } : {}),
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

          {/* Above `location`, which stays free text: deriving a zone from "the
              Hotel de Paris" would need geocoding and would be wrong about as
              often as it was right. */}
          <div>
            <label className={labelClass} htmlFor="event-zone">Time zone</label>
            <ZonePicker
              id="event-zone"
              value={zone}
              onChange={(z) => { setZone(z); setZoneTouched(true) }}
              // Offsets are shown for the event's own date, so a May Monaco
              // event reads GMT+2 and a January one GMT+1. Falls back to now
              // only while the input is empty or mid-edit.
              atISO={zoneAnchorISO}
            />
            {zoneNote && (
              <p className="mt-1.5 text-[12px] text-[#666] tracking-tight">{zoneNote}</p>
            )}
            {!zone && (
              <p className="mt-1.5 text-[12px] text-[#888] tracking-tight">
                No zone set, so this event reads in whatever zone your device is on.
                Choosing one pins it.
              </p>
            )}
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
