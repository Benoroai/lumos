-- =============================================================================
-- 0007 — Storage: tenant-isolated media bucket
--
-- Object keys are always `<tenant_id>/<kind>/<uuid>.<ext>`. The first path
-- segment is the isolation boundary and is enforced by policy, so a crafted
-- upload path cannot land in — or read from — another tenant's folder.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-media',
  'tenant-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Safely extract the tenant id from an object key; NULL when the key is not
-- shaped like a tenant folder, which makes every policy below fail closed.
create or replace function app.storage_tenant_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(object_name, '/', 1)::uuid
    else null
  end
$$;

grant execute on function app.storage_tenant_id(text) to anon, authenticated, service_role;

alter table storage.objects enable row level security;

drop policy if exists tenant_media_member_select on storage.objects;
create policy tenant_media_member_select on storage.objects for select to authenticated
  using (
    bucket_id = 'tenant-media'
    and app.storage_tenant_id(name) is not null
    and (app.is_platform_admin() or app.is_tenant_member(app.storage_tenant_id(name)))
  );

drop policy if exists tenant_media_member_insert on storage.objects;
create policy tenant_media_member_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tenant-media'
    and app.storage_tenant_id(name) is not null
    and (
      app.is_platform_admin()
      or app.has_permission(app.storage_tenant_id(name), 'media.manage')
    )
  );

drop policy if exists tenant_media_member_update on storage.objects;
create policy tenant_media_member_update on storage.objects for update to authenticated
  using (
    bucket_id = 'tenant-media'
    and app.storage_tenant_id(name) is not null
    and (app.is_platform_admin() or app.has_permission(app.storage_tenant_id(name), 'media.manage'))
  )
  with check (
    bucket_id = 'tenant-media'
    and app.storage_tenant_id(name) is not null
    and (app.is_platform_admin() or app.has_permission(app.storage_tenant_id(name), 'media.manage'))
  );

drop policy if exists tenant_media_member_delete on storage.objects;
create policy tenant_media_member_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'tenant-media'
    and app.storage_tenant_id(name) is not null
    and (app.is_platform_admin() or app.has_permission(app.storage_tenant_id(name), 'media.manage'))
  );

-- The customer frontend renders images straight from storage, but only for
-- tenants that are actually serving their public menu.
drop policy if exists tenant_media_public_select on storage.objects;
create policy tenant_media_public_select on storage.objects for select to anon
  using (
    bucket_id = 'tenant-media'
    and app.storage_tenant_id(name) is not null
    and app.tenant_is_public(app.storage_tenant_id(name))
  );
