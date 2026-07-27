import { NextRequest, NextResponse } from 'next/server'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
].join(' ')

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin

  // `process.env.X!` is a compile-time assertion and does nothing at runtime:
  // with the variable unset this sent Google the literal string "undefined" and
  // Google answered "Error 401: invalid_client — The OAuth client was not
  // found", on Google's own domain, which reads like the app's registration is
  // broken rather than like a missing setting on this deployment. Vercel scopes
  // environment variables per environment, so a value present in Production is
  // absent from every preview unless it was added there too — exactly the case
  // that produced that page. Say which variable and where.
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    const missing = [
      !process.env.GOOGLE_CLIENT_ID && 'GOOGLE_CLIENT_ID',
      !process.env.GOOGLE_CLIENT_SECRET && 'GOOGLE_CLIENT_SECRET',
    ].filter(Boolean).join(' and ')
    return new NextResponse(
      `Google Calendar is not configured on this deployment: ${missing} ` +
        `${missing.includes('and') ? 'are' : 'is'} not set.\n\n` +
        `Vercel scopes environment variables per environment, so a value set for ` +
        `Production is not visible to preview deployments unless it is added for ` +
        `Preview as well.\n\nSet it in Vercel → Project → Settings → Environment ` +
        `Variables, then redeploy. Reconnecting cannot work until then.`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    )
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
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
