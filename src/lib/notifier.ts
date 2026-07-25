// Stage B5 — the notify-to-post worker.
//
// The counterpart to the auto-publish worker: for posts Kevin wants to post by
// hand (publish_mode='notify' — the schema default), this emails him at
// scheduled_at with everything needed to post from a phone in under a minute:
// the caption and hashtags ready to copy, a direct download link for the media,
// and what platform/format it was planned for.
//
// This is the path for everything the Graph API can't do or shouldn't: Stories,
// trending audio, collabs, custom covers, TikTok, LinkedIn.
//
// Unlike the publish worker it is NOT Instagram-only — notify mode is the manual
// fallback for every platform, which is the whole point of it.
//
// Two properties this file exists to guarantee:
//
//   1. Exactly one email per post. The cron runs every 5 minutes; notified_at is
//      the durable marker that stops a due post emailing 288 times a day. It is
//      written even when the email send fails, because a duplicate-free inbox is
//      worth more than a retry (the post is still visibly "scheduled" in the UI,
//      and a failed send is logged).
//   2. No burst on first deploy. Every pre-existing post defaults to
//      publish_mode='notify', so without a cutoff the first run would email about
//      every post ever scheduled in the past. Only posts due within
//      OVERDUE_GRACE_MS are notified; older ones are left untouched, not marked,
//      so rescheduling one still works.

import { getTemporaryLink } from '@/lib/dropbox'
import { sendNotificationEmail } from '@/lib/email'
import { buildCaption } from '@/lib/instagram'
import type { AdminClient } from '@/lib/supabase/admin'
import type { SocialPost } from '@/types/database'

/**
 * How overdue a post may be and still earn an email. A post due three weeks ago
 * is history, not a reminder — and this is what stops a first deploy (or a long
 * cron outage) turning the whole backlog into an inbox flood.
 */
const OVERDUE_GRACE_MS = 24 * 60 * 60 * 1000

/** Posts handled per run. Each does at most one Dropbox call plus one email. */
const BATCH_LIMIT = 10

export interface NotifyOutcome {
  postId: string
  title: string | null
  sent: boolean
  error?: string
}

export interface NotifyCycleResult {
  due: number
  sent: number
  failed: number
  outcomes: NotifyOutcome[]
}

/**
 * Email Kevin about every notify-mode post that has come due.
 *
 * Resolves rather than throws for per-post problems: one post with a dead
 * Dropbox path must not stop the rest of the day's reminders going out.
 */
export async function runNotifyCycle(supabase: AdminClient): Promise<NotifyCycleResult> {
  const now = Date.now()
  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('publish_mode', 'notify')
    .eq('stage', 'scheduled')
    .is('notified_at', null)
    .lte('scheduled_at', new Date(now).toISOString())
    .gte('scheduled_at', new Date(now - OVERDUE_GRACE_MS).toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) throw new Error(`Failed to select posts to notify about: ${error.message}`)

  const posts = data ?? []
  const result: NotifyCycleResult = { due: posts.length, sent: 0, failed: 0, outcomes: [] }

  for (const post of posts) {
    // Claim first: mark before sending so that a crash between the send and the
    // write can't produce a second email on the next run. Losing one reminder to
    // a mail outage is recoverable — the post is still sitting in the pipeline —
    // whereas a repeating email every 5 minutes is not something Kevin can stop.
    const { data: claimed, error: claimError } = await supabase
      .from('social_posts')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', post.id)
      .is('notified_at', null)
      .select('id')

    if (claimError) {
      result.failed++
      result.outcomes.push({ postId: post.id, title: post.title, sent: false, error: claimError.message })
      console.error(`send-notifications: could not claim post ${post.id}: ${claimError.message}`)
      continue
    }
    // Another run got there first.
    if (!claimed?.length) continue

    try {
      const mediaLink = await resolveMediaLink(post)
      const [subject, body] = buildNotifyEmail(post, mediaLink)
      await sendNotificationEmail(subject, body)
      result.sent++
      result.outcomes.push({ postId: post.id, title: post.title, sent: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.failed++
      result.outcomes.push({ postId: post.id, title: post.title, sent: false, error: message })
      console.error(`send-notifications: failed to email about post ${post.id}: ${message}`)
    }
  }

  return result
}

/**
 * A link Kevin can actually download the file from, or null.
 *
 * Never throws: a broken Dropbox path is a reason to send a slightly less useful
 * email, not to skip the reminder for a post that is due right now.
 */
async function resolveMediaLink(post: SocialPost): Promise<string | null> {
  if (!post.media_dropbox_path) return null
  try {
    return await getTemporaryLink(post.media_dropbox_path)
  } catch (err) {
    console.warn(`send-notifications: could not mint a Dropbox link for ${post.media_dropbox_path}:`, err)
    return null
  }
}

/** Subject + body for the reminder. Exported for testing. */
export function buildNotifyEmail(post: SocialPost, mediaLink: string | null): [string, string] {
  // "Reel for instagram" / "instagram post" — post_type is optional, and
  // "for instagram" on its own reads like a truncated sentence.
  const what = post.post_type ? `${post.post_type} for ${post.platform}` : `${post.platform} post`
  const title = post.title?.trim() || 'Untitled post'
  const subject = `Time to post: ${title}`

  const caption = buildCaption(post.caption, post.hashtags)
  const when = post.scheduled_at
    ? new Date(post.scheduled_at).toUTCString()
    : 'now'

  const lines: string[] = [
    `<strong>${escapeHtml(title)}</strong> — ${escapeHtml(what)}`,
    `Scheduled for ${escapeHtml(when)}.`,
    '',
  ]

  if (caption) {
    // Pre-wrapped so the caption survives copy/paste with its line breaks intact —
    // the entire point of the email is pasting this into the app.
    lines.push(
      'Caption (copy this):',
      `<pre style="white-space:pre-wrap;word-wrap:break-word;background:#f5f2f0;padding:12px;border-radius:8px;font-family:inherit;font-size:14px;margin:8px 0;">${escapeHtml(caption)}</pre>`
    )
  } else {
    lines.push('<em>No caption written for this post.</em>')
  }

  // The <pre> block carries its own margin, and sendNotificationEmail turns every
  // newline into a <br> — so a blank line after it stacks into a visible gap.
  const gapBeforeMedia = caption ? [] : ['']

  if (mediaLink) {
    lines.push(
      ...gapBeforeMedia,
      `<a href="${escapeHtml(mediaLink)}">Download the video/photo</a>`,
      // Dropbox temporary links last ~4 hours. Say so, rather than letting a dead
      // link look like a broken app when the email is opened the next morning.
      `<span style="color:#7b7b7b;font-size:13px;">(link works for about 4 hours — after that, open the file in Dropbox: ${escapeHtml(post.media_dropbox_path ?? '')})</span>`
    )
  } else if (post.media_dropbox_path) {
    lines.push(...gapBeforeMedia, `Media: ${escapeHtml(post.media_dropbox_path)} (couldn't generate a download link — open it in Dropbox)`)
  } else if (post.media_url) {
    lines.push(...gapBeforeMedia, `<a href="${escapeHtml(post.media_url)}">Media link</a>`)
  } else {
    lines.push(...gapBeforeMedia, '<em>No media attached to this post.</em>')
  }

  if (post.notes?.trim()) {
    lines.push('', `Notes: ${escapeHtml(post.notes.trim())}`)
  }

  lines.push(
    '',
    '<span style="color:#7b7b7b;font-size:13px;">Once it is live, move the post to “Published” in your pipeline.</span>'
  )

  return [subject, lines.join('\n')]
}

/**
 * The email body is interpolated into HTML by sendNotificationEmail, so every
 * value that came from the database has to be escaped — a caption containing
 * "<3" or an ampersand would otherwise mangle the message (or worse, since
 * captions are free text).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
