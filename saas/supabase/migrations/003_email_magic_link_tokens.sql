-- ============================================================
--  Migration 003 — Email magic-link verification tokens
--
--  NextAuth's Resend / Email provider requires a table where
--  short-lived verification tokens can be stored between the
--  'send email' and 'click link' steps. We keep the schema to
--  exactly what Auth.js expects.
-- ============================================================

create table if not exists verification_tokens (
  identifier text not null,
  token      text not null unique,
  expires    timestamptz not null,
  primary key (identifier, token)
);

-- Expired tokens should be swept regularly. Purge helper; wire into
-- the existing /api/cron/purge worker in the app.
create or replace function purge_verification_tokens_expired()
returns void language plpgsql as $$
begin
  delete from verification_tokens where expires < now();
end;
$$;

comment on table verification_tokens is
  'Short-lived email sign-in tokens. Auto-purged by a nightly cron.';
