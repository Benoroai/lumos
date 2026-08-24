"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import {
  ALLOWED_IMAGE_TYPES,
  mediaUpdateSchema,
} from "@/lib/validation/catalog";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import { publicEnv, serverEnv } from "@/lib/env";
import { assertSubscriptionAllowsWrites, auditActor } from "./shared";

export type UploadedMedia = {
  id: string;
  path: string;
  url: string;
  altText: string;
  width: number | null;
  height: number | null;
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

/**
 * Uploads one image.
 *
 * The object key is always `<tenant_id>/<kind>/<uuid>.<ext>` — generated here,
 * never taken from the client. The original filename only survives as metadata,
 * so a crafted name cannot traverse into another tenant's folder, and storage
 * RLS independently rejects any key whose first segment is not a tenant the
 * caller belongs to.
 */
export async function uploadMediaAction(
  formData: FormData,
): Promise<ActionResult<UploadedMedia>> {
  const session = await requirePermission(PERMISSIONS.mediaManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const file = formData.get("file");
  const kindRaw = String(formData.get("kind") ?? "image");
  const altText = String(formData.get("altText") ?? "").slice(0, 300);

  if (!(file instanceof File)) return actionError("Choose a file to upload.");

  const maxBytes = serverEnv().MEDIA_MAX_UPLOAD_BYTES;
  if (file.size === 0) return actionError("That file is empty.");
  if (file.size > maxBytes) {
    return actionError(
      `Files must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`,
    );
  }

  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return actionError(
      "Only JPEG, PNG, WebP, AVIF and SVG images are accepted.",
    );
  }

  const kind = ["image", "logo", "icon", "gallery", "document"].includes(
    kindRaw,
  )
    ? kindRaw
    : "image";
  const extension = EXTENSIONS[file.type] ?? "bin";
  const path = `${session.tenant.id}/${kind}/${crypto.randomUUID()}.${extension}`;
  const bucket = serverEnv().SUPABASE_STORAGE_BUCKET;

  const supabase = await createServerSupabase();
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    return actionError(
      /row-level security|not authorized/i.test(uploadError.message)
        ? "You do not have permission to upload media for this business."
        : uploadError.message,
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  const { data: asset, error: recordError } = await supabase
    .from("media_assets")
    .insert({
      tenant_id: session.tenant.id,
      bucket,
      path,
      url: publicUrl,
      kind: kind as never,
      mime_type: file.type,
      size_bytes: file.size,
      alt_text: altText,
      original_filename: file.name.slice(0, 200),
      uploaded_by: session.user.id,
    })
    .select("id, path, url, alt_text, width, height")
    .single();

  if (recordError || !asset) {
    // Don't leave an orphaned object behind if the bookkeeping row failed.
    await supabase.storage.from(bucket).remove([path]);
    return actionError(recordError?.message ?? "Could not record the upload.");
  }

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.mediaUploaded,
    entityType: "media_asset",
    entityId: asset.id,
    newValues: { path, kind, size_bytes: file.size, mime_type: file.type },
  });

  revalidatePath("/dashboard/media");

  return actionOk({
    id: asset.id,
    path: asset.path,
    url: asset.url ?? publicUrl,
    altText: asset.alt_text,
    width: asset.width,
    height: asset.height,
  });
}

export async function updateMediaAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.mediaManage);
  const parsed = mediaUpdateSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid request.");

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("media_assets")
    .update({ alt_text: parsed.data.altText })
    .eq("id", parsed.data.mediaId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  revalidatePath("/dashboard/media");
  return actionOk(null, "Media updated.");
}

export async function deleteMediaAction(
  mediaId: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.mediaManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const supabase = await createServerSupabase();
  const { data: asset } = await supabase
    .from("media_assets")
    .select("id, bucket, path")
    .eq("id", mediaId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  if (!asset) return actionError("That file no longer exists.");

  await supabase.storage.from(asset.bucket).remove([asset.path]);

  const { error } = await supabase
    .from("media_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", mediaId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.mediaDeleted,
    entityType: "media_asset",
    entityId: mediaId,
    previousValues: { path: asset.path },
  });

  revalidatePath("/dashboard/media");
  return actionOk(null, "File removed.");
}

/** Public URL for a stored object. Safe to call from client components. */
export async function mediaPublicUrl(path: string): Promise<string> {
  const base = publicEnv.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const bucket = publicEnv.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
