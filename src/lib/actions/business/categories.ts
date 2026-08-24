"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import { categorySchema, reorderSchema } from "@/lib/validation/catalog";
import { fieldErrors, uuidSchema } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import {
  assertSubscriptionAllowsWrites,
  auditActor,
  checkPlanLimit,
} from "./shared";

const CATALOG_PATHS = [
  "/dashboard/catalog/categories",
  "/dashboard/catalog",
  "/dashboard",
];

function revalidateCatalog() {
  for (const path of CATALOG_PATHS) revalidatePath(path);
}

export async function saveCategoryAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission(PERMISSIONS.categoriesManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = categorySchema.safeParse(input);
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
    const limit = await checkPlanLimit(session.tenant.id, "categories");
    if (limit) return limit;
  }

  // A category cannot become its own ancestor — that would make the tree
  // unrenderable and the public API recurse forever.
  if (
    data.parentId &&
    data.id &&
    (await createsCycle(data.id, data.parentId))
  ) {
    return actionError("A category cannot be nested inside itself.", {
      parentId: ["Choose a different parent category"],
    });
  }

  const row = {
    tenant_id: session.tenant.id,
    slug: data.slug,
    parent_id: data.parentId,
    image_path: data.imagePath,
    image_url: data.imageUrl,
    icon: data.icon,
    color: data.color,
    is_active: data.isActive,
    display_order: data.displayOrder,
    visible_from: data.visibleFrom,
    visible_until: data.visibleUntil,
    visibility_schedule: (data.visibilitySchedule ?? null) as never,
  };

  let categoryId = data.id;
  let previous: Record<string, unknown> | null = null;

  if (isNew) {
    const { data: inserted, error } = await supabase
      .from("categories")
      .insert(row)
      .select("id")
      .single();

    if (error) return mapCategoryError(error.message);
    categoryId = inserted.id;
  } else {
    const { data: before } = await supabase
      .from("categories")
      .select("slug, is_active, display_order, parent_id")
      .eq("id", data.id!)
      .maybeSingle();

    previous = before ?? null;

    const { error } = await supabase
      .from("categories")
      .update(row)
      .eq("id", data.id!)
      .eq("tenant_id", session.tenant.id);

    if (error) return mapCategoryError(error.message);
  }

  if (!categoryId) return actionError("Could not save the category.");

  const { error: translationError } = await supabase
    .from("category_translations")
    .upsert(
      Object.keys({ ...data.name, ...data.description }).map((locale) => ({
        tenant_id: session.tenant.id,
        category_id: categoryId,
        locale,
        name: data.name[locale] ?? "",
        description: data.description[locale] ?? "",
      })),
      { onConflict: "category_id,locale" },
    );

  if (translationError) return actionError(translationError.message);

  // Branch visibility: no rows means "every branch", so we clear and rewrite.
  await supabase
    .from("category_branches")
    .delete()
    .eq("category_id", categoryId)
    .eq("tenant_id", session.tenant.id);

  if (data.branchIds.length) {
    await supabase.from("category_branches").insert(
      data.branchIds.map((branchId) => ({
        tenant_id: session.tenant.id,
        category_id: categoryId,
        branch_id: branchId,
      })),
    );
  }

  await writeAudit({
    ...auditActor(session),
    action: isNew
      ? AUDIT_ACTIONS.categoryCreated
      : AUDIT_ACTIONS.categoryUpdated,
    entityType: "category",
    entityId: categoryId,
    previousValues: previous,
    newValues: { slug: data.slug, is_active: data.isActive, name: data.name },
  });

  revalidateCatalog();
  return actionOk(
    { id: categoryId },
    isNew ? "Category created." : "Category updated.",
  );
}

async function createsCycle(
  categoryId: string,
  parentId: string,
): Promise<boolean> {
  const supabase = await createServerSupabase();
  let cursor: string | null = parentId;

  for (let depth = 0; depth < 20 && cursor; depth += 1) {
    if (cursor === categoryId) return true;
    const result: { data: { parent_id: string | null } | null } = await supabase
      .from("categories")
      .select("parent_id")
      .eq("id", cursor)
      .maybeSingle();
    cursor = result.data?.parent_id ?? null;
  }

  return false;
}

function mapCategoryError(message: string): ActionResult<never> {
  if (/categories_tenant_id_slug_key|duplicate key/i.test(message)) {
    return actionError("That slug is already used by another category.", {
      slug: ["This slug is already in use"],
    });
  }
  if (/row-level security/i.test(message)) {
    return actionError("You do not have permission to change this category.");
  }
  return actionError(message);
}

/**
 * Persists a drag-and-drop reorder. Positions are derived from array order in
 * one pass, so no two categories can end up sharing a position.
 */
export async function reorderCategoriesAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.categoriesManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid ordering request.");

  const supabase = await createServerSupabase();

  const { data: owned } = await supabase
    .from("categories")
    .select("id")
    .eq("tenant_id", session.tenant.id)
    .in("id", parsed.data.orderedIds);

  const ownedIds = new Set((owned ?? []).map((row) => row.id));
  if (ownedIds.size !== parsed.data.orderedIds.length) {
    return actionError(
      "Some categories in that ordering do not belong to this business.",
    );
  }

  const results = await Promise.all(
    parsed.data.orderedIds.map((id, index) =>
      supabase
        .from("categories")
        .update({ display_order: index })
        .eq("id", id)
        .eq("tenant_id", session.tenant.id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return actionError(failed.error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.categoryReordered,
    entityType: "category",
    entityId: null,
    newValues: { orderedIds: parsed.data.orderedIds },
  });

  revalidateCatalog();
  return actionOk(null, "Order saved.");
}

const deleteSchema = z.object({
  categoryId: uuidSchema,
  moveItemsTo: uuidSchema.nullable().optional(),
});

/**
 * Soft-deletes a category. Items are never deleted with it: they are either
 * moved to another category or left uncategorised, because losing menu items
 * to a mis-click is not recoverable from the UI.
 */
export async function deleteCategoryAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.categoriesManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid request.");

  const supabase = await createServerSupabase();
  const { data: before } = await supabase
    .from("categories")
    .select("slug, is_active")
    .eq("id", parsed.data.categoryId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  if (!before) return actionError("That category no longer exists.");

  await supabase
    .from("items")
    .update({ category_id: parsed.data.moveItemsTo ?? null })
    .eq("category_id", parsed.data.categoryId)
    .eq("tenant_id", session.tenant.id);

  const { error } = await supabase
    .from("categories")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", parsed.data.categoryId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.categoryDeleted,
    entityType: "category",
    entityId: parsed.data.categoryId,
    previousValues: before,
    metadata: { movedItemsTo: parsed.data.moveItemsTo ?? null },
  });

  revalidateCatalog();
  return actionOk(null, "Category deleted. Its items were kept.");
}

const toggleSchema = z.object({
  categoryId: uuidSchema,
  isActive: z.boolean(),
});

export async function toggleCategoryActiveAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.categoriesManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid request.");

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.categoryId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.categoryUpdated,
    entityType: "category",
    entityId: parsed.data.categoryId,
    newValues: { is_active: parsed.data.isActive },
  });

  revalidateCatalog();
  return actionOk(
    null,
    parsed.data.isActive ? "Category is now visible." : "Category hidden.",
  );
}
