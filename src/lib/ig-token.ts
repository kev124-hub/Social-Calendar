// Storage and unattended refresh of the Instagram long-lived user access token.
//
// The token lasts ~60 days. Nothing about publishing works once it lapses, and a
// Vercel env var cannot be rewritten by the running app — so the live token lives
// in the `app_credentials` table (migration 006) and the publish cron refreshes it
// when it is close to expiring.
//
// Read precedence: app_credentials row → INSTAGRAM_USER_ACCESS_TOKEN env var —
// EXCEPT when the env var has changed since the app last saw it. That means Kevin
// rotated by hand, and the new env token replaces the stored one. (Before that
// rule, a stale DB row kept winning and a manual rotation did nothing.)
//
// The decisions themselves live in ig-token-policy.ts so they can be tested.

import { debugToken, exchangeLongLivedToken } from '@/lib/instagram'
import {
  REFRESH_WHEN_DAYS_LEFT,
  daysUntil,
  envTokenDecision,
  expiredWarning,
  invalidWarning,
  notExtendedWarning,
  refreshExtended,
  refreshFailingWarning,
  tokenFingerprint,
  type Warning,
} from '@/lib/ig-token-policy'
import { warnOncePerInterval } from '@/lib/warn-once'
import type { AdminClient } from '@/lib/supabase/admin'

export const IG_TOKEN_KEY = 'instagram_user_access_token'
/** Fingerprint of the env token last seen, to detect a manual rotation. */
const ENV_FINGERPRINT_KEY = 'instagram_env_token_fingerprint'

// One marker per condition, so a warning about one problem can never suppress a
// warning about a different one. Every email below is rate-limited: the cron runs
// every 5 minutes, and each of these conditions persists until a human fixes it.
/** "Cannot refresh — META_APP_ID/SECRET missing". Pre-existing key; kept as-is. */
const WARN_CANNOT_REFRESH_KEY = 'instagram_token_warning_sent_at'
/** "Stored token is invalid". */
const WARN_INVALID_KEY = 'instagram_token_invalid_warning_sent_at'
/** "Refresh call is failing and expiry is close". */
const WARN_REFRESH_FAILING_KEY = 'instagram_token_refresh_warning_sent_at'
/** "Refresh call succeeded but Meta did not move the expiry". */
const WARN_NOT_EXTENDED_KEY = 'instagram_token_not_extended_warning_sent_at'
/** "Token has expired". */
const WARN_EXPIRED_KEY = 'instagram_token_expired_warning_sent_at'

export interface IgToken {
  token: string
  expiresAt: Date | null
  source: 'db' | 'env'
}

/** Current token, or null when Instagram publishing isn't configured yet. */
export async function getIgToken(supabase: AdminClient): Promise<IgToken | null> {
  const { data: rows, error } = await supabase
    .from('app_credentials')
    .select('key, value, expires_at')
    .in('key', [IG_TOKEN_KEY, ENV_FINGERPRINT_KEY])

  // A missing app_credentials table (migration 006 not applied) must not take
  // publishing down while an env token is present — fall through to env.
  if (error) console.warn(`Could not read ${IG_TOKEN_KEY} from app_credentials: ${error.message}`)

  const stored = rows?.find((r) => r.key === IG_TOKEN_KEY)
  const storedFingerprint = rows?.find((r) => r.key === ENV_FINGERPRINT_KEY)?.value ?? null
  const envToken = process.env.INSTAGRAM_USER_ACCESS_TOKEN?.trim() || null
  const envFingerprint = envToken ? tokenFingerprint(envToken) : null

  if (!error && envToken && envFingerprint) {
    const decision = envTokenDecision({ envFingerprint, storedFingerprint })

    if (decision === 'baseline') await recordEnvFingerprint(supabase, envFingerprint)

    if (decision === 'adopt-env') {
      // Kevin rotated by hand. Store the new token with no expiry so this run's
      // maintenance asks Meta for its real expiry and records it. The fingerprint
      // is recorded only once the token is stored: otherwise a failed write would
      // mark the rotation as seen and the stale DB row would win again next run.
      console.log('INSTAGRAM_USER_ACCESS_TOKEN changed — adopting the new token.')
      try {
        await storeIgToken(supabase, envToken, null)
        await recordEnvFingerprint(supabase, envFingerprint)
      } catch (err) {
        console.warn('Could not store the new Instagram token; using it for this run only:', err)
      }
      return { token: envToken, expiresAt: null, source: 'env' }
    }
  }

  if (stored?.value) {
    return {
      token: stored.value,
      expiresAt: stored.expires_at ? new Date(stored.expires_at) : null,
      source: 'db',
    }
  }

  if (envToken) return { token: envToken, expiresAt: null, source: 'env' }

  return null
}

async function recordEnvFingerprint(supabase: AdminClient, fingerprint: string) {
  const { error } = await supabase
    .from('app_credentials')
    .upsert({ key: ENV_FINGERPRINT_KEY, value: fingerprint, expires_at: null }, { onConflict: 'key' })
  if (error) console.warn(`Could not record ${ENV_FINGERPRINT_KEY}: ${error.message}`)
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

function warn(supabase: AdminClient, markerKey: string, w: Warning) {
  return warnOncePerInterval(supabase, markerKey, w.subject, w.body)
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

  // Trust the stored expiry when we have one; otherwise ask Meta. A newly adopted
  // env token has no recorded expiry, so its first run always inspects it.
  let expiresAt = current.expiresAt
  if (!expiresAt) {
    try {
      const info = await debugToken({ token: current.token, appId, appSecret })
      if (!info.isValid) {
        await warn(supabase, WARN_INVALID_KEY, invalidWarning())
        return { status: 'error', daysLeft: null, message: 'Stored Instagram token is invalid.' }
      }
      expiresAt = info.expiresAt
      // Record what we learned so later runs skip the debug_token round trip.
      if (expiresAt) await storeIgToken(supabase, current.token, expiresAt)
      current.expiresAt = expiresAt
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Instagram token inspection failed:', message)
      return { status: 'error', daysLeft: null, message }
    }
  }

  // A null expiry here means Meta reports a non-expiring token: nothing to do.
  if (!expiresAt) return { status: 'ok', daysLeft: null }

  const daysLeft = daysUntil(expiresAt)
  if (daysLeft > REFRESH_WHEN_DAYS_LEFT) return { status: 'ok', daysLeft }

  // Past expiry, an exchange can only fail ("Session has expired"). Say plainly
  // that publishing has stopped rather than reporting a refresh error.
  if (expiresAt.getTime() <= Date.now()) {
    await warn(supabase, WARN_EXPIRED_KEY, expiredWarning())
    return { status: 'error', daysLeft, message: 'Instagram token has expired.' }
  }

  // From here on the token lapses within REFRESH_WHEN_DAYS_LEFT days, so any
  // outcome short of a real extension is worth an email — ten days' notice, not
  // four minutes after the fact.
  try {
    const refreshed = await exchangeLongLivedToken({ appId, appSecret, token: current.token })
    const newExpiry = refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000)
      : (await debugToken({ token: refreshed.token, appId, appSecret })).expiresAt

    if (!refreshExtended(expiresAt, newExpiry)) {
      // The call worked but the expiry did not move — exactly what happened on
      // 23 Sept 2026. Keep the token we have; it is no worse than the "new" one.
      await warn(supabase, WARN_NOT_EXTENDED_KEY, notExtendedWarning(daysLeft))
      return {
        status: 'expiring',
        daysLeft,
        message: `Meta did not extend the Instagram token; it still expires ${expiresAt.toISOString()}. Renew it by hand.`,
      }
    }

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
    await warn(supabase, WARN_REFRESH_FAILING_KEY, refreshFailingWarning(daysLeft, message))
    console.error('Instagram token maintenance failed:', message)
    return { status: 'error', daysLeft, message }
  }
}
