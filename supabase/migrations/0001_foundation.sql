-- =============================================================================
-- 0001 — Foundation: schemas, enums, shared helpers
-- =============================================================================

create schema if not exists app;
comment on schema app is 'Lumos internal helpers (authorization predicates, triggers). Not exposed over the API.';

revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type app.platform_role as enum ('super_admin', 'support', 'analyst');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.business_type as enum ('restaurant', 'cafe', 'salon', 'barbershop', 'custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.account_status as enum ('active', 'suspended', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.subscription_status as enum (
    'trial', 'active', 'expiring_soon', 'expired', 'suspended', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.membership_status as enum ('invited', 'active', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.translation_status as enum ('draft', 'ai_generated', 'reviewed', 'approved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.discount_type as enum ('percentage', 'fixed_amount', 'promotional_price');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.offer_target_type as enum ('item', 'category', 'branch', 'all_items');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.modifier_selection as enum ('single', 'multiple');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.media_kind as enum ('image', 'logo', 'icon', 'gallery', 'document');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.analytics_event_type as enum (
    'menu_view', 'category_view', 'item_view', 'search', 'language_change',
    'offer_view', 'branch_view'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.translation_job_status as enum ('queued', 'running', 'completed', 'failed', 'cancelled');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- -----------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Slug validation. Slugs are part of public URLs, so they are constrained
-- rather than merely sanitised in the application layer.
-- -----------------------------------------------------------------------------
create or replace function app.is_valid_slug(value text)
returns boolean
language sql
immutable
as $$
  select value ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(value) between 2 and 63
$$;

-- -----------------------------------------------------------------------------
-- Localized text helper used by public API views: pick the requested locale,
-- fall back to the tenant default, then to any available translation.
-- -----------------------------------------------------------------------------
create or replace function app.pick_locale(translations jsonb, requested text, fallback text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(translations ->> requested, ''),
    nullif(translations ->> fallback, ''),
    (select value #>> '{}' from jsonb_each(translations) where value #>> '{}' <> '' limit 1)
  )
$$;

-- -----------------------------------------------------------------------------
-- Short, URL-safe public codes (QR targets, public menu identifiers).
-- Derived from gen_random_uuid() so no extension is required.
-- -----------------------------------------------------------------------------
-- Internal codes (roles, plans, modifier groups) allow underscores; public
-- slugs deliberately do not, because they appear in customer-facing URLs.
create or replace function app.is_valid_code(value text)
returns boolean
language sql
immutable
as $$
  select value ~ '^[a-z0-9]+([_-][a-z0-9]+)*$' and length(value) between 2 and 63
$$;

create or replace function app.generate_public_code(length_chars integer default 12)
returns text
language sql
volatile
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, greatest(length_chars, 6))
$$;
