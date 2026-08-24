"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import { branchSchema } from "@/lib/validation/catalog";
import { fieldErrors } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import {
  assertSubscriptionAllowsWrites,
  auditActor,
  checkPlanLimit,
} from "./shared";

export async function saveBranchAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(PERMISSIONS.branchesManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const supabase = await createServerSupabase();
  const isNew = !data.id;

  if (isNew) {
    const limit = await checkPlanLimit(session.tenant.id, "branches");
    if (limit) return limit;
  }

  const row = {
    tenant_id: session.tenant.id,
    slug: data.slug,
    name: data.name,
    address_line: data.addressLine,
    city: data.city,
    country: data.country.toUpperCase(),
    phone: data.phone,
    whatsapp: data.whatsapp,
    email: data.email,
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone,
    opening_hours: data.openingHours as never,
    qr_target_url: data.qrTargetUrl || null,
    allow_branch_prices: data.allowBranchPrices,
    is_active: data.isActive,
    display_order: data.displayOrder,
  };

  if (isNew) {
    const { data: inserted, error } = await supabase
      .from("branches")
      .insert(row)
      .select("id")
      .single();
    if (error) return mapBranchError(error.message);

    await writeAudit({
      ...auditActor(session),
      action: AUDIT_ACTIONS.branchCreated,
      entityType: "branch",
      entityId: inserted.id,
      newValues: { name: data.name, slug: data.slug },
    });

    revalidatePath("/dashboard/branches");
    return actionOk({ id: inserted.id }, "Branch created.");
  }

  const { data: before } = await supabase
    .from("branches")
    .select("name, slug, is_active, allow_branch_prices")
    .eq("id", data.id!)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  if (!before) return actionError("That branch no longer exists.");

  const { error } = await supabase
    .from("branches")
    .update(row)
    .eq("id", data.id!)
    .eq("tenant_id", session.tenant.id);

  if (error) return mapBranchError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.branchUpdated,
    entityType: "branch",
    entityId: data.id!,
    previousValues: before,
    newValues: { name: data.name, slug: data.slug, is_active: data.isActive },
  });

  revalidatePath("/dashboard/branches");
  return actionOk({ id: data.id! }, "Branch updated.");
}

function mapBranchError(message: string): ActionResult<never> {
  if (/branches_tenant_id_slug_key|duplicate key/i.test(message)) {
    return actionError("That slug is already used by another branch.", {
      slug: ["This slug is already in use"],
    });
  }
  return actionError(message);
}

export async function deleteBranchAction(
  branchId: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.branchesManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const supabase = await createServerSupabase();

  // A business must keep at least one branch, otherwise its public menu has
  // nothing to resolve against.
  const { count } = await supabase
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", session.tenant.id)
    .is("deleted_at", null);

  if ((count ?? 0) <= 1) {
    return actionError("A business must have at least one branch.");
  }

  const { error } = await supabase
    .from("branches")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", branchId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.branchDeleted,
    entityType: "branch",
    entityId: branchId,
  });

  revalidatePath("/dashboard/branches");
  return actionOk(null, "Branch removed.");
}

export async function regenerateBranchCodeAction(
  branchId: string,
): Promise<ActionResult<{ code: string }>> {
  const session = await requirePermission(PERMISSIONS.branchesManage);
  const supabase = await createServerSupabase();

  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const { error } = await supabase
    .from("branches")
    .update({ public_menu_code: code })
    .eq("id", branchId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.branchUpdated,
    entityType: "branch",
    entityId: branchId,
    newValues: { public_menu_code: "rotated" },
  });

  revalidatePath("/dashboard/branches");
  return actionOk(
    { code },
    "A new public menu code has been issued. Update your QR codes.",
  );
}
