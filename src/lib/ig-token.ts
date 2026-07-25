// Storage and unattended refresh of the Instagram long-lived user access token.
//
// The token lasts ~60 days. Nothing about publishing works once it lapses, and a
// Vercel env var cannot be rewritten by the running app — so the live token lives
// in the `app_credentials` table (migration 006) and the publish cron refreshes it
// when it is close to expiring.
//
// Read precedence: app_credentials row → INSTAGRAM_USER_ACCESS_TOKEN env var.
// The env var is the bootstrap value; the first successful refresh writes the DB
// row and the DB wins from then on.

import { debugToken, exchangeLongLivedToken } from '@/lib/instagram'
import { warnOncePerInterval } from '@/lib/warn-once'
import type { AdminClient } from '@/lib/supabase/admin'

export const IG_TOKEN_KEY = 'instagram_user_access_token'

// One marker per condition, so a warning about one problem can never suppress a
// warning about a different one. Every email below is rate-limited: the cron runs
// every 5 minutes, and each of these conditions persists until a human fixes it.
/** "Cannot refresh — META_APP_ID/SECRET missing". Pre-existing key; kept as-is. */
const WARN_CANNOT_REFRESH_KEY = 'instagram_token_warning_sent_at'
/** "Stored token is invalid". */
const WARN_INVALID_KEY = 'instagram_token_invalid_warning_sent_at'
/** "Refresh is failing and expiry is close". */
const WARN_REFRESH_FAILING_KEY = 'instagram_token_refresh_warning_sent_at'

/** Refresh once the remaining lifetime drops below this. */
const REFRESH_WHEN_DAYS_LEFT = 10
/** Warn Kevin by email below this, so a broken refresh can't fail silently. */
const WARN_WHEN_DAYS_LEFT = 3

const DAY_MS = 24 * 60 * 60 * 1000

export interface IgToken {
  token: string
  expiresAt: Date | null
  source: 'db' | 'env'
}

/** Current token, or null when Instagram publishing isn't configured yet. */
export async function getIgToken(supabase: AdminClient): Promise<IgToken | null> {
  const { data, error } = await supabase
    .from('app_credentials')
    .select('value, expires_at')
    .eq('key', IG_TOKEN_KEY)
    .maybeSingle()

  // A missing app_credentials table (migration 006 not applied) must not take
  // publishing down while an env token is present — fall through to env.
  if (error) console.warn(`Could not read ${IG_TOKEN_KEY} from app_credentials: ${error.message}`)

  if (data?.value) {
    return {
      token: data.value,
      expiresAt: data.expires_at ? new Date(data.expires_at) : null,
      source: 'db',
    }
  }

  const envToken = process.env.INSTAGRAM_USER_ACCESS_TOKEN
  if (envToken) return { token: envToken, expiresAt: null, source: 'env' }

  return null
}

async function storeIgToken(supabase: AdminClient, token: string, expiresAt: Date | null) {
  const { error } = await supabase.from('app_credentials').upsert(
    {
      key: IG_TOKEN_KEY,
      value: token,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    },
    { onConflict: 'key' }
  )
  if (error) throw new Error(`Failed to persist refreshed Instagram token: ${error.message}`)
}

export interface TokenMaintenanceResult {
  status: 'ok' | 'refreshed' | 'expiring' | 'skipped' | 'error'
  daysLeft: number | null
  message?: string
}

/**
 * Keep the token alive. Called at the top of each publish cron run.
 *
 * Deliberately never throws: token upkeep is maintenance, and a refresh problem
 * must not stop a post that is due right now from going out with the token we
 * still hold. Problems are reported in the return value and, when they put
 * publishing at risk, by email.
 */
export async function maintainIgToken(
  supabase: AdminClient,
  current: IgToken
): Promise<TokenMaintenanceResult> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET

  if (!appId || !appSecret) {
    // Without app credentials we can neither refresh the token NOR inspect its
    // expiry, so there is no "days left" to threshold on — this would otherwise be
    // a genuinely silent failure: publishing simply stops whenever the ~60-day
    // token lapses. Warn on a daily cadence instead of staying quiet.
    const daysLeft = current.expiresAt ? daysUntil(current.expiresAt) : null
    await warnOncePerInterval(
      supabase,
      WARN_CANNOT_REFRESH_KEY,
      'Instagram token cannot be refreshed automatically',
      'META_APP_ID and/or META_APP_SECRET are not set in Vercel, so the app cannot refresh ' +
        'the Instagram access token — or even check when it expires.\n\n' +
        'A long-lived user token lasts about 60 days. When it lapses, auto-publishing stops ' +
        'and scheduled posts will not go out.\n\n' +
        'Fix: set META_APP_ID and META_APP_SECRET in Vercel (Production) and redeploy.'
    )
    return {
      status: 'skipped',
      daysLeft,
      message: 'META_APP_ID / META_APP_SECRET not set — cannot refresh the Instagram token automatically.',
    }
  }

  try {
    // Trust the stored expiry when we have one; otherwise ask Meta. An env-sourced
    // token has no recorded expiry, so the first run always inspects it.
    let expiresAt = current.expiresAt
    if (!expiresAt) {
      const info = await debugToken({ token: current.token, appId, appSecret })
      if (!info.isValid) {
        await warnOncePerInterval(
          supabase,
          WARN_INVALID_KEY,
          'Instagram token is invalid',
          'The stored Instagram access token is no longer valid, so auto-publishing cannot run.\n\n' +
            'Generate a new long-lived token (scopes: instagram_basic, instagram_content_publish), ' +
            'set INSTAGRAM_USER_ACCESS_TOKEN in Vercel, and redeploy.'
        )
        return { status: 'error', daysLeft: null, message: 'Stored Instagram token is invalid.' }
      }
      expiresAt = info.expiresAt
      // Record what we learned so later runs skip the debug_token round trip.
      if (expiresAt) await storeIgToken(supabase, current.token, expiresAt)
    }

    // A null expiry here means Meta reports a non-expiring token: nothing to do.
    if (!expiresAt) return { status: 'ok', daysLeft: null }

    const daysLeft = daysUntil(expiresAt)
    if (daysLeft > REFRESH_WHEN_DAYS_LEFT) return { status: 'ok', daysLeft }

    const refreshed = await exchangeLongLivedToken({ appId, appSecret, token: current.token })
    const newExpiry = refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000)
      : (await debugToken({ token: refreshed.token, appId, appSecret })).expiresAt

    await storeIgToken(supabase, refreshed.token, newExpiry)
    // Mutate in place so the rest of this run uses the fresh token.
    current.token = refreshed.token
    current.expiresAt = newExpiry
    current.source = 'db'

    return {
      status: 'refreshed',
      daysLeft: newExpiry ? daysUntil(newExpiry) : null,
      message: `Instagram token refreshed; now expires ${newExpiry?.toISOString() ?? 'never'}.`,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const daysLeft = current.expiresAt ? daysUntil(current.expiresAt) : null

    // Only escalate to email when expiry is actually close. A transient refresh
    // failure 40 days out is noise; one 2 days out is an outage in waiting.
    if (daysLeft !== null && daysLeft <= WARN_WHEN_DAYS_LEFT) {
      await warnOncePerInterval(
        supabase,
        WARN_REFRESH_FAILING_KEY,
        'Instagram token refresh is failing',
        `The Instagram access token expires in ${daysLeft} day(s) and automatic refresh is failing:\n\n${message}\n\n` +
          'Generate a new long-lived token by hand and set INSTAGRAM_USER_ACCESS_TOKEN in Vercel (then redeploy), ' +
          'or auto-publishing will stop.'
      )
    }

    console.error('Instagram token maintenance failed:', message)
    return { status: 'error', daysLeft, message }
  }
}

function daysUntil(date: Date): number {
  return Math.floor((date.getTime() - Date.now()) / DAY_MS)
}

