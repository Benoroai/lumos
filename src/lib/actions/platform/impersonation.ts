"use server";

import { redirect } from "next/navigation";
import { requirePlatformSession } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  readImpersonation,
  startImpersonation,
  stopImpersonation,
} from "@/lib/auth/impersonation";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import { canImpersonate } from "@/lib/permissions";
import { actionError, type ActionResult } from "@/lib/types/app";

/**
 * Support mode.
 *
 * Impersonation is a genuine capability, so it is deliberately noisy: it is
 * limited to operators who may use it, it is audited on entry and exit, every
 * mutation made inside it is flagged `is_impersonated`, and the dashboard
 * carries a permanent banner while it is active. There is no silent variant.
 */
export async function startImpersonationAction(
  tenantId: string,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSession();
  if (!canImpersonate(session.role)) {
    return actionError("Your platform role cannot start a support session.");
  }

  const admin = createAdminSupabase();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, name, slug, deleted_at")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant || tenant.deleted_at)
    return actionError("That business no longer exists.");

  const startedAt = new Date().toISOString();
  await startImpersonation({
    tenantId,
    platformUserId: session.platformUserId,
    startedAt,
  });

  await writeAudit({
    action: AUDIT_ACTIONS.impersonationStarted,
    entityType: "tenant",
    entityId: tenantId,
    tenantId,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    actorType: "platform",
    actorLabel: session.fullName,
    isImpersonated: true,
    impersonatedBy: session.user.id,
    metadata: { tenantName: tenant.name, tenantSlug: tenant.slug, startedAt },
  });

  redirect("/dashboard");
}

export async function stopImpersonationAction(): Promise<void> {
  const session = await requirePlatformSession();
  const claim = await readImpersonation();

  await stopImpersonation();

  if (claim) {
    await writeAudit({
      action: AUDIT_ACTIONS.impersonationEnded,
      entityType: "tenant",
      entityId: claim.tenantId,
      tenantId: claim.tenantId,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      actorType: "platform",
      isImpersonated: true,
      impersonatedBy: session.user.id,
      metadata: {
        startedAt: claim.startedAt,
        durationSeconds: Math.round(
          (Date.now() - new Date(claim.startedAt).getTime()) / 1000,
        ),
      },
    });
  }

  redirect(claim ? `/admin/businesses/${claim.tenantId}` : "/admin/businesses");
}
