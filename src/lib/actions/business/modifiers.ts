"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import { modifierGroupSchema } from "@/lib/validation/catalog";
import { fieldErrors } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import { assertSubscriptionAllowsWrites, auditActor } from "./shared";

/**
 * Saves a modifier group with its options in one call. Options that disappeared
 * from the submitted list are soft-deleted rather than removed, so historical
 * references stay resolvable.
 */
export async function saveModifierGroupAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(PERMISSIONS.modifiersManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = modifierGroupSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const supabase = await createServerSupabase();
  const isNew = !data.id;

  const groupRow = {
    tenant_id: session.tenant.id,
    code: data.code,
    selection_type: data.selectionType,
    is_required: data.isRequired,
    min_selections: data.minSelections,
    max_selections: data.maxSelections,
    display_order: data.displayOrder,
    is_active: data.isActive,
  };

  let groupId = data.id;

  if (isNew) {
    const { data: inserted, error } = await supabase
      .from("modifier_groups")
      .insert(groupRow)
      .select("id")
      .single();
    if (error) return mapError(error.message);
    groupId = inserted.id;
  } else {
    const { error } = await supabase
      .from("modifier_groups")
      .update(groupRow)
      .eq("id", data.id!)
      .eq("tenant_id", session.tenant.id);
    if (error) return mapError(error.message);
  }

  if (!groupId) return actionError("Could not save the modifier group.");

  await supabase.from("modifier_group_translations").upsert(
    Object.keys({ ...data.name, ...data.description }).map((locale) => ({
      tenant_id: session.tenant.id,
      modifier_group_id: groupId,
      locale,
      name: data.name[locale] ?? "",
      description: data.description[locale] ?? "",
    })),
    { onConflict: "modifier_group_id,locale" },
  );

  const keptIds: string[] = [];

  for (const [index, modifier] of data.modifiers.entries()) {
    const modifierRow = {
      tenant_id: session.tenant.id,
      modifier_group_id: groupId,
      code: modifier.code,
      price_adjustment: modifier.priceAdjustment,
      is_default: modifier.isDefault,
      is_active: modifier.isActive,
      in_stock: modifier.inStock,
      display_order: index,
      deleted_at: null,
    };

    let modifierId = modifier.id;

    if (modifierId) {
      const { error } = await supabase
        .from("modifiers")
        .update(modifierRow)
        .eq("id", modifierId)
        .eq("tenant_id", session.tenant.id);
      if (error) return mapError(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("modifiers")
        .insert(modifierRow)
        .select("id")
        .single();
      if (error) return mapError(error.message);
      modifierId = inserted.id;
    }

    keptIds.push(modifierId);

    await supabase.from("modifier_translations").upsert(
      Object.keys(modifier.name).map((locale) => ({
        tenant_id: session.tenant.id,
        modifier_id: modifierId,
        locale,
        name: modifier.name[locale] ?? "",
      })),
      { onConflict: "modifier_id,locale" },
    );
  }

  const removal = supabase
    .from("modifiers")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("modifier_group_id", groupId)
    .eq("tenant_id", session.tenant.id)
    .is("deleted_at", null);

  await (keptIds.length
    ? removal.not("id", "in", `(${keptIds.join(",")})`)
    : removal);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.modifierGroupChanged,
    entityType: "modifier_group",
    entityId: groupId,
    newValues: {
      code: data.code,
      options: data.modifiers.length,
      is_active: data.isActive,
    },
  });

  revalidatePath("/dashboard/catalog/modifiers");
  return actionOk(
    { id: groupId },
    isNew ? "Modifier group created." : "Modifier group updated.",
  );
}

function mapError(message: string): ActionResult<never> {
  if (/duplicate key/i.test(message)) {
    return actionError("That code is already used.", {
      code: ["This code is already in use"],
    });
  }
  if (/modifier_groups_required_min/i.test(message)) {
    return actionError(
      "A required group needs a minimum of at least one selection.",
    );
  }
  return actionError(message);
}

export async function deleteModifierGroupAction(
  groupId: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.modifiersManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("modifier_groups")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", groupId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.modifierGroupChanged,
    entityType: "modifier_group",
    entityId: groupId,
    newValues: { deleted: true },
  });

  revalidatePath("/dashboard/catalog/modifiers");
  return actionOk(null, "Modifier group removed.");
}
