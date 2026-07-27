'use client'

import { useState, useEffect } from 'react'
import { toDatetimeLocalInput } from '@/lib/datetime-local'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PublishStatusBadge, derivePublishState } from '@/components/ui/PublishStatusBadge'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { SocialPost, PostStage, Platform, PostType, PublishMode } from '@/types/database'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onSave: () => void
  onDelete: (id: string) => void
  post: SocialPost | null
  defaultStage: PostStage
  defaultScheduledAt?: string
}

const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'linkedin']
const POST_TYPES: PostType[] = ['reel', 'carousel', 'story', 'static', 'video', 'article']
const STAGES: PostStage[] = ['idea', 'scripted', 'shot', 'editing', 'scheduled', 'published']
// Stages that a scheduled date auto-advances to 'scheduled' (never demote 'published')
const STAGES_BEFORE_SCHEDULED: PostStage[] = ['idea', 'scripted', 'shot', 'editing']

const inputClass =
  'w-full px-3.5 py-2.5 rounded-[10px] border border-[#d6d6d6] bg-white text-[13px] text-[#333] focus:outline-none focus:ring-2 focus:ring-[#f1ccff] focus:border-[#f1ccff] transition-colors'

const labelClass = 'text-[13px] font-medium text-[#333] block mb-1.5 tracking-tight'

type DropboxFile = { name: string; path: string; size: number; modified: string | null }

/** The publish columns the dialog reflects back, refreshed after "Publish now". */
type PublishRow = Pick<
  SocialPost,
  'platform' | 'stage' | 'publish_mode' | 'publish_status' | 'ig_media_id' | 'ig_permalink' | 'publish_error'
>

const PUBLISH_ROW_COLUMNS =
  'platform, stage, publish_mode, publish_status, ig_media_id, ig_permalink, publish_error'

/**
 * Turn one worker step into something readable.
 *
 * `autoWillFinish` is the difference between "leave it alone" and "click again":
 * the cron only picks a post back up when it is auto-mode, scheduled, and due
 * (see selectCandidates in publisher.ts). A notify-mode post that was pushed
 * manually will sit at "processing" forever unless the user clicks again.
 */
function describePublishAction(action: string, message: string | null, autoWillFinish: boolean): string {
  switch (action) {
    case 'container_created':
      return autoWillFinish
        ? 'Sent to Instagram — it is ingesting the video. The scheduler finishes this automatically within about 5 minutes.'
        : 'Sent to Instagram — it is ingesting the video. Click "Publish now" again in a minute to finish publishing it.'
    case 'published':
      return 'Published to Instagram.'
    case 'reconciled':
      return 'This post was already live on Instagram — the record has been corrected.'
    case 'waiting':
      return autoWillFinish
        ? 'Instagram is still ingesting the video. The scheduler will finish it automatically.'
        : 'Instagram is still ingesting the video. Give it a minute, then click "Publish now" again.'
    case 'retrying':
      return `${message ?? 'The attempt failed.'} It will be retried automatically.`
    case 'skipped':
      return message ?? 'Skipped this time — try again shortly.'
    case 'failed':
      return message ?? 'Publishing failed.'
    default:
      return message ?? `Publisher returned "${action}".`
  }
}

const PUBLISH_MODES: { key: PublishMode; label: string; hint: string }[] = [
  { key: 'notify', label: 'Notify me', hint: 'Emails you at the scheduled time so you can post it yourself.' },
  { key: 'auto', label: 'Auto-publish', hint: 'Posts it to Instagram automatically at the scheduled time, at full quality.' },
]

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function PostDialog({ open, onClose, onSave, onDelete, post, defaultStage, defaultScheduledAt }: Props) {
  const [platform, setPlatform] = useState<Platform>('instagram')
  const [postType, setPostType] = useState<PostType | ''>('')
  const [stage, setStage] = useState<PostStage>(defaultStage)
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Auto-publish
  const [publishMode, setPublishMode] = useState<PublishMode>('notify')
  const [publishRow, setPublishRow] = useState<PublishRow | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishNote, setPublishNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Dropbox "Ready to Post" media picker
  const [mediaDropboxPath, setMediaDropboxPath] = useState<string | null>(null)
  const [dropboxOpen, setDropboxOpen] = useState(false)
  const [dropboxFiles, setDropboxFiles] = useState<DropboxFile[]>([])
  const [dropboxLoading, setDropboxLoading] = useState(false)
  const [dropboxError, setDropboxError] = useState<string | null>(null)

  const supabase = createClient()

  async function loadDropbox() {
    setDropboxOpen(true)
    setDropboxLoading(true)
    setDropboxError(null)
    try {
      const res = await fetch('/api/dropbox/ready')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load Dropbox folder')
      setDropboxFiles(data.files ?? [])
    } catch (err) {
      setDropboxError(err instanceof Error ? err.message : 'Failed to load Dropbox folder')
    } finally {
      setDropboxLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    if (post) {
      setPlatform(post.platform)
      setPostType(post.post_type ?? '')
      setStage(post.stage)
      setTitle(post.title ?? '')
      setCaption(post.caption ?? '')
      setHashtags(post.hashtags ?? '')
      setMediaUrl(post.media_url ?? '')
      // Not `.slice(0, 16)`: scheduled_at is a timestamptz and arrives as UTC,
      // while <input type="datetime-local"> is local by definition. Slicing put
      // a UTC wall clock into a local field, and saving read it back as local —
      // moving the post by the user's UTC offset on every save, compounding,
      // with no edit required beyond opening the dialog and pressing Save.
      // Same bug as EventDialog's; a mis-scheduled post is a mis-timed publish.
      // See src/lib/datetime-local.ts. Was `.slice(0, 16)`, which shifted the
      // post by the user's UTC offset on every save. A mis-scheduled post is a
      // mis-timed publish, so this one had teeth.
      setScheduledAt(post.scheduled_at ? toDatetimeLocalInput(post.scheduled_at) : '')
      setNotes(post.notes ?? '')
      setMediaDropboxPath(post.media_dropbox_path ?? null)
      setPublishMode(post.publish_mode ?? 'notify')
      setPublishRow(post)
      setDropboxOpen(false) // collapse the picker; files refresh on next open
    } else {
      setPlatform('instagram')
      setPostType('')
      setStage(defaultStage)
      setTitle('')
      setCaption('')
      setHashtags('')
      setMediaUrl('')
      setScheduledAt(defaultScheduledAt ?? '')
      setNotes('')
      setMediaDropboxPath(null)
      setPublishMode('notify') // matches the schema default; auto is opt-in per post
      setPublishRow(null)
      setDropboxOpen(false)
    }
    setPublishNote(null)
  }, [open, post, defaultStage, defaultScheduledAt])

  // Giving a post a scheduled date advances it to the "scheduled" stage (unless
  // it's already further along), so it shows as scheduled on the calendar and
  // the auto-publish worker can pick it up.
  const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null
  const effectiveStage: PostStage =
    scheduledIso && STAGES_BEFORE_SCHEDULED.includes(stage) ? 'scheduled' : stage

  /**
   * Would the cron carry this post forward on its own? Mirrors selectCandidates
   * in publisher.ts. Evaluated on click rather than during render — it reads the
   * clock, which is not a pure thing to do while rendering.
   */
  function willCronFinish(): boolean {
    return (
      platform === 'instagram' &&
      publishMode === 'auto' &&
      effectiveStage === 'scheduled' &&
      !!scheduledIso &&
      new Date(scheduledIso).getTime() <= Date.now()
    )
  }

  /** Write the form to the DB. Returns false if the write failed. */
  async function persist(): Promise<boolean> {
    // Rescheduling into the future re-arms the notify-to-post reminder: a post
    // that came due, got its email and slipped should be reminded about again at
    // its new time. Saving a post whose time has already passed leaves the marker
    // alone, so editing a caption after the reminder can't trigger a second one.
    const reArmNotify = scheduledIso && new Date(scheduledIso).getTime() > Date.now()

    const payload = {
      platform,
      post_type: postType || null,
      stage: effectiveStage,
      title: title || null,
      caption: caption || null,
      hashtags: hashtags || null,
      media_url: mediaUrl || null,
      media_dropbox_path: mediaDropboxPath,
      publish_mode: publishMode,
      scheduled_at: scheduledIso,
      notes: notes || null,
      ...(reArmNotify ? { notified_at: null } : {}),
    }
    const { error } = post
      ? await supabase.from('social_posts').update(payload).eq('id', post.id)
      : await supabase.from('social_posts').insert(payload)
    return !error
  }

  async function handleSave() {
    setSaving(true)
    await persist()
    setSaving(false)
    onSave()
  }

  // "Publish now" — hands this one post to the same worker the cron drives.
  //
  // The worker reads the post from the database, so unsaved caption/media edits
  // would otherwise be silently ignored: save first, always. One call advances
  // the post by exactly one step (container → publish), which is why the note
  // below tells you when a second click is needed.
  async function handlePublishNow() {
    if (!post) return
    setPublishing(true)
    setPublishNote(null)

    if (!(await persist())) {
      setPublishNote({ tone: 'error', text: 'Could not save your changes, so nothing was published. Try again.' })
      setPublishing(false)
      return
    }

    try {
      const res = await fetch(`/api/posts/${post.id}/publish`, { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setPublishNote({ tone: 'error', text: data.error ?? `Publish failed (HTTP ${res.status}).` })
      } else {
        setPublishNote({
          tone: data.ok ? 'ok' : 'error',
          text: describePublishAction(data.action, data.message, willCronFinish()),
        })
      }

      // Re-read the row either way: a failed attempt still records publish_error,
      // and the badge/permalink should reflect what actually happened.
      const { data: fresh } = await supabase
        .from('social_posts')
        .select(PUBLISH_ROW_COLUMNS)
        .eq('id', post.id)
        .maybeSingle<PublishRow>()
      if (fresh) setPublishRow(fresh)
    } catch (err) {
      setPublishNote({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Publish request failed.',
      })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-[22px] font-normal tracking-tight">
            {post ? 'Edit Post' : 'New Post'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Platform segmented control */}
          <div>
            <label className={labelClass}>Platform *</label>
            <div className="flex gap-1 flex-wrap">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-[10px] transition-colors capitalize',
                    platform === p
                      ? 'bg-[#f1ccff] text-black'
                      : 'bg-[#f5f2f0] text-[#7b7b7b] hover:text-black border border-[#d6d6d6]'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Stage segmented control */}
          <div>
            <label className={labelClass}>Stage</label>
            <div className="flex gap-1 flex-wrap">
              {STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStage(s)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-[10px] transition-colors capitalize',
                    stage === s
                      ? 'bg-[#f1ccff] text-black'
                      : 'bg-[#f5f2f0] text-[#7b7b7b] hover:text-black border border-[#d6d6d6]'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Type</label>
            <select
              value={postType}
              onChange={(e) => setPostType(e.target.value as PostType | '')}
              className={inputClass + ' capitalize'}
            >
              <option value="">Select type</option>
              {POST_TYPES.map((t) => (
                <option key={t} value={t} className="capitalize">{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="Short working title"
            />
          </div>

          <div>
            <label className={labelClass}>Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              className={inputClass + ' resize-none'}
              placeholder="Write your caption here…"
            />
          </div>

          <div>
            <label className={labelClass}>Hashtags <span className="text-[#7b7b7b] font-normal">(max 5)</span></label>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              className={inputClass}
              placeholder="#luxury #travel #f1"
            />
          </div>

          <div>
            <label className={labelClass}>Media link</label>
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className={inputClass}
              placeholder="Dropbox or Google Drive URL"
            />
          </div>

          {/* Dropbox source file (used by the auto-publish worker) */}
          <div>
            <label className={labelClass}>
              Dropbox media <span className="text-[#7b7b7b] font-normal">(source file for auto-publish)</span>
            </label>
            {mediaDropboxPath ? (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] border border-[#d6d6d6] bg-[#f5f2f0]">
                <span className="text-[13px] text-[#333] truncate flex-1" title={mediaDropboxPath}>
                  {mediaDropboxPath.split('/').pop()}
                </span>
                <button
                  type="button"
                  onClick={() => setMediaDropboxPath(null)}
                  className="text-xs text-[#7b7b7b] hover:text-black shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={loadDropbox}
                className="w-full px-3.5 py-2.5 rounded-[10px] border border-dashed border-[#d6d6d6] bg-white text-[13px] text-[#7b7b7b] hover:text-black hover:border-[#bcbcbc] transition-colors"
              >
                Attach from Dropbox
              </button>
            )}

            {dropboxOpen && !mediaDropboxPath && (
              <div className="mt-2 border border-[#d6d6d6] rounded-[10px] max-h-48 overflow-y-auto divide-y divide-[#f0ede9]">
                {dropboxLoading ? (
                  <p className="px-3 py-3 text-[12px] text-[#7b7b7b]">Loading Ready to Post folder…</p>
                ) : dropboxError ? (
                  <p className="px-3 py-3 text-[12px] text-destructive">{dropboxError}</p>
                ) : dropboxFiles.length === 0 ? (
                  <p className="px-3 py-3 text-[12px] text-[#7b7b7b]">No media files in the Ready to Post folder.</p>
                ) : (
                  dropboxFiles.map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => { setMediaDropboxPath(f.path); setDropboxOpen(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#f5f2f0] transition-colors"
                    >
                      <span className="text-[13px] text-[#333] truncate flex-1">{f.name}</span>
                      <span className="text-[11px] text-[#bcbcbc] shrink-0">{formatSize(f.size)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Scheduled date</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => {
                setScheduledAt(e.target.value)
                // Reflect the auto-advance live so the Stage chip visibly moves
                if (e.target.value && STAGES_BEFORE_SCHEDULED.includes(stage)) setStage('scheduled')
              }}
              className={inputClass}
            />
          </div>

          {/* Publishing — mode, live status, and the manual trigger */}
          {platform === 'instagram' && (
            <div className="rounded-[10px] border border-[#d6d6d6] bg-[#fafafa] p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className={labelClass + ' mb-0'}>Publishing</label>
                {publishRow && <PublishStatusBadge post={publishRow} />}
              </div>

              <div className="flex gap-1">
                {PUBLISH_MODES.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setPublishMode(m.key)}
                    title={m.hint}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium rounded-[10px] transition-colors',
                      publishMode === m.key
                        ? 'bg-[#f1ccff] text-black'
                        : 'bg-white text-[#7b7b7b] hover:text-black border border-[#d6d6d6]'
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[12px] text-[#7b7b7b] leading-snug">
                {PUBLISH_MODES.find((m) => m.key === publishMode)?.hint}
              </p>

              {/* Auto-publish without a source file fails at container creation, so
                  say so here rather than by email at the scheduled time. */}
              {publishMode === 'auto' && !mediaDropboxPath && (
                <p className="text-[12px] text-[#b45309] leading-snug">
                  Attach a Dropbox file above — auto-publish has nothing to upload without one.
                </p>
              )}
              {publishMode === 'auto' && !scheduledAt && (
                <p className="text-[12px] text-[#b45309] leading-snug">
                  Set a scheduled date — auto-publish only picks up posts that are due.
                </p>
              )}

              {publishRow?.ig_permalink && (
                <a
                  href={publishRow.ig_permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-[#8b3fb0] hover:underline"
                >
                  View on Instagram
                  <ExternalLink size={11} />
                </a>
              )}

              {publishRow?.publish_error && derivePublishState(publishRow) !== 'published' && (
                <p className="text-[12px] text-destructive leading-snug break-words">
                  {publishRow.publish_error}
                </p>
              )}

              {publishNote && (
                <p
                  className={cn(
                    'text-[12px] leading-snug break-words',
                    publishNote.tone === 'ok' ? 'text-[#15803d]' : 'text-destructive'
                  )}
                >
                  {publishNote.text}
                </p>
              )}

              {post && (
                publishRow?.ig_media_id ? (
                  <p className="text-[12px] text-[#7b7b7b] leading-snug">
                    Already live on Instagram — it can&apos;t be published again.
                  </p>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-[10px] w-full"
                    onClick={handlePublishNow}
                    disabled={publishing || saving}
                  >
                    {publishing ? 'Publishing…' : 'Publish now'}
                  </Button>
                )
              )}
              {!post && (
                <p className="text-[12px] text-[#7b7b7b] leading-snug">
                  Save the post to enable &ldquo;Publish now&rdquo;.
                </p>
              )}
            </div>
          )}

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputClass + ' resize-none'}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {post && (
            <Button variant="destructive" size="sm" className="rounded-[10px]" onClick={() => onDelete(post.id)}>
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-[10px]" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="rounded-[10px]" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
