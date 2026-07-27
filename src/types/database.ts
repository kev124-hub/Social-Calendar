export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Platform = 'instagram' | 'tiktok' | 'linkedin' | 'any'
export type PostType = 'reel' | 'carousel' | 'story' | 'static' | 'video' | 'article'
export type PostStage = 'idea' | 'scripted' | 'shot' | 'editing' | 'scheduled' | 'published'
export type UGCStage =
  | 'lead'
  | 'pitched'
  | 'negotiating'
  | 'contract_signed'
  | 'shooting'
  | 'delivered'
  | 'invoice_sent'
  | 'paid'
export type CalendarSource = 'app' | 'google' | 'tripit' | 'icloud'
export type NotificationMethod = 'email' | 'push' | 'both'
export type InspirationItemType = 'image' | 'video_link' | 'url_clip' | 'text_note' | 'file_link'
export type EntityType = 'calendar_event' | 'social_post' | 'ugc_project'

export interface Calendar {
  id: string
  name: string
  color: string
  source: CalendarSource
  external_id: string | null
  is_visible: boolean
  created_at: string
}

export interface CalendarEventRow {
  id: string
  calendar_id: string | null
  external_id: string | null
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string | null
  /**
   * IANA zone the wall clock was meant in, e.g. 'Europe/Monaco'.
   *
   * Null means unknown, and readers fall back to the viewing device's zone —
   * today's behaviour. Null is permanent, not a migration window: there is no
   * backfill, so pre-existing rows and anything outside the Google sync window
   * stay null indefinitely. Never a fixed offset; offsets move with DST.
   */
  time_zone: string | null
  all_day: boolean
  notification_at: string | null
  notification_method: NotificationMethod | null
  source: CalendarSource
  created_at: string
  updated_at: string
}

export interface CalendarEvent extends CalendarEventRow {
  calendar?: Calendar
}

export type PublishMode = 'auto' | 'notify'
export type PublishStatus = 'pending' | 'processing' | 'published' | 'failed'

export interface SocialPost {
  id: string
  platform: Platform
  post_type: PostType | null
  stage: PostStage
  title: string | null
  caption: string | null
  hashtags: string | null
  media_url: string | null
  scheduled_at: string | null
  published_at: string | null
  notes: string | null
  notification_at: string | null
  notification_method: NotificationMethod | null
  promoted_from_idea: string | null
  // Auto-publish pipeline (migration 005)
  media_dropbox_path: string | null
  publish_mode: PublishMode | null
  publish_status: PublishStatus | null
  ig_container_id: string | null
  ig_media_id: string | null
  ig_permalink: string | null
  publish_error: string | null
  // Publisher worker bookkeeping (migration 006)
  publish_locked_at: string | null
  publish_attempts: number
  ig_container_created_at: string | null
  // Notify-to-post (migration 007) — when the "time to post this" email went out.
  // NULL = not yet notified. Distinct from notification_at/notification_method
  // above, which describe when/how to notify and are unused by any code.
  notified_at: string | null
  created_at: string
  updated_at: string
}

/**
 * Server-only rotating secrets (migration 006) — currently the Instagram
 * long-lived access token, which the publish cron refreshes unattended.
 * Reachable with the service-role key only; RLS denies the browser roles.
 */
export interface AppCredential {
  key: string
  value: string
  expires_at: string | null
  updated_at: string
}

export interface UGCProject {
  id: string
  brand_name: string
  contact_name: string | null
  stage: UGCStage
  rate: number | null
  payment_method: string | null
  deliverables: string | null
  deadline: string | null
  brief_text: string | null
  brief_url: string | null
  notes: string | null
  notification_at: string | null
  notification_method: NotificationMethod | null
  created_at: string
  updated_at: string
}

export interface Inspiration {
  id: string
  type: InspirationItemType
  title: string | null
  source_url: string | null
  image_path: string | null
  notes: string | null
  tags: string[]
  trip_name: string | null
  date_start: string | null
  date_end: string | null
  clipped_via_extension: boolean
  created_at: string
}

export interface Idea {
  id: string
  title: string
  description: string | null
  platform: Platform | null
  date_start: string | null
  date_end: string | null
  trip_name: string | null
  promoted_to_post: string | null
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  entity_type: EntityType
  entity_id: string
  message: string
  send_at: string
  method: NotificationMethod
  sent: boolean
  sent_at: string | null
  created_at: string
}

/**
 * Homomorphic mapped type that re-emits a type as an anonymous object type.
 *
 * Needed because postgrest-js constrains a table's Row/Insert/Update to
 * `Record<string, unknown>`, and a TypeScript `interface` is NOT assignable to
 * that (it has no index signature) while an anonymous object type is. Without
 * this, `Database['public']` fails supabase-js's `GenericSchema` constraint, the
 * client's Schema generic resolves to `never`, and every `.update()` / `.insert()`
 * argument is rejected as "not assignable to parameter of type 'never'" — with no
 * hint that the schema type is the actual problem.
 */
type Columns<T> = { [K in keyof T]: T[K] }

type TableDef<Row, Insert, Update> = {
  Row: Columns<Row>
  Insert: Columns<Insert>
  Update: Columns<Update>
  Relationships: []
}

/**
 * Publishing columns nothing outside the publisher sets by hand: each either has
 * a database default (publish_mode → 'notify', publish_attempts → 0) or is filled
 * in by the worker as a post moves through the container lifecycle. Optional on
 * insert so creating a post never has to mention them.
 */
type PublishManagedColumn =
  | 'publish_mode'
  | 'publish_status'
  | 'ig_container_id'
  | 'ig_media_id'
  | 'ig_permalink'
  | 'publish_error'
  | 'publish_locked_at'
  | 'publish_attempts'
  | 'ig_container_created_at'
  | 'notified_at'

export interface Database {
  public: {
    Tables: {
      calendars: TableDef<
        Calendar,
        Omit<Calendar, 'id' | 'created_at'>,
        Partial<Omit<Calendar, 'id' | 'created_at'>>
      >
      calendar_events: TableDef<
        CalendarEventRow,
        Omit<CalendarEventRow, 'id' | 'created_at' | 'updated_at'>,
        Partial<Omit<CalendarEventRow, 'id' | 'created_at' | 'updated_at'>>
      >
      social_posts: TableDef<
        SocialPost,
        Omit<SocialPost, 'id' | 'created_at' | 'updated_at' | PublishManagedColumn> &
          Partial<Pick<SocialPost, PublishManagedColumn>>,
        Partial<Omit<SocialPost, 'id' | 'created_at' | 'updated_at'>>
      >
      ugc_projects: TableDef<
        UGCProject,
        Omit<UGCProject, 'id' | 'created_at' | 'updated_at'>,
        Partial<Omit<UGCProject, 'id' | 'created_at' | 'updated_at'>>
      >
      inspirations: TableDef<
        Inspiration,
        Omit<Inspiration, 'id' | 'created_at'>,
        Partial<Omit<Inspiration, 'id' | 'created_at'>>
      >
      ideas: TableDef<
        Idea,
        Omit<Idea, 'id' | 'created_at' | 'updated_at'>,
        Partial<Omit<Idea, 'id' | 'created_at' | 'updated_at'>>
      >
      notifications: TableDef<
        Notification,
        Omit<Notification, 'id' | 'created_at'>,
        Partial<Omit<Notification, 'id' | 'created_at'>>
      >
      app_credentials: TableDef<
        AppCredential,
        Omit<AppCredential, 'updated_at'> & Partial<Pick<AppCredential, 'updated_at'>>,
        Partial<Omit<AppCredential, 'key'>>
      >
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
