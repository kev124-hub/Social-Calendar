'use client'

import { useState, useRef, useImperativeHandle } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

export interface ParsedEvent {
  title: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string | null
  description: string | null
}

/** Imperative handle so a button elsewhere on the page can put the cursor here. */
export interface AIEventInputHandle {
  focus: () => void
}

interface Props {
  onEventParsed: (event: ParsedEvent) => void | Promise<void>
  ref?: React.Ref<AIEventInputHandle>
  /** Extra classes on the desktop form wrapper. */
  className?: string
  /**
   * Replaces the desktop input's width classes. The calendar top bar wants a
   * compact input that grows on focus; the home events panel wants one that
   * fills the panel. Passed as a replacement rather than appended because
   * Tailwind resolves conflicting widths by source order, not by specificity,
   * so appending `w-full` would not reliably win over `w-36`.
   */
  inputWidthClassName?: string
}

const DEFAULT_INPUT_WIDTH = 'w-36 focus:w-56'
/** Matches the `sm:` breakpoint that swaps the inline input for the sheet. */
const SM_QUERY = '(min-width: 640px)'

export function AIEventInput({
  onEventParsed,
  ref,
  className,
  inputWidthClassName = DEFAULT_INPUT_WIDTH,
}: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Below `sm` the inline input is `hidden` and unfocusable — the input lives
  // in the bottom sheet instead, which autofocuses when it opens. So "focus"
  // means two different things depending on width.
  useImperativeHandle(ref, () => ({
    focus() {
      if (window.matchMedia(SM_QUERY).matches) {
        inputRef.current?.focus()
      } else {
        setError(null)
        setSheetOpen(true)
      }
    },
  }), [])

  async function submit() {
    if (!text.trim() || loading) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // The WEEKDAY is not decoration — it is the anchor the model counts from.
      // Sent as "July 27, 2026" it had to work out for itself that the 27th was
      // a Monday before it could resolve "Saturday", and when it got that wrong
      // every relative weekday landed a day out with the time untouched:
      // "Saturday 8pm" stored as Friday 8pm. Naming the weekday removes the
      // arithmetic instead of hoping it comes out right.
      const today = format(new Date(), 'EEEE, MMMM d, yyyy')
      const res = await fetch('/api/claude/parse-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), today }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to parse event')

      await onEventParsed(data.event)
      setText('')
      setSuccess(true)
      setSheetOpen(false)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit()
  }

  return (
    <>
      {/* Desktop / tablet: inline input */}
      <form onSubmit={handleSubmit} className={`hidden sm:flex items-center gap-1.5 shrink-0 ${className ?? ''}`}>
        <div className="relative flex-1">
          {loading ? (
            <Loader2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin pointer-events-none" />
          ) : (
            <Sparkles size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${success ? 'text-green-500' : 'text-muted-foreground'}`} />
          )}
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); setSuccess(false) }}
            onKeyDown={(e) => e.key === 'Escape' && setText('')}
            placeholder="Add with AI…"
            disabled={loading}
            title={error ?? undefined}
            className={`pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background ${inputWidthClassName} transition-all duration-200 focus:outline-none focus:ring-1 disabled:opacity-50 ${
              error
                ? 'border-destructive focus:ring-destructive'
                : success
                ? 'border-green-500 focus:ring-green-500'
                : 'border-border focus:ring-primary'
            }`}
          />
        </div>
      </form>

      {/* Mobile: sparkle button that opens the input inside a bottom sheet */}
      <button
        type="button"
        onClick={() => { setError(null); setSheetOpen(true) }}
        aria-label="Add event with AI"
        className={`sm:hidden inline-flex items-center justify-center h-7 w-7 rounded-md border border-border bg-background transition-colors ${
          success ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Sparkles size={15} />
      </button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Add with AI</SheetTitle>
            <SheetDescription>
              Describe the event in plain language — e.g. &ldquo;Lunch with Sam next Friday at noon&rdquo;.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="px-4 pb-6 space-y-3">
            <div className="relative">
              {loading ? (
                <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin pointer-events-none" />
              ) : (
                <Sparkles size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              )}
              <input
                autoFocus
                type="text"
                value={text}
                onChange={(e) => { setText(e.target.value); setError(null); setSuccess(false) }}
                placeholder="Add with AI…"
                disabled={loading}
                className={`w-full pl-9 pr-3 py-2.5 text-base border rounded-lg bg-background focus:outline-none focus:ring-1 disabled:opacity-50 ${
                  error
                    ? 'border-destructive focus:ring-destructive'
                    : 'border-border focus:ring-primary'
                }`}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading || !text.trim()}
              className="w-full h-10 rounded-lg bg-black text-white text-sm font-medium disabled:opacity-40 transition-opacity"
            >
              {loading ? 'Adding…' : 'Add event'}
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
