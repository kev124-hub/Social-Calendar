import { NextRequest, NextResponse } from 'next/server'
import { saveGoogleTokens, listGoogleCalendars } from '@/lib/google-calendar'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(`${origin}/settings?error=google_calendar_denied`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${origin}/api/auth/callback/google-calendar`,
      grant_type: 'authorization_code',
      code,
    }),
  })

  if (!tokenRes.ok) {
    console.error('Token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${origin}/settings?error=google_calendar_token`)
  }

  const tokens = await tokenRes.json()
  await saveGoogleTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in)

  // Pre-select the primary calendar
  try {
    const calendars = await listGoogleCalendars()
    const primary = calendars.find((c) => c.primary)?.id ?? 'primary'
    await saveGoogleTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in, {
      calendar_ids: [primary],
    })
  } catch (e) {
    console.error('Failed to fetch calendars on connect:', e)
  }

  return NextResponse.redirect(`${origin}/settings?connected=google_calendar`)
}
