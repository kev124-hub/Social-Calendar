import { NextRequest, NextResponse } from 'next/server'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
].join(' ')

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/auth/callback/google-calendar`,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',  // force consent to always get refresh_token
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  )
}
