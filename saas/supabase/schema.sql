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
create table oauth_tokens (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  family_id             uuid not null references families(id) on delete cascade,
  google_account_email  text not null,
  access_token_enc      text not null,       -- AES-256-GCM encrypted
  refresh_token_enc     text,                -- AES-256-GCM encrypted
  expires_at            timestamptz,
  scopes                text,

  unique (family_id, google_account_email)
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
