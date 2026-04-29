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
  created_at: string
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

type TableDef<Row, Insert, Update> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

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
        Omit<SocialPost, 'id' | 'created_at' | 'updated_at'>,
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
