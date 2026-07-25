// Instagram Graph API client for Content Publishing.
//
// This is the "no middleman" path that Workstream B exists for: we hand Meta a
// URL to the untouched ~2K master in Dropbox and Meta ingests those exact bytes.
// Nothing re-encodes the file before upload.
//
// Validated end-to-end by the B0 spike and re-verified in production (see
// HANDOFF.md § Stage B0). Both arms of B0 pass: the API accepts the ~2K file, and
// served quality reaches parity with a native Edits upload — though
// asynchronously. Reels serve a 720p H.264 birth encode for a transient window
// (~15 min observed in production, up to a few hours in testing), then 1080p VP9
// permanently, so schedule publishes ahead of peak-audience windows.
//
// Env: META_APP_ID, META_APP_SECRET, INSTAGRAM_USER_ID,
//      INSTAGRAM_USER_ACCESS_TOKEN (bootstrap; the live token is kept in the
//      app_credentials table once refreshed — see src/lib/ig-token.ts).

import type { PostType } from '@/types/database'

// Version used by the B0 spike. Pin it: an unpinned version silently changes
// behaviour under us on Meta's schedule.
export const GRAPH_VERSION = 'v21.0'
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`

export const CAPTION_MAX_CHARS = 2200
export const CAPTION_MAX_HASHTAGS = 30

/** Meta's documented ceiling: 50 API-published posts per rolling 24h. */
export const DAILY_PUBLISH_LIMIT = 50

export type IgMediaType = 'REELS' | 'IMAGE' | 'STORIES'
export type IgUrlField = 'video_url' | 'image_url'

export type IgContainerStatusCode =
  | 'IN_PROGRESS'
  | 'FINISHED'
  | 'ERROR'
  | 'EXPIRED'
  | 'PUBLISHED'

export class GraphApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly code?: number,
    readonly subcode?: number
  ) {
    super(message)
    this.name = 'GraphApiError'
  }
}

interface GraphErrorBody {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    error_user_msg?: string
  }
}

async function parseGraphResponse<T>(res: Response, label: string): Promise<T> {
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    if (!res.ok) throw new GraphApiError(`${label} failed (${res.status}): ${text.slice(0, 400)}`, res.status)
    throw new GraphApiError(`${label} returned non-JSON body: ${text.slice(0, 400)}`, res.status)
  }

  if (!res.ok) {
    const err = (body as GraphErrorBody).error
    // error_user_msg is the human-readable variant Meta returns for policy and
    // media-validation problems; prefer it, since it's what tells Kevin what to fix.
    const message = err?.error_user_msg || err?.message || text.slice(0, 400) || 'unknown error'
    throw new GraphApiError(`${label} failed (${res.status}): ${message}`, res.status, err?.code, err?.error_subcode)
  }

  return body as T
}

async function graphGet<T>(path: string, params: Record<string, string>, label: string): Promise<T> {
  const url = new URL(`${GRAPH}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { method: 'GET' })
  return parseGraphResponse<T>(res, label)
}

async function graphPost<T>(path: string, params: Record<string, string>, label: string): Promise<T> {
  // Form-encoded rather than query params: captions are long and can contain
  // anything, and we do not want a 2K-char caption in a URL.
  const res = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  return parseGraphResponse<T>(res, label)
}

// ---------------------------------------------------------------------------
// Caption assembly
// ---------------------------------------------------------------------------

/** Join the post's caption and hashtag fields into the single caption IG takes. */
export function buildCaption(caption: string | null, hashtags: string | null): string {
  return [caption?.trim(), hashtags?.trim()].filter(Boolean).join('\n\n')
}

/**
 * Returns a human-readable reason the caption is unpublishable, or null if it's
 * fine. Checked before creating a container so an over-long caption fails with a
 * clear message instead of an opaque Graph error.
 */
export function validateCaption(text: string): string | null {
  if (text.length > CAPTION_MAX_CHARS) {
    return `Caption is ${text.length} characters; Instagram's limit is ${CAPTION_MAX_CHARS}.`
  }
  // Unicode-aware so non-Latin hashtags count correctly.
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? []
  if (tags.length > CAPTION_MAX_HASHTAGS) {
    return `Caption has ${tags.length} hashtags; Instagram's limit is ${CAPTION_MAX_HASHTAGS}.`
  }
  return null
}

// ---------------------------------------------------------------------------
// Media type resolution
// ---------------------------------------------------------------------------

const VIDEO_EXT = /\.(mp4|mov|m4v)$/i
const IMAGE_EXT = /\.(jpg|jpeg|png)$/i
/** Extensions we can see in the Dropbox picker but Meta will not ingest. */
const UNSUPPORTED_EXT = /\.(webm|heic|heif)$/i

export type ResolvedMedia =
  | { ok: true; mediaType: IgMediaType; urlField: IgUrlField }
  | { ok: false; reason: string }

/**
 * Map a post's type + source filename onto the Graph API's media_type and URL
 * field, or explain why it can't be auto-published.
 *
 * Unsupported combinations fail loudly and permanently rather than being
 * retried — they need Kevin to switch the post to notify mode, not another
 * attempt. Notify mode is the documented permanent path for these (HANDOFF.md
 * § Key Decisions).
 */
export function resolveMediaType(postType: PostType | null, path: string): ResolvedMedia {
  if (UNSUPPORTED_EXT.test(path)) {
    return {
      ok: false,
      reason:
        `Instagram cannot ingest this file type (${path.split('.').pop()}). ` +
        `Export MP4/MOV for video or JPG/PNG for images, or use notify mode.`,
    }
  }

  const isVideo = VIDEO_EXT.test(path)
  const isImage = IMAGE_EXT.test(path)

  switch (postType) {
    case 'carousel':
      // A carousel needs 2–10 children, each its own container. social_posts
      // holds exactly one media_dropbox_path, so there is nothing to build a
      // carousel from. Supporting it means a schema change (a media array), which
      // is out of B4's scope — notify mode covers it today.
      return {
        ok: false,
        reason:
          'Carousels cannot be auto-published: a post carries a single Dropbox file and a carousel needs several. Use notify mode.',
      }

    case 'article':
      return { ok: false, reason: 'Article posts are a LinkedIn format and are not publishable to Instagram.' }

    case 'reel':
    case 'video':
      if (!isVideo) return { ok: false, reason: `A ${postType} needs an MP4/MOV video file; got "${path}".` }
      return { ok: true, mediaType: 'REELS', urlField: 'video_url' }

    case 'static':
      if (!isImage) return { ok: false, reason: `A static post needs a JPG/PNG image; got "${path}".` }
      return { ok: true, mediaType: 'IMAGE', urlField: 'image_url' }

    case 'story':
      if (isVideo) return { ok: true, mediaType: 'STORIES', urlField: 'video_url' }
      if (isImage) return { ok: true, mediaType: 'STORIES', urlField: 'image_url' }
      return { ok: false, reason: `A story needs an MP4/MOV or JPG/PNG file; got "${path}".` }

    default:
      // post_type is nullable — infer from the file itself rather than refusing.
      if (isVideo) return { ok: true, mediaType: 'REELS', urlField: 'video_url' }
      if (isImage) return { ok: true, mediaType: 'IMAGE', urlField: 'image_url' }
      return { ok: false, reason: `Cannot tell what to publish from "${path}" with no post type set.` }
  }
}

// ---------------------------------------------------------------------------
// Container lifecycle
// ---------------------------------------------------------------------------

/**
 * Step 1 of publishing: create a media container Meta will ingest asynchronously.
 * Returns the container id, which must be persisted before anything else happens —
 * losing it means we cannot resume, and a re-create would risk a double post.
 */
export async function createMediaContainer(opts: {
  igUserId: string
  accessToken: string
  mediaType: IgMediaType
  mediaUrl: string
  urlField: IgUrlField
  caption?: string
}): Promise<string> {
  const params: Record<string, string> = {
    media_type: opts.mediaType,
    [opts.urlField]: opts.mediaUrl,
    access_token: opts.accessToken,
  }

  // Stories don't carry captions; sending one is at best ignored.
  if (opts.caption && opts.mediaType !== 'STORIES') params.caption = opts.caption

  const data = await graphPost<{ id: string }>(`/${opts.igUserId}/media`, params, 'Create media container')
  if (!data.id) throw new GraphApiError('Create media container returned no container id', 200)
  return data.id
}

/** Step 2: poll ingest progress. Video containers take minutes to reach FINISHED. */
export async function getContainerStatus(
  containerId: string,
  accessToken: string
): Promise<{ statusCode: IgContainerStatusCode; detail: string | null }> {
  const data = await graphGet<{ status_code?: string; status?: string }>(
    `/${containerId}`,
    { fields: 'status_code,status', access_token: accessToken },
    'Get container status'
  )
  return {
    statusCode: (data.status_code as IgContainerStatusCode) ?? 'IN_PROGRESS',
    detail: data.status ?? null,
  }
}

/** Step 3: publish a FINISHED container. Returns the published media id. */
export async function publishContainer(opts: {
  igUserId: string
  accessToken: string
  containerId: string
}): Promise<string> {
  const data = await graphPost<{ id: string }>(
    `/${opts.igUserId}/media_publish`,
    { creation_id: opts.containerId, access_token: opts.accessToken },
    'Publish media container'
  )
  if (!data.id) throw new GraphApiError('Publish returned no media id', 200)
  return data.id
}

/** Public URL of a published post. Best-effort — a missing permalink is cosmetic. */
export async function getPermalink(mediaId: string, accessToken: string): Promise<string | null> {
  const data = await graphGet<{ permalink?: string }>(
    `/${mediaId}`,
    { fields: 'permalink', access_token: accessToken },
    'Get permalink'
  )
  return data.permalink ?? null
}

// ---------------------------------------------------------------------------
// Token maintenance
// ---------------------------------------------------------------------------

/**
 * Inspect a token to learn when it expires.
 *
 * `expires_at` is a Unix timestamp in seconds, or 0 for tokens that never expire.
 * Uses an app access token (`{app-id}|{app-secret}`) as the inspecting
 * credential, which is valid for apps inspecting their own tokens.
 */
export async function debugToken(opts: {
  token: string
  appId: string
  appSecret: string
}): Promise<{ expiresAt: Date | null; isValid: boolean; scopes: string[] }> {
  const data = await graphGet<{
    data?: { expires_at?: number; is_valid?: boolean; scopes?: string[] }
  }>(
    '/debug_token',
    { input_token: opts.token, access_token: `${opts.appId}|${opts.appSecret}` },
    'Debug token'
  )

  const info = data.data ?? {}
  return {
    expiresAt: info.expires_at && info.expires_at > 0 ? new Date(info.expires_at * 1000) : null,
    isValid: info.is_valid !== false,
    scopes: info.scopes ?? [],
  }
}

/**
 * Exchange a still-valid long-lived user token for a fresh one (~60 days).
 *
 * NOTE: unlike the container lifecycle above, this call was NOT exercised by the
 * B0 spike — the spike used a short-lived token generated by hand. It follows
 * Meta's documented `fb_exchange_token` flow for Instagram-Graph-API-via-Facebook-
 * Login apps, which is what this app's Meta app is. If Kevin's token instead came
 * from Instagram Login (an instagram.com token rather than a Facebook one), the
 * refresh endpoint is `graph.instagram.com/refresh_access_token` with
 * `grant_type=ig_refresh_token`. Verify against current Meta docs the first time
 * a real refresh runs; the worker treats a failed refresh as non-fatal and emails,
 * so a wrong guess here degrades to "Kevin rotates by hand", never to a lost post.
 */
export async function exchangeLongLivedToken(opts: {
  appId: string
  appSecret: string
  token: string
}): Promise<{ token: string; expiresIn: number | null }> {
  const data = await graphGet<{ access_token?: string; expires_in?: number }>(
    '/oauth/access_token',
    {
      grant_type: 'fb_exchange_token',
      client_id: opts.appId,
      client_secret: opts.appSecret,
      fb_exchange_token: opts.token,
    },
    'Exchange long-lived token'
  )

  if (!data.access_token) throw new GraphApiError('Token exchange returned no access_token', 200)
  return { token: data.access_token, expiresIn: data.expires_in ?? null }
}
