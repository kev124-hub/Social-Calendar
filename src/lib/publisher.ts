// Stage B4 — the Instagram publisher worker.
//
// A state machine resumed across stateless cron invocations. Meta ingests video
// asynchronously and a Reel container can take minutes to reach FINISHED, which is
// longer than a serverless function may live — so a run NEVER waits for a
// container. It advances each post by exactly one step and returns; the next run
// (every 5 minutes) picks up where this one stopped, using the container id
// persisted on the row.
//
//   pending    ─create container─▶  processing
//   processing ─poll: FINISHED──▶   publish ▶ published
//              ─poll: IN_PROGRESS▶  (leave processing, try again next run)
//              ─poll: ERROR/EXPIRED▶ retry once, else failed
//
// Invariants that matter, because a bug here means a real post silently never
// goes out — or goes out twice:
//
//   1. One container per post. A post with ig_container_id is never given a
//      second one, except deliberately on the retry path where the old container
//      is cleared first.
//   2. One publish per post. ig_media_id is written once, guarded by a fresh
//      re-read plus an `ig_media_id IS NULL` filter on the write.
//   3. Fresh Dropbox link per attempt. Temporary links live ~4h; a retry always
//      mints a new one rather than reusing a possibly-dead URL.
//   4. Never silent. Terminal failure emails Kevin.
//   5. Overlapping runs can't double-process. Posts are leased via
//      publish_locked_at, and an abandoned lease expires so nothing wedges.

import { getTemporaryLink } from '@/lib/dropbox'
import { sendNotificationEmail } from '@/lib/email'
import { getIgToken, maintainIgToken, type TokenMaintenanceResult } from '@/lib/ig-token'
import { createAdminClient, type AdminClient } from '@/lib/supabase/admin'
import {
  DAILY_PUBLISH_LIMIT,
  buildCaption,
  createMediaContainer,
  getContainerStatus,
  getPermalink,
  publishContainer,
  resolveMediaType,
  validateCaption,
} from '@/lib/instagram'
import type { SocialPost } from '@/types/database'

const DAY_MS = 24 * 60 * 60 * 1000

/** How long a lease is honoured before another run may steal it. Comfortably
 *  longer than a single run, short enough that a crash costs one cycle. */
const LOCK_TTL_MS = 10 * 60 * 1000

/** A container still IN_PROGRESS after this long is treated as failed. Meta
 *  normally finishes in minutes; the Dropbox link behind it dies at ~4h. */
const CONTAINER_STUCK_MS = 60 * 60 * 1000

/** Initial attempt + one automatic retry, per the B4 spec. */
const MAX_ATTEMPTS = 2

/** Posts advanced per run. Each does a handful of network calls; this keeps a
 *  run well inside maxDuration even in the worst case. */
const BATCH_LIMIT = 10

export type PostAction =
  | 'container_created'
  | 'published'
  | 'waiting'
  | 'retrying'
  | 'failed'
  | 'skipped'
  | 'reconciled'

export interface PostOutcome {
  postId: string
  title: string | null
  action: PostAction
  message?: string
}

export interface PublishCycleResult {
  ok: boolean
  considered: number
  created: number
  published: number
  waiting: number
  retrying: number
  failed: number
  skipped: number
  token?: TokenMaintenanceResult
  error?: string
  outcomes: PostOutcome[]
}

export interface RunOptions {
  /** Advance exactly this post, ignoring schedule and publish_mode ("Publish now"). */
  postId?: string
}

/**
 * Advance every due auto-publish post by one step.
 *
 * Resolves rather than throws for expected conditions (nothing configured,
 * nothing due, rate limit reached) so the cron endpoint can report them as data.
 */
export async function runPublishCycle(opts: RunOptions = {}): Promise<PublishCycleResult> {
  const empty: PublishCycleResult = {
    ok: true,
    considered: 0,
    created: 0,
    published: 0,
    waiting: 0,
    retrying: 0,
    failed: 0,
    skipped: 0,
    outcomes: [],
  }

  const igUserId = process.env.INSTAGRAM_USER_ID
  if (!igUserId) {
    return { ...empty, ok: false, error: 'INSTAGRAM_USER_ID is not set — Instagram publishing is not configured.' }
  }

  const supabase = createAdminClient()

  const token = await getIgToken(supabase)
  if (!token) {
    return {
      ...empty,
      ok: false,
      error:
        'No Instagram access token available — set INSTAGRAM_USER_ACCESS_TOKEN (or seed app_credentials).',
    }
  }

  // Maintenance first so a token about to lapse is renewed before we lean on it.
  // Never throws; a failure here still lets this run publish with the token we hold.
  const tokenResult = await maintainIgToken(supabase, token)

  const posts = await selectCandidates(supabase, opts)
  if (!posts.length) return { ...empty, token: tokenResult }

  // Meta allows 50 API publishes per rolling 24h — far above Kevin's volume, so a
  // simple count guard is enough. Checked once per run: a batch can't exceed it.
  const publishedToday = await countRecentPublishes(supabase)
  const budget = DAILY_PUBLISH_LIMIT - publishedToday

  const result: PublishCycleResult = { ...empty, considered: posts.length, token: tokenResult, outcomes: [] }

  if (budget <= 0) {
    result.skipped = posts.length
    result.outcomes = posts.map((p) => ({
      postId: p.id,
      title: p.title,
      action: 'skipped' as PostAction,
      message: `Instagram's ${DAILY_PUBLISH_LIMIT}-posts-per-24h publishing limit is reached; will retry next run.`,
    }))
    return result
  }

  let publishedThisRun = 0

  for (const post of posts) {
    if (publishedThisRun >= budget) {
      result.skipped++
      result.outcomes.push({
        postId: post.id,
        title: post.title,
        action: 'skipped',
        message: 'Daily publish budget exhausted mid-run; will resume next run.',
      })
      continue
    }

    let claimed = false
    try {
      claimed = await claimPost(supabase, post.id)
      if (!claimed) {
        result.skipped++
        result.outcomes.push({
          postId: post.id,
          title: post.title,
          action: 'skipped',
          message: 'Another run currently holds this post.',
        })
        continue
      }

      const outcome = await advancePost(supabase, post, { igUserId, accessToken: token.token })
      result.outcomes.push(outcome)

      switch (outcome.action) {
        case 'container_created': result.created++; break
        case 'published': result.published++; publishedThisRun++; break
        case 'waiting': result.waiting++; break
        case 'retrying': result.retrying++; break
        case 'failed': result.failed++; break
        default: result.skipped++
      }
    } catch (err) {
      // One bad post must not abort the batch — the rest of today's schedule
      // still needs to go out.
      const message = err instanceof Error ? err.message : String(err)
      console.error(`publish-posts: unexpected error on post ${post.id}:`, message)
      result.failed++
      result.outcomes.push({ postId: post.id, title: post.title, action: 'failed', message })
      try {
        await failPost(supabase, post, message)
      } catch (nested) {
        console.error(`publish-posts: could not record failure for ${post.id}:`, nested)
      }
    } finally {
      // Release unconditionally: every step either reached a terminal state or
      // wants to be retried next run. Holding a lease past the step is what
      // would wedge a post.
      if (claimed) await releaseLock(supabase, post.id)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Selection & leasing
// ---------------------------------------------------------------------------

async function selectCandidates(supabase: AdminClient, opts: RunOptions): Promise<SocialPost[]> {
  if (opts.postId) {
    // Manual "Publish now": schedule and publish_mode are deliberately ignored —
    // that's the whole point — but a post already published is never touched again.
    const { data, error } = await supabase
      .from('social_posts')
      .select('*')
      .eq('id', opts.postId)
      .is('ig_media_id', null)
      .limit(1)

    if (error) throw new Error(`Failed to load post ${opts.postId}: ${error.message}`)
    return data ?? []
  }

  const { data, error } = await supabase
    .from('social_posts')
    .select('*')
    .eq('platform', 'instagram')
    .eq('stage', 'scheduled')
    .eq('publish_mode', 'auto')
    .lte('scheduled_at', new Date().toISOString())
    // NULL publish_status is treated as pending so posts created before migration
    // 005 backfill correctly.
    .or('publish_status.is.null,publish_status.eq.pending,publish_status.eq.processing')
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) throw new Error(`Failed to select publishable posts: ${error.message}`)
  return data ?? []
}

/**
 * Take the lease on a post. Compare-and-swap: the update only matches when the
 * lease is free or stale, so of two concurrent runs exactly one gets the row back.
 */
async function claimPost(supabase: AdminClient, postId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - LOCK_TTL_MS).toISOString()

  const { data, error } = await supabase
    .from('social_posts')
    .update({ publish_locked_at: new Date().toISOString() })
    .eq('id', postId)
    // Timestamps contain dots and colons, which are separators in PostgREST's
    // or() grammar — the value must be quoted.
    .or(`publish_locked_at.is.null,publish_locked_at.lt."${staleBefore}"`)
    .select('id')

  if (error) throw new Error(`Failed to claim post ${postId}: ${error.message}`)
  return (data?.length ?? 0) > 0
}

async function releaseLock(supabase: AdminClient, postId: string) {
  const { error } = await supabase
    .from('social_posts')
    .update({ publish_locked_at: null })
    .eq('id', postId)
  // A stuck lease self-expires after LOCK_TTL_MS, so this is recoverable noise.
  if (error) console.error(`publish-posts: failed to release lock on ${postId}: ${error.message}`)
}

async function countRecentPublishes(supabase: AdminClient): Promise<number> {
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const { count, error } = await supabase
    .from('social_posts')
    .select('id', { count: 'exact', head: true })
    .not('ig_media_id', 'is', null)
    .gte('published_at', since)

  if (error) {
    // Assume zero rather than blocking: Kevin's real volume is a few posts a
    // week, so under-counting cannot realistically breach a 50/day ceiling.
    console.warn(`publish-posts: could not count recent publishes: ${error.message}`)
    return 0
  }
  return count ?? 0
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

interface IgContext {
  igUserId: string
  accessToken: string
}

async function advancePost(
  supabase: AdminClient,
  post: SocialPost,
  ig: IgContext
): Promise<PostOutcome> {
  const base = { postId: post.id, title: post.title }

  // Already live. Can happen if a previous run published but died before writing
  // the row back — reconcile instead of ever republishing.
  if (post.ig_media_id) {
    await supabase
      .from('social_posts')
      .update({
        publish_status: 'published',
        stage: 'published',
        published_at: post.published_at ?? new Date().toISOString(),
        publish_error: null,
      })
      .eq('id', post.id)
    return { ...base, action: 'reconciled', message: 'Post was already published; row reconciled.' }
  }

  if (post.platform !== 'instagram') {
    return await failAndReport(supabase, post, `Post platform is "${post.platform}", not Instagram.`)
  }

  return post.ig_container_id
    ? await pollAndPublish(supabase, post, ig)
    : await createContainer(supabase, post, ig)
}

/** pending → processing. Mints a fresh Dropbox link and creates the container. */
async function createContainer(
  supabase: AdminClient,
  post: SocialPost,
  ig: IgContext
): Promise<PostOutcome> {
  const base = { postId: post.id, title: post.title }

  if (!post.media_dropbox_path) {
    return await failAndReport(
      supabase,
      post,
      'No Dropbox media attached — attach a file from the "Ready to Post" folder before auto-publishing.'
    )
  }

  const media = resolveMediaType(post.post_type, post.media_dropbox_path)
  if (!media.ok) {
    // Unsupported format: retrying cannot help, so fail immediately without
    // burning the retry budget.
    return await failAndReport(supabase, post, media.reason)
  }

  const caption = buildCaption(post.caption, post.hashtags)
  const captionProblem = validateCaption(caption)
  if (captionProblem) return await failAndReport(supabase, post, captionProblem)

  const attempt = (post.publish_attempts ?? 0) + 1

  let containerId: string
  try {
    // Always a brand-new temporary link: Dropbox links expire in ~4h, so a link
    // minted on a previous attempt may already be dead.
    const mediaUrl = await getTemporaryLink(post.media_dropbox_path)
    containerId = await createMediaContainer({
      igUserId: ig.igUserId,
      accessToken: ig.accessToken,
      mediaType: media.mediaType,
      mediaUrl,
      urlField: media.urlField,
      caption: caption || undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Record the attempt so a hard, repeatable error can't retry forever.
    return await retryOrFail(supabase, post, attempt, `Could not create the Instagram container: ${message}`)
  }

  const { error } = await supabase
    .from('social_posts')
    .update({
      ig_container_id: containerId,
      ig_container_created_at: new Date().toISOString(),
      publish_status: 'processing',
      publish_attempts: attempt,
      publish_error: null,
    })
    .eq('id', post.id)

  if (error) {
    // The container exists at Meta but we failed to persist its id, so we can no
    // longer resume it. Fail loudly rather than risk creating a second container
    // (and a duplicate post) on the next run.
    const message =
      `Created Instagram container ${containerId} but could not save it (${error.message}). ` +
      'Not retrying automatically, to avoid publishing twice.'
    return await failAndReport(supabase, post, message)
  }

  return { ...base, action: 'container_created', message: `Container ${containerId} created; ingesting.` }
}

/** processing → published, or wait, or retry/fail. */
async function pollAndPublish(
  supabase: AdminClient,
  post: SocialPost,
  ig: IgContext
): Promise<PostOutcome> {
  const base = { postId: post.id, title: post.title }
  const containerId = post.ig_container_id!
  const attempts = post.publish_attempts ?? 0

  let statusCode: string
  let detail: string | null
  try {
    const status = await getContainerStatus(containerId, ig.accessToken)
    statusCode = status.statusCode
    detail = status.detail
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Polling failures are usually transient (rate limit, blip). Leave the post
    // in processing and look again next run rather than spending a retry.
    return { ...base, action: 'waiting', message: `Could not read container status: ${message}` }
  }

  switch (statusCode) {
    case 'FINISHED':
      return await publishFinished(supabase, post, ig, containerId)

    case 'PUBLISHED':
      // Meta already considers it published — a previous run got further than its
      // bookkeeping suggests. Reconcile; never publish again.
      await supabase
        .from('social_posts')
        .update({
          publish_status: 'published',
          stage: 'published',
          published_at: post.published_at ?? new Date().toISOString(),
          publish_error: null,
        })
        .eq('id', post.id)
      return { ...base, action: 'reconciled', message: 'Container reports PUBLISHED; row reconciled.' }

    case 'IN_PROGRESS': {
      const startedAt = post.ig_container_created_at ? new Date(post.ig_container_created_at).getTime() : null
      if (startedAt && Date.now() - startedAt > CONTAINER_STUCK_MS) {
        return await retryOrFail(
          supabase,
          post,
          attempts,
          `Container ${containerId} was still processing after ${Math.round(CONTAINER_STUCK_MS / 60000)} minutes.`
        )
      }
      return { ...base, action: 'waiting', message: `Container ${containerId} is still ingesting.` }
    }

    case 'ERROR':
    case 'EXPIRED':
    default:
      return await retryOrFail(
        supabase,
        post,
        attempts,
        `Container ${containerId} reported ${statusCode}${detail ? `: ${detail}` : ''}.`
      )
  }
}

async function publishFinished(
  supabase: AdminClient,
  post: SocialPost,
  ig: IgContext,
  containerId: string
): Promise<PostOutcome> {
  const base = { postId: post.id, title: post.title }

  // Last check immediately before the irreversible call. Combined with the lease
  // and the `ig_media_id IS NULL` filter on the write below, this is what keeps a
  // post from going out twice.
  const { data: fresh, error: freshError } = await supabase
    .from('social_posts')
    .select('ig_media_id')
    .eq('id', post.id)
    .maybeSingle()

  if (freshError) {
    return { ...base, action: 'waiting', message: `Could not re-check publish state: ${freshError.message}` }
  }
  if (fresh?.ig_media_id) {
    return { ...base, action: 'reconciled', message: 'Another run published this post first.' }
  }

  let mediaId: string
  try {
    mediaId = await publishContainer({
      igUserId: ig.igUserId,
      accessToken: ig.accessToken,
      containerId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return await retryOrFail(supabase, post, post.publish_attempts ?? 0, `Publish failed: ${message}`)
  }

  // Cosmetic — a missing permalink must not turn a successful publish into a failure.
  let permalink: string | null = null
  try {
    permalink = await getPermalink(mediaId, ig.accessToken)
  } catch (err) {
    console.warn(`publish-posts: could not fetch permalink for ${mediaId}:`, err)
  }

  const { data: written, error } = await supabase
    .from('social_posts')
    .update({
      ig_media_id: mediaId,
      ig_permalink: permalink,
      publish_status: 'published',
      stage: 'published',
      published_at: new Date().toISOString(),
      publish_error: null,
    })
    .eq('id', post.id)
    .is('ig_media_id', null)
    .select('id')

  if (error || !written?.length) {
    // The post IS live on Instagram; only our record of it is wrong. Say so
    // explicitly — this needs a human, and it must never look like a failed post
    // that should be re-published.
    const detail = error?.message ?? 'row was already updated by another run'
    const message =
      `Published to Instagram as media ${mediaId}${permalink ? ` (${permalink})` : ''}, ` +
      `but the post record could not be updated (${detail}). The post IS live — do not publish it again.`
    console.error(`publish-posts: ${message}`)
    await notify(`Instagram publish succeeded but the record did not update: ${post.title ?? 'untitled'}`, message)
    return { ...base, action: 'published', message }
  }

  return {
    ...base,
    action: 'published',
    message: `Published as ${mediaId}${permalink ? ` — ${permalink}` : ''}.`,
  }
}

// ---------------------------------------------------------------------------
// Failure handling
// ---------------------------------------------------------------------------

/**
 * Spend the retry budget, or give up.
 *
 * The retry deliberately clears ig_container_id: the next run must build a new
 * container from a freshly minted Dropbox link, because the old link may have
 * expired and the old container is in a terminal state.
 */
async function retryOrFail(
  supabase: AdminClient,
  post: SocialPost,
  attempts: number,
  reason: string
): Promise<PostOutcome> {
  const base = { postId: post.id, title: post.title }

  if (attempts < MAX_ATTEMPTS) {
    const { error } = await supabase
      .from('social_posts')
      .update({
        publish_status: 'pending',
        ig_container_id: null,
        ig_container_created_at: null,
        publish_attempts: attempts,
        publish_error: reason,
      })
      .eq('id', post.id)

    if (error) console.error(`publish-posts: failed to queue retry for ${post.id}: ${error.message}`)
    return {
      ...base,
      action: 'retrying',
      message: `${reason} Retrying with a fresh media link on the next run.`,
    }
  }

  return await failAndReport(supabase, post, `${reason} Giving up after ${attempts} attempt(s).`)
}

async function failPost(supabase: AdminClient, post: SocialPost, reason: string) {
  const { error } = await supabase
    .from('social_posts')
    .update({ publish_status: 'failed', publish_error: reason })
    .eq('id', post.id)
  if (error) console.error(`publish-posts: failed to mark ${post.id} as failed: ${error.message}`)
}

/** Terminal failure: record it and email, so a missed post is never silent. */
async function failAndReport(
  supabase: AdminClient,
  post: SocialPost,
  reason: string
): Promise<PostOutcome> {
  await failPost(supabase, post, reason)

  const scheduled = post.scheduled_at ? new Date(post.scheduled_at).toUTCString() : 'unscheduled'
  await notify(
    `Instagram auto-publish failed: ${post.title ?? 'untitled post'}`,
    `Your scheduled Instagram post did not go out.\n\n` +
      `Post: ${post.title ?? '(untitled)'}\n` +
      `Scheduled: ${scheduled}\n` +
      `Media: ${post.media_dropbox_path ?? '(none attached)'}\n\n` +
      `Reason: ${reason}\n\n` +
      `The post is marked "failed" in the pipeline and will not be retried automatically. ` +
      `Fix the issue and use "Publish now", or post it natively from Edits.`
  )

  return { postId: post.id, title: post.title, action: 'failed', message: reason }
}

async function notify(subject: string, body: string) {
  try {
    await sendNotificationEmail(subject, body)
  } catch (err) {
    console.error('publish-posts: failed to send notification email:', err)
  }
}
