"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import {
  renewSubscriptionSchema,
  subscriptionSchema,
} from "@/lib/validation/tenant";
import { fieldErrors } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import { addDays } from "@/lib/subscriptions";

/**
 * Replaces the current subscription period with a new one.
 *
 * The old row is kept but demoted (`is_current = false`) so subscription
 * history survives; a partial unique index guarantees only one current row per
 * tenant, which is what every access check keys on.
 */
export async function setSubscriptionAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSuperAdmin();
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const admin = createAdminSupabase();

  const { data: current } = await admin
    .from("subscriptions")
    .select("id, plan_id, status, starts_at, expires_at")
    .eq("tenant_id", data.tenantId)
    .eq("is_current", true)
    .maybeSingle();

  // Demote first: the partial unique index forbids two current rows.
  if (current) {
    const { error } = await admin
      .from("subscriptions")
      .update({ is_current: false })
      .eq("id", current.id);
    if (error) return actionError(error.message);
  }

  const { error: insertError } = await admin.from("subscriptions").insert({
    tenant_id: data.tenantId,
    plan_id: data.planId,
    status: data.status,
    starts_at: data.startsAt,
    expires_at: data.expiresAt,
    auto_renew: data.autoRenew,
    notes: data.notes,
    is_current: true,
    created_by: session.user.id,
    ...(data.status === "cancelled"
      ? { cancelled_at: new Date().toISOString() }
      : {}),
  });

  if (insertError) {
    // Restore the previous period rather than leaving the tenant with none.
    if (current)
      await admin
        .from("subscriptions")
        .update({ is_current: true })
        .eq("id", current.id);
    return actionError(insertError.message);
  }

  await writeAudit({
    action: current
      ? AUDIT_ACTIONS.subscriptionUpdated
      : AUDIT_ACTIONS.subscriptionCreated,
    entityType: "subscription",
    entityId: data.tenantId,
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    actorType: "platform",
    previousValues: current,
    newValues: {
      plan_id: data.planId,
      status: data.status,
      starts_at: data.startsAt,
      expires_at: data.expiresAt,
    },
  });

  revalidatePath("/admin/subscriptions");
  revalidatePath(`/admin/businesses/${data.tenantId}`);
  return actionOk(null, "Subscription updated.");
}

/** Extends the current period. Defaults to another year. */
export async function renewSubscriptionAction(
  input: unknown,
): Promise<ActionResult<{ expiresAt: string }>> {
  const session = await requirePlatformSuperAdmin();
  const parsed = renewSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const admin = createAdminSupabase();

  const { data: current } = await admin
    .from("subscriptions")
    .select("id, plan_id, status, starts_at, expires_at")
    .eq("tenant_id", data.tenantId)
    .eq("is_current", true)
    .maybeSingle();

  if (!current)
    return actionError("This business has no subscription to renew.");

  // Renewing an already-expired subscription extends from today, otherwise the
  // new period would start in the past and immediately expire again.
  const currentExpiry = new Date(current.expires_at);
  const anchor =
    data.fromToday || currentExpiry.getTime() < Date.now()
      ? new Date()
      : currentExpiry;
  const expiresAt = addDays(anchor, data.durationDays).toISOString();

  const { error } = await admin
    .from("subscriptions")
    .update({
      expires_at: expiresAt,
      plan_id: data.planId ?? current.plan_id,
      // A renewal implicitly lifts a suspension or cancellation.
      status:
        current.status === "cancelled" || current.status === "suspended"
          ? "active"
          : current.status,
      cancelled_at: null,
      notes: data.notes || "",
    })
    .eq("id", current.id);

  if (error) return actionError(error.message);

  await writeAudit({
    action: AUDIT_ACTIONS.subscriptionRenewed,
    entityType: "subscription",
    entityId: current.id,
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    actorType: "platform",
    previousValues: {
      expires_at: current.expires_at,
      plan_id: current.plan_id,
      status: current.status,
    },
    newValues: {
      expires_at: expiresAt,
      plan_id: data.planId ?? current.plan_id,
    },
    metadata: { durationDays: data.durationDays, fromToday: data.fromToday },
  });

  revalidatePath("/admin/subscriptions");
  revalidatePath(`/admin/businesses/${data.tenantId}`);
  return actionOk({ expiresAt }, "Subscription renewed.");
}

export async function cancelSubscriptionAction(
  tenantId: string,
  reason: string,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSuperAdmin();
  const admin = createAdminSupabase();

  const { data: current } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("is_current", true)
    .maybeSingle();

  if (!current) return actionError("This business has no active subscription.");

  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      notes: reason,
    })
    .eq("id", current.id);

  if (error) return actionError(error.message);

  await writeAudit({
    action: AUDIT_ACTIONS.subscriptionCancelled,
    entityType: "subscription",
    entityId: current.id,
    tenantId,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    actorType: "platform",
    previousValues: { status: current.status },
    newValues: { status: "cancelled" },
    metadata: { reason },
  });

  revalidatePath("/admin/subscriptions");
  return actionOk(
    null,
    "Subscription cancelled. The catalog data is preserved.",
  );
}
