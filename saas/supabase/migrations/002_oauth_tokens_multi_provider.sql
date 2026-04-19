-- ============================================================
--  Migration 002 — Multi-provider OAuth tokens
--
--  Generalizes oauth_tokens so Microsoft (and eventually others)
--  can store refresh tokens alongside Google. Safe to re-run.
--
--  Changes:
--   • add column provider (default 'google' — backfills existing rows)
--   • rename google_account_email → account_email
--   • swap the unique constraint to (family_id, provider, account_email)
-- ============================================================

-- 1. Provider discriminator, default 'google' so existing rows fit.
alter table oauth_tokens
  add column if not exists provider text not null default 'google';

-- 2. Rename the email column. Safe no-op if already renamed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'oauth_tokens' and column_name = 'google_account_email'
  ) then
    alter table oauth_tokens rename column google_account_email to account_email;
  end if;
end$$;

-- 3. Drop the old unique constraint and recreate it with provider.
alter table oauth_tokens
  drop constraint if exists oauth_tokens_family_id_google_account_email_key;

-- Named to match Postgres's default-style; composite key including provider.
create unique index if not exists oauth_tokens_family_provider_account_email_idx
  on oauth_tokens (family_id, provider, account_email);
