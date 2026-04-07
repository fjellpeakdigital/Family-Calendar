/**
 * Hand-written types matching the Supabase schema.
 * In production you'd generate these with: supabase gen types typescript
 */

export type Plan = 'free' | 'family' | 'family_plus'
export type UserRole = 'owner' | 'member'
export type Period = 'morning' | 'afternoon' | 'evening' | 'anytime'

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
