-- =============================================================================
-- 0005 — Platform settings (single source of truth for platform-wide policy)
-- =============================================================================

create table if not exists public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  value jsonb not null,
  description text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists platform_settings_touch on public.platform_settings;
create trigger platform_settings_touch before update on public.platform_settings
  for each row execute function app.touch_updated_at();

insert into public.platform_settings (key, value, description) values
  ('public_api.block_expired_subscriptions', 'true'::jsonb,
   'When true, tenants whose subscription has lapsed stop serving the public API.'),
  ('subscription.warning_days', '[30, 14, 7, 1]'::jsonb,
   'Thresholds (days before expiry) that raise a visible renewal alert.'),
  ('subscription.default_duration_days', '365'::jsonb,
   'Default length of a new subscription.'),
  ('platform.default_timezone', '"Asia/Muscat"'::jsonb, 'Default timezone for new businesses.'),
  ('platform.default_currency', '"OMR"'::jsonb, 'Default currency for new businesses.'),
  ('platform.default_locale', '"en"'::jsonb, 'Default dashboard language for new businesses.'),
  ('media.max_upload_bytes', '5242880'::jsonb, 'Largest single media upload accepted.'),
  ('media.allowed_mime_types',
   '["image/jpeg","image/png","image/webp","image/avif","image/svg+xml"]'::jsonb,
   'Media MIME types accepted by the upload endpoint.')
on conflict (key) do nothing;

create or replace function app.platform_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select value from public.platform_settings where key = p_key
$$;

create or replace function app.platform_setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
as $$
  select coalesce((app.platform_setting(p_key))::text::boolean, p_default)
$$;
