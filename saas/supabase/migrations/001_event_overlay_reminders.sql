-- ============================================================
--  Migration 001 — Event overlay, horizon, reminders (Phase 0)
--
--  Run this against an EXISTING Supabase project that already has
--  the base schema.sql applied. It is idempotent — safe to re-run.
--
--  For a fresh install, run schema.sql instead; it includes these
--  same tables end-to-end.
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
