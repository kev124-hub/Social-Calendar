// Pure decisions behind Instagram token upkeep (src/lib/ig-token.ts).
//
// Deliberately free of Supabase and of the `@/` alias: tests/ig-token.test.mjs
// loads this file directly under `node --experimental-strip-types`, which
// resolves neither.
//
// Why this exists — the 23 Sept 2026 outage. The token was due to lapse on 23
// Sept; the refresh started on schedule ten days earlier, and every call to
// Meta's `fb_exchange_token` "succeeded". But each answer carried the time the
// OLD token had left, not a fresh 60 days, so the stored expiry never moved.
// The app counted every run as `refreshed`, no warning ever fired, and the first
// email arrived four minutes after publishing had already stopped. The rules
// below make that impossible to repeat quietly: a refresh only counts if the
// expiry actually moved, and anything short of that warns from ten days out.

import { createHash } from 'node:crypto'

/** Try to refresh once the remaining lifetime drops below this. */
export const REFRESH_WHEN_DAYS_LEFT = 10

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A refresh must push the expiry out by at least this much to count. Meta can
 * answer an exchange with the same token and its remaining lifetime; that is a
 * successful HTTP call and a failed refresh.
 */
const MIN_EXTENSION_MS = DAY_MS

export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.floor((date.getTime() - now.getTime()) / DAY_MS)
}

/**
 * Did a refresh actually buy more time? A null new expiry means Meta reports a
 * non-expiring token, which is as extended as it gets; a null old expiry means
 * there was nothing to compare against.
 */
export function refreshExtended(oldExpiry: Date | null, newExpiry: Date | null): boolean {
  if (!newExpiry) return true
  if (!oldExpiry) return true
  return newExpiry.getTime() - oldExpiry.getTime() >= MIN_EXTENSION_MS
}

/**
 * Short, non-reversible fingerprint of a token, so the app can tell that the
 * INSTAGRAM_USER_ACCESS_TOKEN env var changed without storing it twice.
 */
export function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex').slice(0, 16)
}

/**
 * Which token wins: the one stored in app_credentials, or the env var?
 *
 * The DB wins by default — it holds whatever the last refresh produced, which is
 * newer than the env var. But when Kevin rotates by hand he changes the env var,
 * and before this rule the stale DB row silently kept winning, so the fix the
 * warning email told him to make did nothing until he also deleted a database row.
 *
 * - `adopt-env`: the env var changed since we last saw it → Kevin rotated; use it.
 * - `baseline`: we have never recorded a fingerprint (first run of this code) →
 *   record the current one and keep the usual precedence. Guessing "rotated" here
 *   could replace a freshly refreshed DB token with an older env value.
 * - `keep`: nothing changed.
 */
export function envTokenDecision(opts: {
  envFingerprint: string | null
  storedFingerprint: string | null
}): 'adopt-env' | 'baseline' | 'keep' {
  if (!opts.envFingerprint) return 'keep'
  if (!opts.storedFingerprint) return 'baseline'
  return opts.envFingerprint === opts.storedFingerprint ? 'keep' : 'adopt-env'
}

/** The manual rotation, step by step. Appended to every token warning email. */
export const ROTATION_STEPS =
  'How to fix it (about 5 minutes):\n' +
  '1. Open Meta\'s Graph API Explorer (developers.facebook.com/tools/explorer), pick the ' +
  'Social Media Calendar app, choose "Get User Access Token", make sure the permissions ' +
  'include instagram_basic and instagram_content_publish, and click "Generate Access Token".\n' +
  '2. That token only lasts about an hour. Open it in the Access Token Debugger ' +
  '(developers.facebook.com/tools/debug/accesstoken) and click "Extend Access Token" at the ' +
  'bottom. Copy the NEW token it shows — it should expire in about 60 days.\n' +
  '3. In Vercel, set INSTAGRAM_USER_ACCESS_TOKEN to that token and redeploy.\n\n' +
  'That is all. Within about 5 minutes of the redeploy the app notices the new token and ' +
  'starts using it — there is no database step.'

export interface Warning {
  subject: string
  body: string
}

export function expiredWarning(): Warning {
  return {
    subject: 'Instagram token has expired — auto-publishing has stopped',
    body:
      'The Instagram access token has expired, so auto-publishing has stopped. ' +
      'Scheduled auto-posts will not go out until a new token is in place.\n\n' +
      ROTATION_STEPS,
  }
}

export function notExtendedWarning(daysLeft: number): Warning {
  return {
    subject: `Instagram token expires in ${daysLeft} day(s) — renew it by hand`,
    body:
      `The Instagram access token expires in ${daysLeft} day(s). The app asked Meta to renew it, ` +
      'but Meta did not extend the expiry date, so it has to be renewed by hand before then or ' +
      'auto-publishing will stop.\n\n' +
      ROTATION_STEPS,
  }
}

export function refreshFailingWarning(daysLeft: number, error: string): Warning {
  return {
    subject: `Instagram token expires in ${daysLeft} day(s) — automatic renewal is failing`,
    body:
      `The Instagram access token expires in ${daysLeft} day(s) and automatic renewal is failing:\n\n` +
      `${error}\n\n` +
      'Renew it by hand before then or auto-publishing will stop.\n\n' +
      ROTATION_STEPS,
  }
}

export function invalidWarning(): Warning {
  return {
    subject: 'Instagram token is invalid',
    body:
      'The Instagram access token is no longer valid, so auto-publishing cannot run.\n\n' +
      ROTATION_STEPS,
  }
}
