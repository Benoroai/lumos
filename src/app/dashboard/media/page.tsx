import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import {
  MediaLibrary,
  type MediaAssetView,
} from "@/components/business/media-library";
import { requireTenantSession } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/lib/permissions";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage() {
  const session = await requireTenantSession();
  const supabase = await createServerSupabase();

  const { data: assets } = await supabase
    .from("media_assets")
    .select("*")
    .eq("tenant_id", session.tenant.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  const views: MediaAssetView[] = (assets ?? []).map((asset) => ({
    id: asset.id,
    url: asset.url ?? "",
    path: asset.path,
    altText: asset.alt_text,
    kind: asset.kind,
    mimeType: asset.mime_type,
    sizeBytes: Number(asset.size_bytes),
    originalFilename: asset.original_filename,
    createdAt: asset.created_at,
  }));

  return (
    <>
      <PageHeader
        title="Media"
        description="Images used across your catalog. Every file lives in a folder scoped to this business."
        breadcrumbs={[{ label: "Media" }]}
      />

      <Alert tone="info" title="Alt text matters">
        A short description of each image makes your menu readable to customers
        using a screen reader, and gives search engines something to work with.
      </Alert>

      <MediaLibrary
        assets={views}
        canManage={session.permissions.has(PERMISSIONS.mediaManage)}
        maxBytes={serverEnv().MEDIA_MAX_UPLOAD_BYTES}
      />
    </>
  );
}
