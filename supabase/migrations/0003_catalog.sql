-- =============================================================================
-- 0003 — Catalog: branches, categories, items, modifiers, offers
-- One generic model serves restaurants, cafés, salons and barbershops. What
-- differs between them is terminology and which optional fields are surfaced —
-- both of which live in business_templates / business_settings, not here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- branches
-- -----------------------------------------------------------------------------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  slug text not null check (app.is_valid_slug(slug)),
  name text not null check (length(btrim(name)) > 0),
  address_line text not null default '',
  city text not null default '',
  country text not null default 'OM',
  phone text,
  whatsapp text,
  email text,
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  timezone text not null default 'Asia/Muscat',
  -- [{ "day": 0..6, "open": "09:00", "close": "23:00", "closed": false }, ...]
  opening_hours jsonb not null default '[]'::jsonb,
  -- Public menu identifier used by the separate customer frontend / QR codes.
  public_menu_code text not null default app.generate_public_code(12),
  qr_target_url text,
  allow_branch_prices boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, slug)
);
create index if not exists branches_tenant_idx on public.branches (tenant_id) where deleted_at is null;
create unique index if not exists branches_public_menu_code_idx on public.branches (public_menu_code);

-- -----------------------------------------------------------------------------
-- categories
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  parent_id uuid references public.categories (id) on delete set null,
  slug text not null check (app.is_valid_slug(slug)),
  image_path text,
  image_url text,
  icon text,
  color text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  -- Scheduled visibility. NULL = always.
  visible_from timestamptz,
  visible_until timestamptz,
  -- { "days": [0,1,2], "start": "07:00", "end": "11:30" } — e.g. a breakfast menu
  visibility_schedule jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, slug),
  constraint categories_no_self_parent check (parent_id is null or parent_id <> id),
  constraint categories_visibility_window check (visible_until is null or visible_from is null or visible_until > visible_from)
);
create index if not exists categories_tenant_order_idx on public.categories (tenant_id, display_order) where deleted_at is null;
create index if not exists categories_parent_idx on public.categories (parent_id) where deleted_at is null;

create table if not exists public.category_branches (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  primary key (category_id, branch_id)
);
create index if not exists category_branches_tenant_idx on public.category_branches (tenant_id);
comment on table public.category_branches is
  'Explicit branch visibility for a category. No rows for a category means "visible at every branch".';

create table if not exists public.category_translations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  locale text not null references public.languages (code),
  name text not null default '',
  description text not null default '',
  status app.translation_status not null default 'draft',
  is_machine_generated boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, locale)
);
create index if not exists category_translations_tenant_idx on public.category_translations (tenant_id, locale);

-- -----------------------------------------------------------------------------
-- items (products / dishes / drinks / services)
-- -----------------------------------------------------------------------------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  sku text,

  base_price numeric(14, 3) not null default 0 check (base_price >= 0),
  sale_price numeric(14, 3) check (sale_price >= 0),
  currency text references public.currencies (code),

  image_path text,
  image_url text,
  -- [{ "path": "...", "url": "...", "alt": "..." }]
  gallery jsonb not null default '[]'::jsonb,

  is_active boolean not null default true,
  in_stock boolean not null default true,
  -- "86 item": temporary out-of-stock that clears itself.
  out_of_stock_until timestamptz,
  out_of_stock_reason text,

  is_featured boolean not null default false,
  is_new boolean not null default false,
  is_popular boolean not null default false,
  display_order integer not null default 0,

  dietary_tags text[] not null default '{}'::text[],
  allergens text[] not null default '{}'::text[],
  spice_level smallint check (spice_level between 0 and 5),
  calories integer check (calories >= 0),
  preparation_time_minutes integer check (preparation_time_minutes >= 0),
  service_duration_minutes integer check (service_duration_minutes >= 0),
  custom_attributes jsonb not null default '{}'::jsonb,

  visible_from timestamptz,
  visible_until timestamptz,
  visibility_schedule jsonb,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint items_sale_price_below_base check (sale_price is null or sale_price <= base_price),
  constraint items_visibility_window check (visible_until is null or visible_from is null or visible_until > visible_from)
);
create index if not exists items_tenant_category_idx on public.items (tenant_id, category_id, display_order) where deleted_at is null;
create index if not exists items_tenant_active_idx on public.items (tenant_id, is_active) where deleted_at is null;
create unique index if not exists items_tenant_sku_idx on public.items (tenant_id, lower(sku)) where sku is not null and deleted_at is null;
create index if not exists items_out_of_stock_until_idx on public.items (out_of_stock_until) where out_of_stock_until is not null;

create table if not exists public.item_translations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  locale text not null references public.languages (code),
  name text not null default '',
  description text not null default '',
  ingredients text not null default '',
  status app.translation_status not null default 'draft',
  is_machine_generated boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, locale)
);
create index if not exists item_translations_tenant_idx on public.item_translations (tenant_id, locale);
create index if not exists item_translations_search_idx on public.item_translations using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '')));

-- -----------------------------------------------------------------------------
-- item_branch_settings — per-branch availability and (optional) price override.
-- Absence of a row means "inherit the item defaults at that branch".
-- -----------------------------------------------------------------------------
create table if not exists public.item_branch_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  is_available boolean not null default true,
  in_stock boolean not null default true,
  out_of_stock_until timestamptz,
  price_override numeric(14, 3) check (price_override >= 0),
  sale_price_override numeric(14, 3) check (sale_price_override >= 0),
  display_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, branch_id)
);
create index if not exists item_branch_settings_tenant_branch_idx on public.item_branch_settings (tenant_id, branch_id);

-- -----------------------------------------------------------------------------
-- Modifier groups & modifiers (sizes, add-ons, service options)
-- -----------------------------------------------------------------------------
create table if not exists public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (app.is_valid_code(code)),
  selection_type app.modifier_selection not null default 'single',
  is_required boolean not null default false,
  min_selections smallint not null default 0 check (min_selections >= 0),
  max_selections smallint check (max_selections >= 1),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code),
  constraint modifier_groups_selection_bounds check (max_selections is null or max_selections >= min_selections),
  constraint modifier_groups_required_min check (not is_required or min_selections >= 1)
);
create index if not exists modifier_groups_tenant_idx on public.modifier_groups (tenant_id) where deleted_at is null;

create table if not exists public.modifier_group_translations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  modifier_group_id uuid not null references public.modifier_groups (id) on delete cascade,
  locale text not null references public.languages (code),
  name text not null default '',
  description text not null default '',
  status app.translation_status not null default 'draft',
  is_machine_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modifier_group_id, locale)
);

create table if not exists public.modifiers (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  modifier_group_id uuid not null references public.modifier_groups (id) on delete cascade,
  code text not null check (app.is_valid_code(code)),
  price_adjustment numeric(14, 3) not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  in_stock boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (modifier_group_id, code)
);
create index if not exists modifiers_tenant_idx on public.modifiers (tenant_id) where deleted_at is null;

create table if not exists public.modifier_translations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  modifier_id uuid not null references public.modifiers (id) on delete cascade,
  locale text not null references public.languages (code),
  name text not null default '',
  status app.translation_status not null default 'draft',
  is_machine_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modifier_id, locale)
);

create table if not exists public.item_modifier_groups (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  modifier_group_id uuid not null references public.modifier_groups (id) on delete cascade,
  display_order integer not null default 0,
  is_required_override boolean,
  primary key (item_id, modifier_group_id)
);
create index if not exists item_modifier_groups_tenant_idx on public.item_modifier_groups (tenant_id);
create index if not exists item_modifier_groups_group_idx on public.item_modifier_groups (modifier_group_id);

-- -----------------------------------------------------------------------------
-- Offers & promotions
-- -----------------------------------------------------------------------------
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (app.is_valid_code(code)),
  discount_type app.discount_type not null,
  discount_value numeric(14, 3) not null check (discount_value >= 0),
  image_path text,
  image_url text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code),
  constraint offers_window_valid check (ends_at is null or ends_at > starts_at),
  constraint offers_percentage_bounds check (discount_type <> 'percentage' or discount_value <= 100)
);
create index if not exists offers_tenant_window_idx on public.offers (tenant_id, starts_at, ends_at) where deleted_at is null;

create table if not exists public.offer_translations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  locale text not null references public.languages (code),
  name text not null default '',
  description text not null default '',
  status app.translation_status not null default 'draft',
  is_machine_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, locale)
);

create table if not exists public.offer_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  target_type app.offer_target_type not null,
  item_id uuid references public.items (id) on delete cascade,
  category_id uuid references public.categories (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint offer_targets_shape check (
    (target_type = 'item' and item_id is not null and category_id is null) or
    (target_type = 'category' and category_id is not null and item_id is null) or
    (target_type = 'branch' and branch_id is not null and item_id is null and category_id is null) or
    (target_type = 'all_items' and item_id is null and category_id is null)
  )
);
create index if not exists offer_targets_offer_idx on public.offer_targets (offer_id);
create index if not exists offer_targets_tenant_idx on public.offer_targets (tenant_id);
create unique index if not exists offer_targets_unique_item on public.offer_targets (offer_id, item_id) where item_id is not null;
create unique index if not exists offer_targets_unique_category on public.offer_targets (offer_id, category_id) where category_id is not null;

-- An offer is live when it is active, started, and not past its end date.
-- Expired offers simply stop matching — history is never deleted.
create or replace function app.offer_is_live(is_active boolean, starts_at timestamptz, ends_at timestamptz)
returns boolean
language sql
immutable
as $$
  select is_active and starts_at <= now() and (ends_at is null or ends_at > now())
$$;

-- -----------------------------------------------------------------------------
-- Scheduled-visibility evaluation shared by the dashboard and the public API.
-- -----------------------------------------------------------------------------
create or replace function app.is_visible_now(
  is_active boolean,
  visible_from timestamptz,
  visible_until timestamptz,
  schedule jsonb,
  tz text default 'UTC'
)
returns boolean
language sql
stable
as $$
  select
    is_active
    and (visible_from is null or visible_from <= now())
    and (visible_until is null or visible_until > now())
    and (
      schedule is null
      or (
        -- day-of-week gate (0 = Sunday), then time-of-day window
        (
          schedule -> 'days' is null
          or jsonb_array_length(schedule -> 'days') = 0
          or (extract(dow from (now() at time zone tz))::int) in (
            select (jsonb_array_elements_text(schedule -> 'days'))::int
          )
        )
        and (
          schedule ->> 'start' is null
          or schedule ->> 'end' is null
          or (now() at time zone tz)::time between (schedule ->> 'start')::time and (schedule ->> 'end')::time
        )
      )
    )
$$;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'branches', 'categories', 'category_translations', 'items', 'item_translations',
    'item_branch_settings', 'modifier_groups', 'modifier_group_translations',
    'modifiers', 'modifier_translations', 'offers', 'offer_translations'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I; create trigger %I before update on public.%I for each row execute function app.touch_updated_at();',
      t || '_touch', t, t || '_touch', t
    );
  end loop;
end
$$;
