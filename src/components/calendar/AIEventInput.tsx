'use client'

import { useState, useRef } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

export interface ParsedEvent {
  title: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  location: string | null
  description: string | null
}

interface Props {
  onEventParsed: (event: ParsedEvent) => void
}

export function AIEventInput({ onEventParsed }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || loading) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const today = format(new Date(), 'MMMM d, yyyy')
      const res = await fetch('/api/claude/parse-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), today }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to parse event')

      onEventParsed(data.event)
      setText('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5 shrink-0">
      <div className="relative">
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
          className={`pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background w-36 focus:w-56 transition-all duration-200 focus:outline-none focus:ring-1 disabled:opacity-50 ${
            error
              ? 'border-destructive focus:ring-destructive'
              : success
              ? 'border-green-500 focus:ring-green-500'
              : 'border-border focus:ring-primary'
          }`}
        />
      </div>
    </form>
  )
}
