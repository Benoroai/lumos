-- =============================================================================
-- 0002 — Platform core: platform users, plans, templates, tenants,
--        subscriptions, memberships, roles & permissions, feature flags
-- =============================================================================

-- -----------------------------------------------------------------------------
-- platform_users — staff of the platform itself (Super Admin portal).
-- Credentials live in auth.users; this table only carries platform authorization.
-- -----------------------------------------------------------------------------
create table if not exists public.platform_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role app.platform_role not null default 'support',
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint platform_users_email_lower check (email = lower(email))
);
create index if not exists platform_users_role_idx on public.platform_users (role) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Platform reference data: languages & currencies the Super Admin can enable.
-- -----------------------------------------------------------------------------
create table if not exists public.languages (
  code text primary key check (code ~ '^[a-z]{2}(-[A-Za-z0-9]{2,8})?$'),
  english_name text not null,
  native_name text not null,
  direction text not null default 'ltr' check (direction in ('ltr', 'rtl')),
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  symbol text not null,
  -- OMR uses 3 decimal places; this drives every price input and formatter.
  decimal_digits smallint not null default 2 check (decimal_digits between 0 and 4),
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- plans — commercial plans with hard limits and feature bundles.
-- -----------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (app.is_valid_code(code)),
  name text not null,
  description text not null default '',
  price_amount numeric(14, 3) not null default 0 check (price_amount >= 0),
  price_currency text not null default 'OMR' references public.currencies (code),
  billing_period text not null default 'yearly' check (billing_period in ('monthly', 'yearly', 'custom')),
  duration_days integer not null default 365 check (duration_days > 0),
  max_branches integer not null default 1 check (max_branches >= 1),
  max_categories integer not null default 50 check (max_categories >= 1),
  max_items integer not null default 500 check (max_items >= 1),
  max_users integer not null default 5 check (max_users >= 1),
  max_languages integer not null default 3 check (max_languages >= 1),
  max_storage_mb integer not null default 1024 check (max_storage_mb >= 1),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists plans_single_default_idx on public.plans (is_default) where is_default and deleted_at is null;

-- -----------------------------------------------------------------------------
-- business_templates — the configuration layer that makes one generic catalog
-- model *feel* like a restaurant menu, a salon service list, and so on.
-- Templates never change the physical schema.
-- -----------------------------------------------------------------------------
create table if not exists public.business_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (app.is_valid_code(code)),
  business_type app.business_type not null,
  name text not null,
  description text not null default '',
  icon text not null default 'store',
  -- { "catalog": "Menu", "category": "Category", "item": "Dish", ... } per locale
  terminology jsonb not null default '{}'::jsonb,
  -- which optional item fields are surfaced by default for this business type
  enabled_item_fields jsonb not null default '[]'::jsonb,
  default_categories jsonb not null default '[]'::jsonb,
  default_modifier_groups jsonb not null default '[]'::jsonb,
  default_feature_flags jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- -----------------------------------------------------------------------------
-- tenants — one row per business. The root of every isolation boundary.
-- -----------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  slug text not null unique check (app.is_valid_slug(slug)),
  name text not null check (length(btrim(name)) > 0),
  legal_name text not null default '',
  business_type app.business_type not null default 'restaurant',
  template_id uuid references public.business_templates (id) on delete set null,

  logo_path text,
  logo_url text,

  contact_email text,
  contact_phone text,
  contact_whatsapp text,
  website_url text,
  address_line text not null default '',
  city text not null default '',
  country text not null default 'OM',
  timezone text not null default 'Asia/Muscat',

  default_locale text not null default 'en' references public.languages (code),
  supported_locales text[] not null default array['en', 'ar']::text[],
  default_currency text not null default 'OMR' references public.currencies (code),

  registered_at timestamptz not null default now(),
  account_status app.account_status not null default 'active',

  -- Visible to the Platform Super Admin only. RLS keeps this column's row out
  -- of tenant-user reach; the API layer additionally never selects it.
  internal_notes text not null default '',

  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint tenants_supported_locales_not_empty check (array_length(supported_locales, 1) >= 1)
);
create index if not exists tenants_account_status_idx on public.tenants (account_status) where deleted_at is null;
create index if not exists tenants_business_type_idx on public.tenants (business_type) where deleted_at is null;
create index if not exists tenants_created_at_idx on public.tenants (created_at desc);

-- -----------------------------------------------------------------------------
-- subscriptions — history of subscription periods; exactly one current row.
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  -- Manual lifecycle state. 'expiring_soon' / 'expired' are *derived* from
  -- expires_at and are never written here — see app.subscription_status().
  status app.subscription_status not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  is_current boolean not null default true,
  auto_renew boolean not null default false,
  cancelled_at timestamptz,
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_valid check (expires_at > starts_at),
  constraint subscriptions_manual_status check (status in ('trial', 'active', 'suspended', 'cancelled'))
);
create unique index if not exists subscriptions_one_current_per_tenant
  on public.subscriptions (tenant_id) where is_current;
create index if not exists subscriptions_expires_at_idx on public.subscriptions (expires_at);
create index if not exists subscriptions_tenant_idx on public.subscriptions (tenant_id, created_at desc);

-- Derived status. Kept in SQL so the database, the dashboards and the public
-- API can never disagree about whether a subscription is live.
create or replace function app.subscription_status(
  manual app.subscription_status,
  expires_at timestamptz,
  warn_days integer default 30
)
returns app.subscription_status
language sql
immutable
as $$
  select case
    when manual in ('suspended', 'cancelled') then manual
    when expires_at <= now() then 'expired'::app.subscription_status
    when expires_at <= now() + make_interval(days => warn_days) then 'expiring_soon'::app.subscription_status
    else manual
  end
$$;

create or replace function app.subscription_is_live(
  manual app.subscription_status,
  expires_at timestamptz
)
returns boolean
language sql
immutable
as $$
  select manual not in ('suspended', 'cancelled') and expires_at > now()
$$;

-- -----------------------------------------------------------------------------
-- Roles & permissions
-- -----------------------------------------------------------------------------
create table if not exists public.permissions (
  key text primary key check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  category text not null,
  description text not null default '',
  is_destructive boolean not null default false,
  sort_order integer not null default 0
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  -- NULL tenant_id = system role available to every tenant.
  tenant_id uuid references public.tenants (id) on delete cascade,
  code text not null check (app.is_valid_code(code)),
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  -- Owner role bypasses individual permission checks within its own tenant.
  is_owner_role boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists roles_system_code_idx on public.roles (code) where tenant_id is null;
create unique index if not exists roles_tenant_code_idx on public.roles (tenant_id, code) where tenant_id is not null;

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

-- -----------------------------------------------------------------------------
-- tenant_users — membership of a business. The isolation predicate for RLS.
-- -----------------------------------------------------------------------------
create table if not exists public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id),
  email text not null,
  full_name text not null default '',
  status app.membership_status not null default 'active',
  is_owner boolean not null default false,
  must_change_password boolean not null default false,
  -- Optional restriction: staff limited to specific branches.
  branch_ids uuid[] not null default '{}'::uuid[],
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, user_id)
);
create index if not exists tenant_users_user_idx on public.tenant_users (user_id) where deleted_at is null;
create index if not exists tenant_users_tenant_idx on public.tenant_users (tenant_id) where deleted_at is null;

-- Per-user grant/revoke on top of the role. Makes staff permissions granular
-- without forcing a bespoke role per person.
create table if not exists public.tenant_user_permissions (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tenant_user_id uuid not null references public.tenant_users (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  effect text not null check (effect in ('grant', 'revoke')),
  created_at timestamptz not null default now(),
  primary key (tenant_user_id, permission_key)
);
create index if not exists tenant_user_permissions_tenant_idx on public.tenant_user_permissions (tenant_id);

-- -----------------------------------------------------------------------------
-- Feature flags: platform catalogue + per-tenant override.
-- -----------------------------------------------------------------------------
create table if not exists public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  name text not null,
  description text not null default '',
  default_enabled boolean not null default false,
  is_tenant_overridable boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_feature_flags (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  flag_key text not null references public.feature_flags (key) on delete cascade,
  is_enabled boolean not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, flag_key)
);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'platform_users', 'languages', 'currencies', 'plans', 'business_templates',
    'tenants', 'subscriptions', 'roles', 'tenant_users', 'feature_flags'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I; create trigger %I before update on public.%I for each row execute function app.touch_updated_at();',
      t || '_touch', t, t || '_touch', t
    );
  end loop;
end
$$;
