-- =============================================================================
-- 0006 — Row-Level Security
--
-- Isolation model
-- ---------------
-- * Every tenant-owned table carries `tenant_id` and is gated by
--   app.is_tenant_member() / app.has_permission().
-- * Platform staff are recognised by app.is_platform_admin() and are the only
--   principals allowed to cross tenant boundaries. Every such crossing is
--   audited at the application layer.
-- * `anon` (the key shipped to the separate customer frontend) can read
--   published catalog rows and nothing else. It has no write grant anywhere.
-- * Analytics ingestion deliberately has NO anon insert policy: events are
--   written by the API route through the service role after validation and
--   rate limiting, so the public key cannot be used to forge traffic.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Authorization predicates. SECURITY DEFINER so they can consult membership
-- tables without tripping the very policies they are used by.
-- -----------------------------------------------------------------------------
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_users pu
    where pu.user_id = auth.uid()
      and pu.is_active
      and pu.deleted_at is null
  )
$$;

create or replace function app.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.platform_users pu
    where pu.user_id = auth.uid()
      and pu.role = 'super_admin'
      and pu.is_active
      and pu.deleted_at is null
  )
$$;

create or replace function app.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.tenant_id = p_tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'active'
      and tu.deleted_at is null
  )
$$;

create or replace function app.current_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tu.tenant_id from public.tenant_users tu
  where tu.user_id = auth.uid() and tu.status = 'active' and tu.deleted_at is null
$$;

-- Effective permission = owner short-circuit, then explicit user revoke,
-- then explicit user grant, then role grant.
create or replace function app.has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with membership as (
    select tu.id, tu.role_id, tu.is_owner, r.is_owner_role
    from public.tenant_users tu
    join public.roles r on r.id = tu.role_id
    where tu.tenant_id = p_tenant_id
      and tu.user_id = auth.uid()
      and tu.status = 'active'
      and tu.deleted_at is null
    limit 1
  )
  select
    case
      when not exists (select 1 from membership) then false
      when exists (
        select 1 from public.tenant_user_permissions tup, membership m
        where tup.tenant_user_id = m.id
          and tup.permission_key = p_permission
          and tup.effect = 'revoke'
      ) then false
      when (select is_owner or is_owner_role from membership) then true
      when exists (
        select 1 from public.tenant_user_permissions tup, membership m
        where tup.tenant_user_id = m.id
          and tup.permission_key = p_permission
          and tup.effect = 'grant'
      ) then true
      else exists (
        select 1 from public.role_permissions rp, membership m
        where rp.role_id = m.role_id and rp.permission_key = p_permission
      )
    end
$$;

-- A tenant serves the public API when it is active, not deleted, and — unless
-- the platform says otherwise — has a live subscription.
create or replace function app.tenant_is_public(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenants t
    left join public.subscriptions s on s.tenant_id = t.id and s.is_current
    where t.id = p_tenant_id
      and t.deleted_at is null
      and t.account_status = 'active'
      and (
        not app.platform_setting_bool('public_api.block_expired_subscriptions', true)
        or (s.id is not null and app.subscription_is_live(s.status, s.expires_at))
      )
  )
$$;

grant execute on function
  app.is_platform_admin(), app.is_platform_super_admin(), app.is_tenant_member(uuid),
  app.current_tenant_ids(), app.has_permission(uuid, text), app.tenant_is_public(uuid),
  app.subscription_status(app.subscription_status, timestamptz, integer),
  app.subscription_is_live(app.subscription_status, timestamptz),
  app.offer_is_live(boolean, timestamptz, timestamptz),
  app.is_visible_now(boolean, timestamptz, timestamptz, jsonb, text),
  app.pick_locale(jsonb, text, text), app.is_valid_slug(text), app.is_valid_code(text),
  app.platform_setting(text), app.platform_setting_bool(text, boolean)
to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Baseline grants. Start from zero, then hand out exactly what each role needs.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere in `public`. A table added later without a policy is
-- therefore closed by default rather than open by default.
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- Tenant-owned tables: generated policy set, one permission key per table.
-- -----------------------------------------------------------------------------
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('branches',                     'branches.manage'),
      ('categories',                   'catalog.categories.manage'),
      ('category_branches',            'catalog.categories.manage'),
      ('category_translations',        'catalog.categories.manage'),
      ('items',                        'catalog.items.manage'),
      ('item_translations',            'catalog.items.manage'),
      ('item_branch_settings',         'catalog.items.manage'),
      ('item_modifier_groups',         'catalog.modifiers.manage'),
      ('modifier_groups',              'catalog.modifiers.manage'),
      ('modifier_group_translations',  'catalog.modifiers.manage'),
      ('modifiers',                    'catalog.modifiers.manage'),
      ('modifier_translations',        'catalog.modifiers.manage'),
      ('offers',                       'offers.manage'),
      ('offer_translations',           'offers.manage'),
      ('offer_targets',                'offers.manage'),
      ('business_settings',            'settings.manage'),
      ('media_assets',                 'media.manage'),
      ('translation_jobs',             'translations.manage'),
      ('tenant_users',                 'staff.manage'),
      ('tenant_user_permissions',      'staff.manage')
    ) as t(table_name, permission_key)
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated;', spec.table_name);

    execute format($f$
      drop policy if exists %1$I on public.%2$I;
      create policy %1$I on public.%2$I for select to authenticated
        using (app.is_platform_admin() or app.is_tenant_member(tenant_id));
    $f$, spec.table_name || '_member_select', spec.table_name);

    execute format($f$
      drop policy if exists %1$I on public.%2$I;
      create policy %1$I on public.%2$I for insert to authenticated
        with check (app.is_platform_admin() or app.has_permission(tenant_id, %3$L));
    $f$, spec.table_name || '_member_insert', spec.table_name, spec.permission_key);

    execute format($f$
      drop policy if exists %1$I on public.%2$I;
      create policy %1$I on public.%2$I for update to authenticated
        using (app.is_platform_admin() or app.has_permission(tenant_id, %3$L))
        with check (app.is_platform_admin() or app.has_permission(tenant_id, %3$L));
    $f$, spec.table_name || '_member_update', spec.table_name, spec.permission_key);

    execute format($f$
      drop policy if exists %1$I on public.%2$I;
      create policy %1$I on public.%2$I for delete to authenticated
        using (app.is_platform_admin() or app.has_permission(tenant_id, %3$L));
    $f$, spec.table_name || '_member_delete', spec.table_name, spec.permission_key);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- tenants — members read their own row; only platform staff may create or
-- delete a business.
--
-- Column privileges are granted explicitly rather than granted table-wide and
-- then revoked per column: in Postgres a table-level GRANT outranks a
-- column-level REVOKE, so "grant all then take some away" silently leaves the
-- column readable. Listing the allowed columns is the only construction that
-- actually holds.
-- -----------------------------------------------------------------------------
revoke select, update on public.tenants from authenticated;

-- Every column except internal_notes, which belongs to platform staff alone.
grant select (
  id, public_id, slug, name, legal_name, business_type, template_id,
  logo_path, logo_url, contact_email, contact_phone, contact_whatsapp,
  website_url, address_line, city, country, timezone,
  default_locale, supported_locales, default_currency,
  registered_at, account_status, settings, created_by,
  created_at, updated_at, deleted_at
) on public.tenants to authenticated;

-- Profile fields only. Account status, slug, business type, subscription
-- anchors and the soft-delete flag are decided by the platform, never by the
-- business itself.
grant update (
  name, legal_name, logo_path, logo_url, contact_email, contact_phone,
  contact_whatsapp, website_url, address_line, city, country, timezone,
  default_locale, supported_locales, default_currency, settings, updated_at
) on public.tenants to authenticated;

drop policy if exists tenants_member_select on public.tenants;
create policy tenants_member_select on public.tenants for select to authenticated
  using (app.is_platform_admin() or app.is_tenant_member(id));

drop policy if exists tenants_member_update on public.tenants;
create policy tenants_member_update on public.tenants for update to authenticated
  using (app.is_platform_admin() or app.has_permission(id, 'settings.manage'))
  with check (app.is_platform_admin() or app.has_permission(id, 'settings.manage'));

drop policy if exists tenants_platform_insert on public.tenants;
create policy tenants_platform_insert on public.tenants for insert to authenticated
  with check (app.is_platform_admin());

drop policy if exists tenants_platform_delete on public.tenants;
create policy tenants_platform_delete on public.tenants for delete to authenticated
  using (app.is_platform_super_admin());

-- Platform staff reach the withheld columns through service_role (server-side
-- only), which bypasses both RLS and column privileges.

-- -----------------------------------------------------------------------------
-- subscriptions — tenant members may read theirs, only platform staff write.
-- -----------------------------------------------------------------------------
-- Same column-grant discipline: `notes` is a platform-internal field.
revoke select on public.subscriptions from authenticated;
grant select (
  id, tenant_id, plan_id, status, starts_at, expires_at, is_current,
  auto_renew, cancelled_at, created_by, created_at, updated_at
) on public.subscriptions to authenticated;

drop policy if exists subscriptions_member_select on public.subscriptions;
create policy subscriptions_member_select on public.subscriptions for select to authenticated
  using (app.is_platform_admin() or app.is_tenant_member(tenant_id));

drop policy if exists subscriptions_platform_write on public.subscriptions;
create policy subscriptions_platform_write on public.subscriptions for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- -----------------------------------------------------------------------------
-- tenant_feature_flags — tenants read, platform writes.
-- -----------------------------------------------------------------------------
grant select on public.tenant_feature_flags to authenticated;

drop policy if exists tenant_feature_flags_member_select on public.tenant_feature_flags;
create policy tenant_feature_flags_member_select on public.tenant_feature_flags for select to authenticated
  using (app.is_platform_admin() or app.is_tenant_member(tenant_id));

drop policy if exists tenant_feature_flags_platform_write on public.tenant_feature_flags;
create policy tenant_feature_flags_platform_write on public.tenant_feature_flags for all to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- -----------------------------------------------------------------------------
-- Platform-owned reference tables: readable by any signed-in user (the
-- dashboards need plans, languages, currencies, roles, permissions), writable
-- by platform staff only.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'plans', 'business_templates', 'languages', 'currencies',
    'permissions', 'feature_flags'
  ]
  loop
    execute format('grant select on public.%I to authenticated, anon;', t);
    execute format($f$
      drop policy if exists %1$I on public.%2$I;
      create policy %1$I on public.%2$I for select to authenticated, anon using (true);
    $f$, t || '_read', t);
    execute format($f$
      drop policy if exists %1$I on public.%2$I;
      create policy %1$I on public.%2$I for all to authenticated
        using (app.is_platform_admin()) with check (app.is_platform_admin());
    $f$, t || '_platform_write', t);
    execute format('grant insert, update, delete on public.%I to authenticated;', t);
  end loop;
end
$$;

-- roles: system roles are visible to everyone signed in; tenant-custom roles
-- only to that tenant.
grant select, insert, update, delete on public.roles to authenticated;

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated
  using (tenant_id is null or app.is_platform_admin() or app.is_tenant_member(tenant_id));

drop policy if exists roles_tenant_write on public.roles;
create policy roles_tenant_write on public.roles for all to authenticated
  using (
    app.is_platform_admin()
    or (tenant_id is not null and not is_system and app.has_permission(tenant_id, 'staff.manage'))
  )
  with check (
    app.is_platform_admin()
    or (tenant_id is not null and not is_system and app.has_permission(tenant_id, 'staff.manage'))
  );

grant select on public.role_permissions to authenticated;
drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and (r.tenant_id is null or app.is_platform_admin() or app.is_tenant_member(r.tenant_id))
    )
  );

grant insert, update, delete on public.role_permissions to authenticated;
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and (app.is_platform_admin() or (r.tenant_id is not null and not r.is_system and app.has_permission(r.tenant_id, 'staff.manage')))
    )
  )
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and (app.is_platform_admin() or (r.tenant_id is not null and not r.is_system and app.has_permission(r.tenant_id, 'staff.manage')))
    )
  );

-- -----------------------------------------------------------------------------
-- platform_users / platform_settings — platform staff only.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.platform_users to authenticated;
drop policy if exists platform_users_self_select on public.platform_users;
create policy platform_users_self_select on public.platform_users for select to authenticated
  using (user_id = auth.uid() or app.is_platform_admin());

drop policy if exists platform_users_super_admin_write on public.platform_users;
create policy platform_users_super_admin_write on public.platform_users for all to authenticated
  using (app.is_platform_super_admin()) with check (app.is_platform_super_admin());

grant select, insert, update, delete on public.platform_settings to authenticated;
drop policy if exists platform_settings_read on public.platform_settings;
create policy platform_settings_read on public.platform_settings for select to authenticated
  using (app.is_platform_admin());
drop policy if exists platform_settings_write on public.platform_settings;
create policy platform_settings_write on public.platform_settings for all to authenticated
  using (app.is_platform_super_admin()) with check (app.is_platform_super_admin());

-- -----------------------------------------------------------------------------
-- audit_logs / login_audit — read-only for those entitled; writes go through
-- the service role so an actor can never suppress or forge their own trail.
-- -----------------------------------------------------------------------------
grant select on public.audit_logs to authenticated;
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    app.is_platform_admin()
    or (tenant_id is not null and app.has_permission(tenant_id, 'audit.view'))
  );

grant select on public.login_audit to authenticated;
drop policy if exists login_audit_select on public.login_audit;
create policy login_audit_select on public.login_audit for select to authenticated
  using (
    app.is_platform_admin()
    or user_id = auth.uid()
    or (tenant_id is not null and app.has_permission(tenant_id, 'audit.view'))
  );

-- -----------------------------------------------------------------------------
-- analytics_events — tenants read their own aggregates. Nobody but the service
-- role may insert, and no tenant can ever see another tenant's traffic.
-- -----------------------------------------------------------------------------
grant select on public.analytics_events to authenticated;
drop policy if exists analytics_events_select on public.analytics_events;
create policy analytics_events_select on public.analytics_events for select to authenticated
  using (app.is_platform_admin() or app.has_permission(tenant_id, 'analytics.view'));

-- rate_limits is service-role only; no grants, no policies.

-- =============================================================================
-- PUBLIC (anon) READ SURFACE — what the separate customer frontend may see.
-- Only published, in-window, active rows belonging to a publicly-serving tenant.
-- =============================================================================

grant select on public.tenants to anon;
revoke select on public.tenants from anon;
grant select (
  id, public_id, slug, name, business_type, logo_url, contact_email, contact_phone,
  contact_whatsapp, website_url, address_line, city, country, timezone,
  default_locale, supported_locales, default_currency
) on public.tenants to anon;

drop policy if exists tenants_public_select on public.tenants;
create policy tenants_public_select on public.tenants for select to anon
  using (app.tenant_is_public(id));

grant select on public.branches to anon;
drop policy if exists branches_public_select on public.branches;
create policy branches_public_select on public.branches for select to anon
  using (deleted_at is null and is_active and app.tenant_is_public(tenant_id));

grant select on public.categories to anon;
drop policy if exists categories_public_select on public.categories;
create policy categories_public_select on public.categories for select to anon
  using (
    deleted_at is null
    and app.is_visible_now(is_active, visible_from, visible_until, visibility_schedule)
    and app.tenant_is_public(tenant_id)
  );

grant select on public.category_branches to anon;
drop policy if exists category_branches_public_select on public.category_branches;
create policy category_branches_public_select on public.category_branches for select to anon
  using (app.tenant_is_public(tenant_id));

grant select on public.category_translations to anon;
drop policy if exists category_translations_public_select on public.category_translations;
create policy category_translations_public_select on public.category_translations for select to anon
  using (
    app.tenant_is_public(tenant_id)
    and exists (
      select 1 from public.categories c
      where c.id = category_id and c.deleted_at is null
        and app.is_visible_now(c.is_active, c.visible_from, c.visible_until, c.visibility_schedule)
    )
  );

-- Items stay visible when out of stock: availability is data the frontend
-- renders, not a reason to hide the row.
grant select on public.items to anon;
drop policy if exists items_public_select on public.items;
create policy items_public_select on public.items for select to anon
  using (
    deleted_at is null
    and app.is_visible_now(is_active, visible_from, visible_until, visibility_schedule)
    and app.tenant_is_public(tenant_id)
  );

grant select on public.item_translations to anon;
drop policy if exists item_translations_public_select on public.item_translations;
create policy item_translations_public_select on public.item_translations for select to anon
  using (
    app.tenant_is_public(tenant_id)
    and exists (
      select 1 from public.items i
      where i.id = item_id and i.deleted_at is null
        and app.is_visible_now(i.is_active, i.visible_from, i.visible_until, i.visibility_schedule)
    )
  );

grant select on public.item_branch_settings to anon;
drop policy if exists item_branch_settings_public_select on public.item_branch_settings;
create policy item_branch_settings_public_select on public.item_branch_settings for select to anon
  using (app.tenant_is_public(tenant_id));

grant select on public.modifier_groups to anon;
drop policy if exists modifier_groups_public_select on public.modifier_groups;
create policy modifier_groups_public_select on public.modifier_groups for select to anon
  using (deleted_at is null and is_active and app.tenant_is_public(tenant_id));

grant select on public.modifier_group_translations to anon;
drop policy if exists modifier_group_translations_public_select on public.modifier_group_translations;
create policy modifier_group_translations_public_select on public.modifier_group_translations for select to anon
  using (app.tenant_is_public(tenant_id));

grant select on public.modifiers to anon;
drop policy if exists modifiers_public_select on public.modifiers;
create policy modifiers_public_select on public.modifiers for select to anon
  using (deleted_at is null and is_active and app.tenant_is_public(tenant_id));

grant select on public.modifier_translations to anon;
drop policy if exists modifier_translations_public_select on public.modifier_translations;
create policy modifier_translations_public_select on public.modifier_translations for select to anon
  using (app.tenant_is_public(tenant_id));

grant select on public.item_modifier_groups to anon;
drop policy if exists item_modifier_groups_public_select on public.item_modifier_groups;
create policy item_modifier_groups_public_select on public.item_modifier_groups for select to anon
  using (app.tenant_is_public(tenant_id));

grant select on public.offers to anon;
drop policy if exists offers_public_select on public.offers;
create policy offers_public_select on public.offers for select to anon
  using (deleted_at is null and app.offer_is_live(is_active, starts_at, ends_at) and app.tenant_is_public(tenant_id));

grant select on public.offer_translations to anon;
drop policy if exists offer_translations_public_select on public.offer_translations;
create policy offer_translations_public_select on public.offer_translations for select to anon
  using (app.tenant_is_public(tenant_id));

grant select on public.offer_targets to anon;
drop policy if exists offer_targets_public_select on public.offer_targets;
create policy offer_targets_public_select on public.offer_targets for select to anon
  using (app.tenant_is_public(tenant_id));

-- Branding only. No AI keys, no internal toggles are stored here.
grant select (
  tenant_id, primary_color, secondary_color, accent_color, background_color,
  font_family, price_display_format, show_prices, tax_display, tax_rate,
  tax_label, social_links, contact_overrides
) on public.business_settings to anon;
drop policy if exists business_settings_public_select on public.business_settings;
create policy business_settings_public_select on public.business_settings for select to anon
  using (app.tenant_is_public(tenant_id));

grant select on public.media_assets to anon;
drop policy if exists media_assets_public_select on public.media_assets;
create policy media_assets_public_select on public.media_assets for select to anon
  using (deleted_at is null and app.tenant_is_public(tenant_id));

-- Default privileges: anything created later starts closed for anon.
alter default privileges in schema public revoke all on tables from anon;
