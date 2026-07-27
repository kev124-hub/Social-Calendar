import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

// Stable system prompt — cached after first request
const SYSTEM_PROMPT = `You extract calendar event details from natural language text and return ONLY valid JSON.

Output a single JSON object with these fields:
- title: string (concise, required)
- starts_at: string (local wall-clock, e.g. "2026-05-22T09:00:00" or "2026-05-22")
- ends_at: string or null (same format, null if not specified)
- all_day: boolean (true for date-only events with no times)
- location: string or null
- description: string or null

Rules:
- NEVER append a timezone designator. No trailing "Z", no "+05:00", no offset of
  any kind. Times are local wall-clock readings for whoever is typing, and you do
  not know where they are — "2:30pm" must be "T14:30:00" and nothing more. A "Z"
  here silently moves the event by the user's UTC offset.
- For multi-day events without times (e.g. "May 22-25"), use all_day: true, date-only strings
- The user message states today's date AND its weekday. Both are authoritative:
  use the stated weekday as your anchor and do NOT work out for yourself which
  day of the week any date falls on. When the text names a weekday ("Saturday",
  "next Tuesday"), count forward from the stated weekday to reach it, and take
  the nearest FUTURE occurrence — today's weekday itself means one week ahead,
  never today. Getting this wrong moves the event a day while leaving the time
  looking right, which is invisible to the person typing.
- If no year given, use the next upcoming occurrence from today's date
- If no end date/time, set ends_at to null
- For all_day events, use date strings only (e.g. "2026-05-22"), not datetime strings
- Output ONLY the JSON object, no explanation, no markdown code blocks`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let text: string, today: string
  try {
    const body = await request.json()
    text = body.text?.trim()
    today = body.today
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!text) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          // `||`, not `??`: an empty string is as useless an anchor as a missing
          // one, and would send the model "Today is . Parse this event: …".
          // The fallback is the SERVER's date, which is a different day from the
          // user's either side of midnight — it carries its weekday, so the rule
          // above still holds, but the client's value is the accurate one.
          content: `Today is ${today || new Date().toDateString()}. Parse this event: ${text}`,
        },
      ],
    })

    const block = response.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type')

    const jsonMatch = block.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse event from that text')

    const event = JSON.parse(jsonMatch[0])

    if (!event.title || !event.starts_at) {
      throw new Error('Could not extract event title or date')
    }

    return NextResponse.json({ event })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Parse failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
