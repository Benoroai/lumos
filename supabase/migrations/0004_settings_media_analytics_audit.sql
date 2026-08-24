-- =============================================================================
-- 0004 — Business settings, media, analytics, audit, translation jobs,
--        rate limiting
-- =============================================================================

-- -----------------------------------------------------------------------------
-- business_settings — one row per tenant. Branding, formatting, and which
-- optional catalog fields the business wants to see.
-- -----------------------------------------------------------------------------
create table if not exists public.business_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,

  primary_color text not null default '#1F45FF',
  secondary_color text not null default '#111111',
  accent_color text not null default '#D7FF2F',
  background_color text not null default '#F5F0E7',
  font_family text not null default 'Inter',

  price_display_format text not null default 'symbol_before'
    check (price_display_format in ('symbol_before', 'symbol_after', 'code_after', 'amount_only')),
  show_prices boolean not null default true,
  tax_display text not null default 'inclusive'
    check (tax_display in ('inclusive', 'exclusive', 'hidden')),
  tax_rate numeric(6, 3) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_label text not null default 'VAT',

  -- Which optional item fields are enabled for this business. The business
  -- template seeds this; the owner can change it at any time.
  enabled_item_fields jsonb not null default
    '["description","image","ingredients","allergens","dietary_tags","calories","preparation_time"]'::jsonb,
  terminology_overrides jsonb not null default '{}'::jsonb,

  social_links jsonb not null default '{}'::jsonb,
  contact_overrides jsonb not null default '{}'::jsonb,

  ai_translation_enabled boolean not null default true,
  require_translation_approval boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_settings_colors_hex check (
    primary_color ~ '^#[0-9A-Fa-f]{6}$' and
    secondary_color ~ '^#[0-9A-Fa-f]{6}$' and
    accent_color ~ '^#[0-9A-Fa-f]{6}$' and
    background_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

-- -----------------------------------------------------------------------------
-- media_assets — every uploaded file. Storage paths are tenant-prefixed so a
-- path can never be reused across tenants.
-- -----------------------------------------------------------------------------
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  bucket text not null default 'tenant-media',
  path text not null,
  url text,
  kind app.media_kind not null default 'image',
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  width integer,
  height integer,
  alt_text text not null default '',
  original_filename text not null default '',
  checksum text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (bucket, path),
  -- Defence in depth: the storage path must start with this tenant's id.
  constraint media_assets_path_is_tenant_scoped check (path like (tenant_id::text || '/%'))
);
create index if not exists media_assets_tenant_idx on public.media_assets (tenant_id, created_at desc) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- analytics_events — privacy-conscious. No IP, no cookies, no user id: only a
-- salted daily session hash produced by the public API.
-- -----------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  event_type app.analytics_event_type not null,
  category_id uuid references public.categories (id) on delete set null,
  item_id uuid references public.items (id) on delete set null,
  offer_id uuid references public.offers (id) on delete set null,
  session_hash text,
  locale text,
  search_query text,
  search_results_count integer check (search_results_count >= 0),
  device_type text check (device_type in ('mobile', 'tablet', 'desktop', 'unknown')),
  referrer_host text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_tenant_time_idx on public.analytics_events (tenant_id, occurred_at desc);
create index if not exists analytics_events_tenant_type_time_idx on public.analytics_events (tenant_id, event_type, occurred_at desc);
create index if not exists analytics_events_item_idx on public.analytics_events (tenant_id, item_id, occurred_at desc) where item_id is not null;
create index if not exists analytics_events_search_idx on public.analytics_events (tenant_id, occurred_at desc) where event_type = 'search';

-- -----------------------------------------------------------------------------
-- audit_logs — append-only. No update/delete policy is ever granted.
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  -- NULL tenant_id = platform-level event (plan changed, admin created, ...).
  tenant_id uuid references public.tenants (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_type text not null default 'tenant' check (actor_type in ('platform', 'tenant', 'system', 'public')),
  actor_email text,
  actor_label text not null default '',
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  -- True when performed through the audited support-impersonation mode.
  is_impersonated boolean not null default false,
  impersonated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_tenant_time_idx on public.audit_logs (tenant_id, created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- login_audit — authentication history, separate from business audit events.
-- -----------------------------------------------------------------------------
create table if not exists public.login_audit (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  tenant_id uuid references public.tenants (id) on delete set null,
  email text not null,
  portal text not null check (portal in ('platform', 'business')),
  was_successful boolean not null,
  failure_reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists login_audit_email_time_idx on public.login_audit (lower(email), created_at desc);
create index if not exists login_audit_user_time_idx on public.login_audit (user_id, created_at desc);
create index if not exists login_audit_tenant_time_idx on public.login_audit (tenant_id, created_at desc);

-- -----------------------------------------------------------------------------
-- translation_jobs — queue + history for AI-assisted translation.
-- -----------------------------------------------------------------------------
create table if not exists public.translation_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity_type text not null check (entity_type in ('item', 'category', 'modifier_group', 'modifier', 'offer')),
  entity_id uuid not null,
  source_locale text not null references public.languages (code),
  target_locales text[] not null,
  status app.translation_job_status not null default 'queued',
  provider text not null default 'echo',
  model text,
  -- Set when the operator chose to replace already-approved translations.
  overwrite_approved boolean not null default false,
  requested_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint translation_jobs_targets_not_empty check (array_length(target_locales, 1) >= 1)
);
create index if not exists translation_jobs_tenant_idx on public.translation_jobs (tenant_id, created_at desc);
create index if not exists translation_jobs_entity_idx on public.translation_jobs (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- rate_limits — durable fixed-window counters. Shared by login attempts and
-- the public API so limits hold across serverless instances.
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  hit_count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Lives in `public` (not `app`) so it is reachable through PostgREST `rpc()`
-- from the API route handlers. Execute is granted to service_role only.
create or replace function public.rate_limit_hit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits%rowtype;
begin
  insert into public.rate_limits as rl (bucket_key, window_started_at, hit_count, updated_at)
  values (p_key, v_now, 1, v_now)
  on conflict (bucket_key) do update
    set hit_count = case
          when rl.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
          else rl.hit_count + 1
        end,
        window_started_at = case
          when rl.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
          else rl.window_started_at
        end,
        updated_at = v_now
  returning * into v_row;

  return query
  select
    v_row.hit_count <= p_limit,
    greatest(p_limit - v_row.hit_count, 0),
    v_row.window_started_at + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['business_settings', 'media_assets', 'translation_jobs']
  loop
    execute format(
      'drop trigger if exists %I on public.%I; create trigger %I before update on public.%I for each row execute function app.touch_updated_at();',
      t || '_touch', t, t || '_touch', t
    );
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- audit_logs is append-only, enforced in the database rather than by convention.
-- -----------------------------------------------------------------------------
create or replace function app.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only (attempted %)', tg_op using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function app.reject_mutation();

drop trigger if exists login_audit_append_only on public.login_audit;
create trigger login_audit_append_only
  before update or delete on public.login_audit
  for each row execute function app.reject_mutation();
