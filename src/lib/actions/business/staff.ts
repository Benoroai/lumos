"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import { staffInviteSchema, staffUpdateSchema } from "@/lib/validation/tenant";
import { fieldErrors } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import {
  assertSubscriptionAllowsWrites,
  auditActor,
  checkPlanLimit,
} from "./shared";

/**
 * Adds a staff member.
 *
 * The owner sets a temporary password and the account is forced to change it on
 * first sign-in, so no credential the owner knows survives past that point.
 */
export async function inviteStaffAction(
  input: unknown,
): Promise<ActionResult<{ email: string; temporaryPassword: string }>> {
  const session = await requirePermission(PERMISSIONS.staffManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = staffInviteSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const limit = await checkPlanLimit(session.tenant.id, "users");
  if (limit) return limit;

  const admin = createAdminSupabase();
  const supabase = await createServerSupabase();

  // The role must be a system role or one belonging to this tenant — never
  // another tenant's custom role.
  const { data: role } = await supabase
    .from("roles")
    .select("id, code, tenant_id, is_owner_role")
    .eq("id", data.roleId)
    .maybeSingle();

  if (
    !role ||
    (role.tenant_id !== null && role.tenant_id !== session.tenant.id)
  ) {
    return actionError("That role is not available for this business.");
  }
  if (role.is_owner_role && !session.isOwner) {
    return actionError("Only the business owner can grant owner access.");
  }

  const { data: existing } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const existingUser = existing?.users.find(
    (u) => u.email?.toLowerCase() === data.email,
  );

  let userId = existingUser?.id;

  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });

    if (error || !created.user) {
      return actionError(error?.message ?? "Could not create the account.", {
        email: [error?.message ?? "Could not create the account"],
      });
    }
    userId = created.user.id;
  } else {
    const { data: alreadyMember } = await supabase
      .from("tenant_users")
      .select("id")
      .eq("tenant_id", session.tenant.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (alreadyMember) {
      return actionError("That person is already a member of this business.", {
        email: ["Already a member"],
      });
    }
  }

  const { data: membership, error: membershipError } = await supabase
    .from("tenant_users")
    .insert({
      tenant_id: session.tenant.id,
      user_id: userId,
      role_id: data.roleId,
      email: data.email,
      full_name: data.fullName,
      status: "active",
      is_owner: false,
      must_change_password: true,
      branch_ids: data.branchIds,
      invited_by: session.user.id,
      invited_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (membershipError || !membership) {
    if (!existingUser && userId)
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    return actionError(
      membershipError?.message ?? "Could not add the staff member.",
    );
  }

  await savePermissionOverrides(
    session.tenant.id,
    membership.id,
    data.grantedPermissions,
    data.revokedPermissions,
  );

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.userCreated,
    entityType: "tenant_user",
    entityId: membership.id,
    newValues: {
      email: data.email,
      role_id: data.roleId,
      role_code: role.code,
      branch_ids: data.branchIds,
    },
  });

  revalidatePath("/dashboard/staff");
  return actionOk({
    email: data.email,
    temporaryPassword: data.temporaryPassword,
  });
}

export async function updateStaffAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.staffManage);
  const parsed = staffUpdateSchema.safeParse(input);
  if (!parsed.success)
    return actionError("Invalid request.", fieldErrors(parsed.error));

  const data = parsed.data;
  const supabase = await createServerSupabase();

  const { data: membership } = await supabase
    .from("tenant_users")
    .select("id, user_id, is_owner, role_id, status, email")
    .eq("id", data.membershipId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  if (!membership) return actionError("That staff member no longer exists.");

  // Guard rails around the owner account: it cannot be demoted or disabled
  // from here, otherwise a business could lock itself out entirely.
  if (membership.is_owner) {
    return actionError(
      "The business owner account is managed by the platform administrator.",
    );
  }
  if (membership.user_id === session.user.id) {
    return actionError("You cannot change your own role or access.");
  }

  const { error } = await supabase
    .from("tenant_users")
    .update({
      role_id: data.roleId,
      status: data.status,
      branch_ids: data.branchIds,
    })
    .eq("id", data.membershipId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await savePermissionOverrides(
    session.tenant.id,
    data.membershipId,
    data.grantedPermissions,
    data.revokedPermissions,
  );

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.roleChanged,
    entityType: "tenant_user",
    entityId: data.membershipId,
    previousValues: { role_id: membership.role_id, status: membership.status },
    newValues: {
      role_id: data.roleId,
      status: data.status,
      granted: data.grantedPermissions,
      revoked: data.revokedPermissions,
    },
  });

  revalidatePath("/dashboard/staff");
  return actionOk(null, "Staff member updated.");
}

async function savePermissionOverrides(
  tenantId: string,
  membershipId: string,
  granted: string[],
  revoked: string[],
): Promise<void> {
  const supabase = await createServerSupabase();

  await supabase
    .from("tenant_user_permissions")
    .delete()
    .eq("tenant_user_id", membershipId)
    .eq("tenant_id", tenantId);

  const rows = [
    ...granted.map((key) => ({
      tenant_id: tenantId,
      tenant_user_id: membershipId,
      permission_key: key,
      effect: "grant",
    })),
    ...revoked.map((key) => ({
      tenant_id: tenantId,
      tenant_user_id: membershipId,
      permission_key: key,
      effect: "revoke",
    })),
  ];

  if (rows.length) await supabase.from("tenant_user_permissions").insert(rows);
}

export async function removeStaffAction(
  membershipId: string,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.staffManage);
  const supabase = await createServerSupabase();

  const { data: membership } = await supabase
    .from("tenant_users")
    .select("id, user_id, is_owner, email")
    .eq("id", membershipId)
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  if (!membership) return actionError("That staff member no longer exists.");
  if (membership.is_owner)
    return actionError("The business owner cannot be removed here.");
  if (membership.user_id === session.user.id)
    return actionError("You cannot remove yourself.");

  const { error } = await supabase
    .from("tenant_users")
    .update({ status: "disabled", deleted_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("tenant_id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.userDisabled,
    entityType: "tenant_user",
    entityId: membershipId,
    previousValues: { email: membership.email },
  });

  revalidatePath("/dashboard/staff");
  return actionOk(null, "Access removed.");
}
