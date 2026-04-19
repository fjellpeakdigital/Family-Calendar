-- ============================================================
--  Family Dashboard — Supabase Schema
--  Run this in the Supabase SQL editor or via supabase db push
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── Enums ─────────────────────────────────────────────────────
create type plan as enum ('free', 'family', 'family_plus');
create type user_role as enum ('owner', 'member');

-- ── families ──────────────────────────────────────────────────
create table families (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  stripe_customer_id  text unique,
  plan                plan not null default 'free'
);

-- ── users ─────────────────────────────────────────────────────
-- We store email as plain text for lookups, but never store
-- Google profile photos or any inferred PII.
create table users (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  family_id   uuid not null references families(id) on delete cascade,
  email       text not null unique,
  name        text,              -- only what the user explicitly enters
  role        user_role not null default 'owner'
);

create index users_family_id_idx on users(family_id);

-- ── oauth_tokens ───────────────────────────────────────────────
-- Tokens are AES-256-GCM encrypted at the application layer
-- before being stored here. Even a DB breach yields no usable tokens.
-- Multi-provider: the same family can connect google + microsoft + ...
create table oauth_tokens (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  family_id             uuid not null references families(id) on delete cascade,
  provider              text not null default 'google',
  account_email         text not null,
  access_token_enc      text not null,       -- AES-256-GCM encrypted
  refresh_token_enc     text,                -- AES-256-GCM encrypted
  expires_at            timestamptz,
  scopes                text,

  unique (family_id, provider, account_email)
);

create index oauth_tokens_family_id_idx on oauth_tokens(family_id);

-- Auto-update updated_at on token refresh
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger oauth_tokens_updated_at
  before update on oauth_tokens
  for each row execute function update_updated_at();

-- ── family_config ──────────────────────────────────────────────
-- Stores people definitions, chore definitions, calendar assignments,
-- and app settings. Does NOT store calendar event content.
create table family_config (
  id          uuid primary key default gen_random_uuid(),
  updated_at  timestamptz not null default now(),
  family_id   uuid not null unique references families(id) on delete cascade,
  config_json jsonb not null default '{}'::jsonb
);

create trigger family_config_updated_at
  before update on family_config
  for each row execute function update_updated_at();

-- ── chore_completions ──────────────────────────────────────────
-- Per-day completion records. Auto-purged after 30 days.
-- We never store the chore title here — only the chore_id reference
-- (the title lives in family_config.config_json).
create table chore_completions (
  id              uuid primary key default gen_random_uuid(),
  completed_at    timestamptz not null default now(),
  family_id       uuid not null references families(id) on delete cascade,
  kid_person_id   text not null,   -- person.id from config_json
  chore_id        text not null,   -- chore.id from config_json
  completed_date  date not null,   -- YYYY-MM-DD (for idempotent upsert)
  points_earned   integer not null default 0,

  unique (family_id, kid_person_id, chore_id, completed_date)
);

create index chore_completions_family_date_idx
  on chore_completions(family_id, completed_date);

-- Auto-purge completions older than 30 days (free) / 90 days (family+)
-- This is triggered by a pg_cron job or a Supabase Edge Function on a schedule.
-- For now, keep a simple delete-by-age function:
create or replace function purge_old_chore_completions()
returns void language plpgsql as $$
begin
  -- Free plan: 14-day history
  delete from chore_completions cc
  using families f
  where cc.family_id = f.id
    and f.plan = 'free'
    and cc.completed_date < current_date - interval '14 days';

  -- Family plan: 90-day history
  delete from chore_completions cc
  using families f
  where cc.family_id = f.id
    and f.plan in ('family', 'family_plus')
    and cc.completed_date < current_date - interval '90 days';
end;
$$;

-- ============================================================
--  Row Level Security
--  Every table is locked to the authenticated user's family.
--  We use a helper function that reads family_id from the
--  users table keyed by the NextAuth session email.
-- ============================================================

-- Helper: resolve family_id for the calling session
-- Called as: auth_family_id()
-- We store the email in the Supabase JWT claim via the server client.
create or replace function auth_family_id()
returns uuid language sql stable security definer as $$
  select family_id
  from users
  where email = current_setting('request.jwt.claims', true)::json->>'email'
  limit 1;
$$;

-- ── Enable RLS on all tables ───────────────────────────────────
alter table families          enable row level security;
alter table users             enable row level security;
alter table oauth_tokens      enable row level security;
alter table family_config     enable row level security;
alter table chore_completions enable row level security;

-- ── families policies ─────────────────────────────────────────
create policy "families: own row only"
  on families for all
  using (id = auth_family_id());

-- ── users policies ────────────────────────────────────────────
create policy "users: own family only"
  on users for all
  using (family_id = auth_family_id());

-- ── oauth_tokens policies ──────────────────────────────────────
create policy "oauth_tokens: own family only"
  on oauth_tokens for all
  using (family_id = auth_family_id());

-- ── family_config policies ────────────────────────────────────
create policy "family_config: own family only"
  on family_config for all
  using (family_id = auth_family_id());

-- ── chore_completions policies ────────────────────────────────
create policy "chore_completions: own family only"
  on chore_completions for all
  using (family_id = auth_family_id());

-- ============================================================
--  Tier Limits (enforced in API routes, not just DB)
--  These are reference values — actual enforcement is in
--  lib/limits.ts so they can be checked before DB writes.
-- ============================================================

-- free:        1 google account, 2 kids, 14-day history
-- family:      unlimited accounts, unlimited kids, 90-day history
-- family_plus: same + rewards/streaks, multi-location

comment on table families is
  'Billing unit. plan enum controls feature access.';
comment on table oauth_tokens is
  'Google OAuth tokens encrypted with AES-256-GCM. Never sent to client.';
comment on table family_config is
  'App config (people, chores, settings). No calendar event content stored.';
comment on table chore_completions is
  'Daily chore records. Auto-purged per plan tier. No chore titles stored.';

-- ============================================================
--  Phase 0 — Event overlay, horizon, reminders
--  Foundation for attendee tagging, responsibility assignment,
--  and reminder delivery. Idempotent additions — safe to run
--  on an existing database.
-- ============================================================

-- ── users.person_id ───────────────────────────────────────────
-- Links an adult user to their person record in family_config.people[].
-- Nullable: kids are not users, and adults may be unlinked pre-onboarding.
alter table users
  add column if not exists person_id text;

-- ── event_series_overlay ──────────────────────────────────────
-- Overlay applied to an entire recurring series (Google recurringEventId).
-- Sets default attendees and responsibility for every occurrence.
-- Instance overlay wins for any occurrence where both exist.
create table if not exists event_series_overlay (
  family_id               uuid not null references families(id) on delete cascade,
  recurring_event_id      text not null,
  attendee_person_ids     text[] not null default '{}'::text[],
  responsible_person_ids  text[] not null default '{}'::text[],
  default_offset_min      integer,
  updated_at              timestamptz not null default now(),

  primary key (family_id, recurring_event_id)
);

create index if not exists event_series_overlay_family_idx
  on event_series_overlay(family_id);

drop trigger if exists event_series_overlay_updated_at on event_series_overlay;
create trigger event_series_overlay_updated_at
  before update on event_series_overlay
  for each row execute function update_updated_at();

-- ── event_instance_overlay ────────────────────────────────────
-- Per-event overlay. event_key is either the Google event id (singles)
-- or '<recurringEventId>|<originalStartTime>' (instances) so overlay
-- data survives series edits that re-id occurrence instances.
create table if not exists event_instance_overlay (
  family_id               uuid not null references families(id) on delete cascade,
  event_key               text not null,
  attendee_person_ids     text[] not null default '{}'::text[],
  responsible_person_ids  text[] not null default '{}'::text[],
  offset_min              integer,
  updated_at              timestamptz not null default now(),

  primary key (family_id, event_key)
);

create index if not exists event_instance_overlay_family_idx
  on event_instance_overlay(family_id);

drop trigger if exists event_instance_overlay_updated_at on event_instance_overlay;
create trigger event_instance_overlay_updated_at
  before update on event_instance_overlay
  for each row execute function update_updated_at();

-- ── event_horizon ─────────────────────────────────────────────
-- Forward-looking cache (~48h) of upcoming events from external
-- calendar sources. Populated by a sync worker, consumed by the
-- reminder scheduler. title_enc / location_enc are AES-256-GCM
-- encrypted at the app layer using the same key scheme as oauth_tokens.
create table if not exists event_horizon (
  family_id           uuid not null references families(id) on delete cascade,
  event_key           text not null,
  start_at            timestamptz not null,
  end_at              timestamptz not null,
  title_enc           text,
  location_enc        text,
  source_calendar_id  text not null,
  source_provider     text not null default 'google',
  synced_at           timestamptz not null default now(),

  primary key (family_id, event_key)
);

create index if not exists event_horizon_start_at_idx
  on event_horizon(start_at);
create index if not exists event_horizon_family_start_idx
  on event_horizon(family_id, start_at);

-- ── reminder_sends ────────────────────────────────────────────
-- Idempotency log of outbound reminders. Composite PK prevents
-- double-sends across worker retries and redeploys.
create table if not exists reminder_sends (
  family_id   uuid not null references families(id) on delete cascade,
  event_key   text not null,
  person_id   text not null,
  offset_min  integer not null,
  channel     text not null,         -- 'email' | 'push'
  sent_at     timestamptz not null default now(),

  primary key (family_id, event_key, person_id, offset_min, channel)
);

create index if not exists reminder_sends_family_sent_idx
  on reminder_sends(family_id, sent_at);

-- ── user_notification_prefs ───────────────────────────────────
-- Per-user channel + schedule preferences. The wall display is
-- shared, but reminders are addressed to individual users.
create table if not exists user_notification_prefs (
  user_id          uuid primary key references users(id) on delete cascade,
  email_enabled    boolean not null default true,
  push_enabled     boolean not null default false,
  push_endpoints   jsonb not null default '[]'::jsonb,
  quiet_hours      jsonb,
  default_offsets  integer[] not null default '{15}'::integer[],
  updated_at       timestamptz not null default now()
);

drop trigger if exists user_notification_prefs_updated_at on user_notification_prefs;
create trigger user_notification_prefs_updated_at
  before update on user_notification_prefs
  for each row execute function update_updated_at();

-- ── RLS on Phase 0 tables ─────────────────────────────────────

alter table event_series_overlay     enable row level security;
alter table event_instance_overlay   enable row level security;
alter table event_horizon            enable row level security;
alter table reminder_sends           enable row level security;
alter table user_notification_prefs  enable row level security;

drop policy if exists "event_series_overlay: own family only" on event_series_overlay;
create policy "event_series_overlay: own family only"
  on event_series_overlay for all
  using (family_id = auth_family_id());

drop policy if exists "event_instance_overlay: own family only" on event_instance_overlay;
create policy "event_instance_overlay: own family only"
  on event_instance_overlay for all
  using (family_id = auth_family_id());

drop policy if exists "event_horizon: own family only" on event_horizon;
create policy "event_horizon: own family only"
  on event_horizon for all
  using (family_id = auth_family_id());

drop policy if exists "reminder_sends: own family only" on reminder_sends;
create policy "reminder_sends: own family only"
  on reminder_sends for all
  using (family_id = auth_family_id());

-- user_notification_prefs is owner-scoped — each user reads/writes
-- only their own row, identified by email claim in the session JWT.
drop policy if exists "user_notification_prefs: own row only" on user_notification_prefs;
create policy "user_notification_prefs: own row only"
  on user_notification_prefs for all
  using (user_id in (
    select id from users
    where email = current_setting('request.jwt.claims', true)::json->>'email'
  ));

-- ── Purge helpers for Phase 0 tables ──────────────────────────

create or replace function purge_event_horizon_stale()
returns void language plpgsql as $$
begin
  -- Events that have ended — 24h grace window for any late reads.
  delete from event_horizon
  where end_at < now() - interval '24 hours';
end;
$$;

create or replace function purge_reminder_sends_old()
returns void language plpgsql as $$
begin
  -- 90-day retention on the reminder audit log.
  delete from reminder_sends
  where sent_at < now() - interval '90 days';
end;
$$;

-- Orphan overlay rows (events deleted from source) are reaped by an
-- app-level sweep that cross-references event_key against live source
-- fetches — SQL alone cannot detect upstream deletions.

comment on table event_series_overlay is
  'Series-level attendee/responsibility overlay. No event content stored.';
comment on table event_instance_overlay is
  'Per-instance attendee/responsibility overlay. Overrides series.';
comment on table event_horizon is
  'Short-lived forward cache of upcoming events. Title/location encrypted at app layer.';
comment on table reminder_sends is
  'Idempotency log of outbound reminders. 90-day retention.';
comment on table user_notification_prefs is
  'Per-user channel and schedule preferences for reminders.';

-- ============================================================
--  Email magic-link verification tokens (migration 003)
-- ============================================================

create table if not exists verification_tokens (
  identifier text not null,
  token      text not null unique,
  expires    timestamptz not null,
  primary key (identifier, token)
);

create or replace function purge_verification_tokens_expired()
returns void language plpgsql as $$
begin
  delete from verification_tokens where expires < now();
end;
$$;

comment on table verification_tokens is
  'Short-lived email sign-in tokens. Auto-purged by a nightly cron.';
