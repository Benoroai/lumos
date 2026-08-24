"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission, requireTenantSession } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import {
  bulkItemActionSchema,
  itemSchema,
  reorderSchema,
  stockToggleSchema,
} from "@/lib/validation/catalog";
import { fieldErrors } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import type { TablesUpdate } from "@/lib/types/database.generated";
import {
  assertSubscriptionAllowsWrites,
  auditActor,
  checkPlanLimit,
} from "./shared";

function revalidateItems() {
  for (const path of [
    "/dashboard/catalog/items",
    "/dashboard/catalog/availability",
    "/dashboard/catalog",
    "/dashboard",
  ]) {
    revalidatePath(path);
  }
}

export async function saveItemAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(PERMISSIONS.itemsManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = itemSchema.safeParse(input);
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
    const limit = await checkPlanLimit(session.tenant.id, "items");
    if (limit) return limit;
  }

  // Price edits are a separate permission from content edits: a Content Editor
  // may rewrite a description but must not be able to change what it costs.
  let previous: Record<string, unknown> | null = null;
  if (!isNew) {
    const { data: before } = await supabase
      .from("items")
      .select("base_price, sale_price, in_stock, is_active, category_id, sku")
      .eq("id", data.id!)
      .eq("tenant_id", session.tenant.id)
      .maybeSingle();

    if (!before) return actionError("That item no longer exists.");
    previous = before;

    const priceChanged =
      Number(before.base_price) !== data.basePrice ||
      Number(before.sale_price ?? -1) !== Number(data.salePrice ?? -1);

    if (priceChanged && !session.permissions.has(PERMISSIONS.itemsPricing)) {
      return actionError("You do not have permission to change prices.", {
        basePrice: ["Pricing is restricted for your role"],
      });
    }
  } else if (
    data.basePrice > 0 &&
    !session.permissions.has(PERMISSIONS.itemsPricing)
  ) {
    return actionError("You do not have permission to set prices.", {
      basePrice: ["Pricing is restricted for your role"],
    });
  }

  const row = {
    tenant_id: session.tenant.id,
    category_id: data.categoryId,
    sku: data.sku,
    base_price: data.basePrice,
    sale_price: data.salePrice,
    currency: data.currency,
    image_path: data.imagePath,
    image_url: data.imageUrl,
    gallery: data.gallery as never,
    is_active: data.isActive,
    in_stock: data.inStock,
    out_of_stock_until: data.outOfStockUntil,
    out_of_stock_reason: data.outOfStockReason,
    is_featured: data.isFeatured,
    is_new: data.isNew,
    is_popular: data.isPopular,
    display_order: data.displayOrder,
    dietary_tags: data.dietaryTags,
    allergens: data.allergens,
    spice_level: data.spiceLevel,
    calories: data.calories,
    preparation_time_minutes: data.preparationTimeMinutes,
    service_duration_minutes: data.serviceDurationMinutes,
    custom_attributes: data.customAttributes as never,
    visible_from: data.visibleFrom,
    visible_until: data.visibleUntil,
    visibility_schedule: (data.visibilitySchedule ?? null) as never,
  };

  let itemId = data.id;

  if (isNew) {
    const { data: inserted, error } = await supabase
      .from("items")
      .insert({ ...row, created_by: session.user.id })
      .select("id")
      .single();

    if (error) return mapItemError(error.message);
    itemId = inserted.id;
  } else {
    const { error } = await supabase
      .from("items")
      .update(row)
      .eq("id", data.id!)
      .eq("tenant_id", session.tenant.id);

    if (error) return mapItemError(error.message);
  }

  if (!itemId) return actionError("Could not save the item.");

  const locales = new Set([
    ...Object.keys(data.name),
    ...Object.keys(data.description),
    ...Object.keys(data.ingredients),
  ]);

  const { error: translationError } = await supabase
    .from("item_translations")
    .upsert(
      [...locales].map((locale) => ({
        tenant_id: session.tenant.id,
        item_id: itemId,
        locale,
        name: data.name[locale] ?? "",
        description: data.description[locale] ?? "",
        ingredients: data.ingredients[locale] ?? "",
      })),
      { onConflict: "item_id,locale" },
    );

  if (translationError) return actionError(translationError.message);

  await supabase
    .from("item_modifier_groups")
    .delete()
    .eq("item_id", itemId)
    .eq("tenant_id", session.tenant.id);

  if (data.modifierGroupIds.length) {
    await supabase.from("item_modifier_groups").insert(
      data.modifierGroupIds.map((groupId, index) => ({
        tenant_id: session.tenant.id,
        item_id: itemId,
        modifier_group_id: groupId,
        display_order: index,
      })),
    );
  }

  if (data.branchSettings.length) {
    await supabase.from("item_branch_settings").upsert(
      data.branchSettings.map((setting) => ({
        tenant_id: session.tenant.id,
        item_id: itemId,
        branch_id: setting.branchId,
        is_available: setting.isAvailable,
        in_stock: setting.inStock,
        price_override: setting.priceOverride,
        sale_price_override: setting.salePriceOverride,
      })),
      { onConflict: "item_id,branch_id" },
    );
  }

  const priceChanged =
    previous && Number(previous.base_price) !== data.basePrice;

  await writeAudit({
    ...auditActor(session),
    action: isNew ? AUDIT_ACTIONS.itemCreated : AUDIT_ACTIONS.itemUpdated,
    entityType: "item",
    entityId: itemId,
    previousValues: previous,
    newValues: {
      name: data.name,
      base_price: data.basePrice,
      sale_price: data.salePrice,
      is_active: data.isActive,
      in_stock: data.inStock,
    },
  });

  // Price movements get their own record so they can be audited on their own.
  if (priceChanged) {
    await writeAudit({
      ...auditActor(session),
      action: AUDIT_ACTIONS.priceChanged,
      entityType: "item",
      entityId: itemId,
      previousValues: {
        base_price: previous?.base_price,
        sale_price: previous?.sale_price,
      },
      newValues: { base_price: data.basePrice, sale_price: data.salePrice },
    });
  }

  revalidateItems();
  return actionOk({ id: itemId }, isNew ? "Item created." : "Item updated.");
}

function mapItemError(message: string): ActionResult<never> {
  if (/items_tenant_sku_idx|duplicate key/i.test(message)) {
    return actionError("That SKU is already used by another item.", {
      sku: ["This code is already in use"],
    });
  }
  if (/items_sale_price_below_base/i.test(message)) {
    return actionError("The sale price must not exceed the base price.", {
      salePrice: ["Must not exceed the base price"],
    });
  }
  if (/row-level security/i.test(message)) {
    return actionError("You do not have permission to change this item.");
  }
  return actionError(message);
}

/**
 * The "86" toggle — the single most-used control in a live service.
 *
 * Marking an item out of stock never deletes or hides it: the row stays, and
 * the public API keeps returning it with an availability flag so the customer
 * frontend can show it greyed out rather than silently losing it.
 */
export async function setItemStockAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.itemsAvailability);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = stockToggleSchema.safeParse(input);
  if (!parsed.success)
    return actionError("Invalid request.", fieldErrors(parsed.error));

  const { itemId, inStock, until, reason, branchId } = parsed.data;
  const supabase = await createServerSupabase();

  if (branchId) {
    const { error } = await supabase.from("item_branch_settings").upsert(
      {
        tenant_id: session.tenant.id,
        item_id: itemId,
        branch_id: branchId,
        in_stock: inStock,
        out_of_stock_until: inStock ? null : until,
        is_available: true,
      },
      { onConflict: "item_id,branch_id" },
    );

    if (error) return actionError(error.message);
  } else {
    const { data: before } = await supabase
      .from("items")
      .select("in_stock")
      .eq("id", itemId)
      .eq("tenant_id", session.tenant.id)
      .maybeSingle();

    if (!before) return actionError("That item no longer exists.");

    const { error } = await supabase
      .from("items")
      .update({
        in_stock: inStock,
        out_of_stock_until: inStock ? null : until,
        out_of_stock_reason: inStock ? null : reason,
      })
      .eq("id", itemId)
      .eq("tenant_id", session.tenant.id);

    if (error) return actionError(error.message);
  }

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.stockChanged,
    entityType: "item",
    entityId: itemId,
    newValues: {
      in_stock: inStock,
      until: until ?? null,
      branch_id: branchId ?? null,
      reason,
    },
  });

  revalidateItems();
  return actionOk(null, inStock ? "Back in stock." : "Marked out of stock.");
}

export async function bulkItemAction(
  input: unknown,
): Promise<ActionResult<{ affected: number }>> {
  const session = await requireTenantSession();
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = bulkItemActionSchema.safeParse(input);
  if (!parsed.success)
    return actionError("Invalid request.", fieldErrors(parsed.error));

  const { itemIds, action, targetCategoryId } = parsed.data;

  // Availability-only staff can flip stock in bulk but nothing else.
  const needed =
    action === "mark_in_stock" || action === "mark_out_of_stock"
      ? PERMISSIONS.itemsAvailability
      : PERMISSIONS.itemsManage;

  if (!session.permissions.has(needed)) {
    return actionError("You do not have permission to perform that action.");
  }

  const supabase = await createServerSupabase();

  const patch: TablesUpdate<"items"> = {};
  switch (action) {
    case "activate":
      patch.is_active = true;
      break;
    case "deactivate":
      patch.is_active = false;
      break;
    case "mark_in_stock":
      patch.in_stock = true;
      patch.out_of_stock_until = null;
      patch.out_of_stock_reason = null;
      break;
    case "mark_out_of_stock":
      patch.in_stock = false;
      break;
    case "move_category":
      patch.category_id = targetCategoryId ?? null;
      break;
    case "delete":
      patch.deleted_at = new Date().toISOString();
      patch.is_active = false;
      break;
  }

  const { data, error } = await supabase
    .from("items")
    .update(patch)
    .in("id", itemIds)
    .eq("tenant_id", session.tenant.id)
    .select("id");

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action:
      action === "delete"
        ? AUDIT_ACTIONS.itemDeleted
        : AUDIT_ACTIONS.itemBulkUpdated,
    entityType: "item",
    entityId: null,
    newValues: { action, itemIds, targetCategoryId: targetCategoryId ?? null },
    metadata: { affected: data?.length ?? 0 },
  });

  revalidateItems();
  return actionOk(
    { affected: data?.length ?? 0 },
    `${data?.length ?? 0} item(s) updated.`,
  );
}

export async function reorderItemsAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.itemsManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid ordering request.");

  const supabase = await createServerSupabase();

  const results = await Promise.all(
    parsed.data.orderedIds.map((id, index) =>
      supabase
        .from("items")
        .update({ display_order: index })
        .eq("id", id)
        .eq("tenant_id", session.tenant.id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return actionError(failed.error.message);

  revalidateItems();
  return actionOk(null, "Order saved.");
}

export async function deleteItemAction(
  itemId: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.itemsManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const supabase = await createServerSupabase();
  const { data: before } = await supabase
    .from("items")
    .select("sku, base_price, is_active")
    .eq("id", itemId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  if (!before) return actionError("That item no longer exists.");

  const { error } = await supabase
    .from("items")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", itemId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.itemDeleted,
    entityType: "item",
    entityId: itemId,
    previousValues: before,
  });

  revalidateItems();
  return actionOk(
    null,
    "Item deleted. It can be restored by the platform administrator.",
  );
}
