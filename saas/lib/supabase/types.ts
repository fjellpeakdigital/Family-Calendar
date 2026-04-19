/**
 * Hand-written types matching the Supabase schema.
 * In production you'd generate these with: supabase gen types typescript
 */

export type Plan = 'free' | 'family' | 'family_plus'
export type UserRole = 'owner' | 'member'
export type Period = 'morning' | 'afternoon' | 'evening' | 'anytime'
export type CalendarSourceProvider = 'google' | 'microsoft' | 'ics' | 'caldav'
export type ReminderChannel = 'email' | 'push'

/**
 * Calendar event returned to the client after overlay merge.
 * Shared between server (lib/google-calendar.ts) and client components.
 */
export interface CalendarEvent {
  id: string
  title: string
  start: string        // ISO datetime or date
  end: string
  allDay: boolean
  calendarId: string
  personId: string
  personName: string
  color: string
  recurringEventId: string | null
  eventKey: string                 // overlay lookup key
  attendeePersonIds:    string[]
  responsiblePersonIds: string[]
  offsetMin:            number | null
}

export interface Database {
  public: {
    PostgrestVersion: "12"
    Tables: {
      families: {
        Row: Family
        Insert: Omit<Family, 'id' | 'created_at'>
        Update: Partial<Omit<Family, 'id' | 'created_at'>>
        Relationships: []
      }
      users: {
        Row: DbUser
        Insert: Omit<DbUser, 'id' | 'created_at'>
        Update: Partial<Omit<DbUser, 'id' | 'created_at'>>
        Relationships: []
      }
      oauth_tokens: {
        Row: OAuthToken
        Insert: Omit<OAuthToken, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<OAuthToken, 'id' | 'created_at'>>
        Relationships: []
      }
      family_config: {
        Row: FamilyConfig
        Insert: Omit<FamilyConfig, 'id' | 'updated_at'>
        Update: Partial<Omit<FamilyConfig, 'id'>>
        Relationships: []
      }
      chore_completions: {
        Row: ChoreCompletion
        Insert: Omit<ChoreCompletion, 'id' | 'completed_at'>
        Update: Partial<Omit<ChoreCompletion, 'id' | 'completed_at'>>
        Relationships: []
      }
      event_series_overlay: {
        Row: EventSeriesOverlay
        Insert: Omit<EventSeriesOverlay, 'updated_at'>
        Update: Partial<Omit<EventSeriesOverlay, 'family_id' | 'recurring_event_id'>>
        Relationships: []
      }
      event_instance_overlay: {
        Row: EventInstanceOverlay
        Insert: Omit<EventInstanceOverlay, 'updated_at'>
        Update: Partial<Omit<EventInstanceOverlay, 'family_id' | 'event_key'>>
        Relationships: []
      }
      event_horizon: {
        Row: EventHorizon
        Insert: Omit<EventHorizon, 'synced_at'>
        Update: Partial<Omit<EventHorizon, 'family_id' | 'event_key'>>
        Relationships: []
      }
      reminder_sends: {
        Row: ReminderSend
        Insert: Omit<ReminderSend, 'sent_at'>
        Update: never
        Relationships: []
      }
      user_notification_prefs: {
        Row: UserNotificationPrefs
        Insert: Omit<UserNotificationPrefs, 'updated_at'>
        Update: Partial<Omit<UserNotificationPrefs, 'user_id'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      plan: Plan
      user_role: UserRole
    }
    CompositeTypes: Record<string, never>
  }
}

// ── Row types ──────────────────────────────────────────────────

export interface Family {
  id: string
  created_at: string
  stripe_customer_id: string | null
  plan: Plan
}

export interface DbUser {
  id: string
  created_at: string
  family_id: string
  email: string
  name: string | null
  role: UserRole
  person_id: string | null   // links adult user to family_config.people[].id
}

export interface OAuthToken {
  id: string
  created_at: string
  updated_at: string
  family_id: string
  google_account_email: string
  access_token_enc: string
  refresh_token_enc: string | null
  expires_at: string | null
  scopes: string | null
}

export interface FamilyConfig {
  id: string
  updated_at: string
  family_id: string
  config_json: ConfigJson
}

export interface ChoreCompletion {
  id: string
  completed_at: string
  family_id: string
  kid_person_id: string
  chore_id: string
  completed_date: string // YYYY-MM-DD
  points_earned: number
}

// ── Config shape (stored in family_config.config_json) ─────────

export interface ConfigJson {
  people: Person[]
  chores: ChoreDefinition[]
  cal_assignments: CalAssignment[]
  settings: AppSettings
  rewards: Record<string, Reward[]>   // keyed by kid person id
  points: Record<string, number>      // keyed by kid person id
}

export interface Person {
  id: string
  name: string
  type: 'adult' | 'kid'
  color: string
  emoji: string
}

export interface ChoreDefinition {
  id: string
  task: string
  days: string[]   // ['Mon','Tue',...]
  period: Period
  points: number
  kid_ids: string[] // which kids this applies to
}

export interface CalAssignment {
  calendarId: string
  calendarName: string
  accountEmail: string
  personId: string
  color: string
}

export interface AppSettings {
  location: string
  use24h: boolean
  theme: 'dark' | 'light'
  pin: string
}

export interface Reward {
  id: string
  name: string
  emoji: string
  points: number
}

// ── Phase 0 rows: event overlay, horizon, reminders ────────────

export interface EventSeriesOverlay {
  family_id: string
  recurring_event_id: string
  attendee_person_ids: string[]
  responsible_person_ids: string[]
  default_offset_min: number | null
  updated_at: string
}

export interface EventInstanceOverlay {
  family_id: string
  event_key: string   // google event id, or '<recurringId>|<originalStart>'
  attendee_person_ids: string[]
  responsible_person_ids: string[]
  offset_min: number | null
  updated_at: string
}

export interface EventHorizon {
  family_id: string
  event_key: string
  start_at: string
  end_at: string
  title_enc: string | null     // AES-256-GCM encrypted
  location_enc: string | null  // AES-256-GCM encrypted
  source_calendar_id: string
  source_provider: CalendarSourceProvider
  synced_at: string
}

export interface ReminderSend {
  family_id: string
  event_key: string
  person_id: string
  offset_min: number
  channel: ReminderChannel
  sent_at: string
}

export interface QuietHours {
  start: string  // 'HH:mm'
  end: string
}

export interface PushSubscriptionRecord {
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  created_at: string
}

export interface UserNotificationPrefs {
  user_id: string
  email_enabled: boolean
  push_enabled: boolean
  push_endpoints: PushSubscriptionRecord[]
  quiet_hours: QuietHours | null
  default_offsets: number[]   // minutes before event
  updated_at: string
}
