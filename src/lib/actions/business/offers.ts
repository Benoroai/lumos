"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import { offerSchema } from "@/lib/validation/catalog";
import { fieldErrors } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import { assertSubscriptionAllowsWrites, auditActor } from "./shared";

/**
 * Offers are windowed rather than toggled off: an offer stops applying the
 * moment `ends_at` passes, with no job to run and no row to delete, so past
 * promotions remain in the history for reporting.
 */
export async function saveOfferAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(PERMISSIONS.offersManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = offerSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const supabase = await createServerSupabase();
  const isNew = !data.id;

  const row = {
    tenant_id: session.tenant.id,
    code: data.code,
    discount_type: data.discountType,
    discount_value: data.discountValue,
    image_path: data.imagePath,
    image_url: data.imageUrl,
    starts_at: data.startsAt,
    ends_at: data.endsAt,
    is_active: data.isActive,
    display_order: data.displayOrder,
  };

  let offerId = data.id;
  let previous: Record<string, unknown> | null = null;

  if (isNew) {
    const { data: inserted, error } = await supabase
      .from("offers")
      .insert({ ...row, created_by: session.user.id })
      .select("id")
      .single();
    if (error) return mapError(error.message);
    offerId = inserted.id;
  } else {
    const { data: before } = await supabase
      .from("offers")
      .select(
        "code, discount_type, discount_value, starts_at, ends_at, is_active",
      )
      .eq("id", data.id!)
      .eq("tenant_id", session.tenant.id)
      .maybeSingle();

    if (!before) return actionError("That offer no longer exists.");
    previous = before;

    const { error } = await supabase
      .from("offers")
      .update(row)
      .eq("id", data.id!)
      .eq("tenant_id", session.tenant.id);
    if (error) return mapError(error.message);
  }

  if (!offerId) return actionError("Could not save the offer.");

  await supabase.from("offer_translations").upsert(
    Object.keys({ ...data.name, ...data.description }).map((locale) => ({
      tenant_id: session.tenant.id,
      offer_id: offerId,
      locale,
      name: data.name[locale] ?? "",
      description: data.description[locale] ?? "",
    })),
    { onConflict: "offer_id,locale" },
  );

  await supabase
    .from("offer_targets")
    .delete()
    .eq("offer_id", offerId)
    .eq("tenant_id", session.tenant.id);

  const targets: Record<string, unknown>[] = [];

  if (data.targetType === "all_items") {
    targets.push({
      tenant_id: session.tenant.id,
      offer_id: offerId,
      target_type: "all_items",
    });
  } else if (data.targetType === "items") {
    for (const itemId of data.itemIds) {
      targets.push({
        tenant_id: session.tenant.id,
        offer_id: offerId,
        target_type: "item",
        item_id: itemId,
      });
    }
  } else {
    for (const categoryId of data.categoryIds) {
      targets.push({
        tenant_id: session.tenant.id,
        offer_id: offerId,
        target_type: "category",
        category_id: categoryId,
      });
    }
  }

  // Branch scoping is a separate axis: no branch rows means every branch.
  for (const branchId of data.branchIds) {
    targets.push({
      tenant_id: session.tenant.id,
      offer_id: offerId,
      target_type: "branch",
      branch_id: branchId,
    });
  }

  if (targets.length) {
    const { error } = await supabase
      .from("offer_targets")
      .insert(targets as never);
    if (error) return actionError(error.message);
  }

  await writeAudit({
    ...auditActor(session),
    action: isNew ? AUDIT_ACTIONS.offerCreated : AUDIT_ACTIONS.offerUpdated,
    entityType: "offer",
    entityId: offerId,
    previousValues: previous,
    newValues: {
      code: data.code,
      discount_type: data.discountType,
      discount_value: data.discountValue,
      starts_at: data.startsAt,
      ends_at: data.endsAt,
      is_active: data.isActive,
    },
  });

  revalidatePath("/dashboard/offers");
  return actionOk({ id: offerId }, isNew ? "Offer created." : "Offer updated.");
}

function mapError(message: string): ActionResult<never> {
  if (/duplicate key/i.test(message)) {
    return actionError("That code is already used by another offer.", {
      code: ["This code is already in use"],
    });
  }
  if (/offers_percentage_bounds/i.test(message)) {
    return actionError("A percentage discount cannot exceed 100.", {
      discountValue: ["Must be 100 or less"],
    });
  }
  if (/offers_window_valid/i.test(message)) {
    return actionError("The end date must be after the start date.", {
      endsAt: ["Must be after the start date"],
    });
  }
  return actionError(message);
}

export async function deleteOfferAction(
  offerId: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.offersManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("offers")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", offerId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.offerDeleted,
    entityType: "offer",
    entityId: offerId,
  });

  revalidatePath("/dashboard/offers");
  return actionOk(null, "Offer removed. Its history is preserved.");
}

export async function toggleOfferActiveAction(
  offerId: string,
  isActive: boolean,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.offersManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("offers")
    .update({ is_active: isActive })
    .eq("id", offerId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.offerUpdated,
    entityType: "offer",
    entityId: offerId,
    newValues: { is_active: isActive },
  });

  revalidatePath("/dashboard/offers");
  return actionOk(null, isActive ? "Offer activated." : "Offer paused.");
}
