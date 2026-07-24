// Server-side Dropbox client for Kevin's own Business account (no user-facing
// OAuth). A long-lived refresh token is exchanged for short-lived access tokens;
// the app only needs files.metadata.read (list) + files.content.read (temp links).
//
// Env: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN,
//      DROPBOX_READY_FOLDER (optional, defaults to "/Social Calendar/Ready to Post").

const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token'
const API = 'https://api.dropboxapi.com/2'

const READY_FOLDER = (process.env.DROPBOX_READY_FOLDER ?? '/Social Calendar/Ready to Post').replace(/\/+$/, '')

// Video/media extensions we surface in the picker (Reels/feed sources).
const MEDIA_EXT = /\.(mp4|mov|m4v|webm|jpg|jpeg|png|heic|heif)$/i

export interface DropboxFile {
  name: string
  path: string // path_lower — stable id used for get_temporary_link
  size: number
  modified: string | null
}

// Cache the access token across warm-lambda invocations; refresh a little early.
let cachedToken: { token: string; expiresAt: number } | null = null

function requiredEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set — Dropbox integration is not configured`)
  return v
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token

  const appKey = requiredEnv('DROPBOX_APP_KEY')
  const appSecret = requiredEnv('DROPBOX_APP_SECRET')
  const refreshToken = requiredEnv('DROPBOX_REFRESH_TOKEN')

  const basic = Buffer.from(`${appKey}:${appSecret}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    throw new Error(`Dropbox token refresh failed (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    token: data.access_token,
    // Refresh 5 min before actual expiry to avoid mid-request expiry.
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  }
  return cachedToken.token
}

async function dropboxRpc<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Dropbox ${path} failed (${res.status}): ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

interface ListFolderEntry {
  '.tag': 'file' | 'folder' | 'deleted'
  name: string
  path_lower: string
  size?: number
  server_modified?: string
}

/**
 * List media files in the "Ready to Post" folder, newest first. Paginates
 * through Dropbox's cursor so large folders are fully covered.
 */
export async function listReadyFolder(): Promise<DropboxFile[]> {
  const entries: ListFolderEntry[] = []

  let page = await dropboxRpc<{ entries: ListFolderEntry[]; cursor: string; has_more: boolean }>(
    '/files/list_folder',
    { path: READY_FOLDER, recursive: false, limit: 200 }
  )
  entries.push(...page.entries)

  while (page.has_more) {
    page = await dropboxRpc<{ entries: ListFolderEntry[]; cursor: string; has_more: boolean }>(
      '/files/list_folder/continue',
      { cursor: page.cursor }
    )
    entries.push(...page.entries)
  }

  return entries
    .filter((e) => e['.tag'] === 'file' && MEDIA_EXT.test(e.name))
    .map((e) => ({
      name: e.name,
      path: e.path_lower,
      size: e.size ?? 0,
      modified: e.server_modified ?? null,
    }))
    .sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? ''))
}

/**
 * Mint a temporary direct-download URL for a file (valid ~4 hours). This is the
 * exact-bytes URL the IG Graph API ingests — no re-encoding middleman.
 */
export async function getTemporaryLink(path: string): Promise<string> {
  const data = await dropboxRpc<{ link: string }>('/files/get_temporary_link', { path })
  return data.link
}

export { READY_FOLDER }
