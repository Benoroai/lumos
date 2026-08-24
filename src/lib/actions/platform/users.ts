"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  requirePlatformSession,
  requirePlatformSuperAdmin,
} from "@/lib/auth/session";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import { platformUserSchema } from "@/lib/validation/tenant";
import { emailSchema, fieldErrors, uuidSchema } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import { publicEnv } from "@/lib/env";

export async function createPlatformUserAction(
  input: unknown,
): Promise<ActionResult<{ email: string; temporaryPassword: string }>> {
  const session = await requirePlatformSuperAdmin();
  const parsed = platformUserSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const admin = createAdminSupabase();

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

  const { error: profileError } = await admin.from("platform_users").insert({
    user_id: created.user.id,
    email: data.email,
    full_name: data.fullName,
    role: data.role,
    is_active: true,
    must_change_password: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return actionError(profileError.message);
  }

  await writeAudit({
    action: AUDIT_ACTIONS.userCreated,
    entityType: "platform_user",
    entityId: created.user.id,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    actorType: "platform",
    newValues: { email: data.email, role: data.role },
  });

  revalidatePath("/admin/platform-users");
  return actionOk({
    email: data.email,
    temporaryPassword: data.temporaryPassword,
  });
}

const toggleSchema = z.object({
  platformUserId: uuidSchema,
  isActive: z.boolean(),
});

export async function setPlatformUserActiveAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSuperAdmin();
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid request.");

  const admin = createAdminSupabase();
  const { data: target } = await admin
    .from("platform_users")
    .select("id, user_id, email, is_active, role")
    .eq("id", parsed.data.platformUserId)
    .maybeSingle();

  if (!target) return actionError("That platform user no longer exists.");
  if (target.user_id === session.user.id) {
    return actionError("You cannot disable your own account.");
  }

  const { error } = await admin
    .from("platform_users")
    .update({ is_active: parsed.data.isActive })
    .eq("id", target.id);

  if (error) return actionError(error.message);

  await writeAudit({
    action: parsed.data.isActive
      ? AUDIT_ACTIONS.userEnabled
      : AUDIT_ACTIONS.userDisabled,
    entityType: "platform_user",
    entityId: target.user_id,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    actorType: "platform",
    previousValues: { is_active: target.is_active },
    newValues: { is_active: parsed.data.isActive },
  });

  revalidatePath("/admin/platform-users");
  return actionOk(
    null,
    parsed.data.isActive ? "Access restored." : "Access revoked.",
  );
}

const resetSchema = z.object({
  email: emailSchema,
  tenantId: uuidSchema.optional(),
  /**
   * Setting a temporary password immediately is for the case where the user has
   * lost access to their mailbox. Emailing a link is the default because it
   * never puts a credential in a third party's hands.
   */
  mode: z.enum(["email_link", "temporary_password"]).default("email_link"),
  temporaryPassword: z.string().min(10).max(128).optional(),
});

/**
 * Initiates a password reset. A Super Admin can *set* a new credential but can
 * never *read* an existing one — passwords are only ever stored as hashes by
 * Supabase Auth and are not exposed by any endpoint here.
 */
export async function resetUserPasswordAction(
  input: unknown,
): Promise<ActionResult<{ temporaryPassword?: string }>> {
  const session = await requirePlatformSession();
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success)
    return actionError("Invalid request.", fieldErrors(parsed.error));

  const { email, mode, temporaryPassword, tenantId } = parsed.data;
  const admin = createAdminSupabase();

  if (mode === "temporary_password") {
    if (session.role !== "super_admin") {
      return actionError(
        "Only a Platform Super Admin can set a temporary password.",
      );
    }
    if (!temporaryPassword)
      return actionError("Provide the temporary password.");

    const { data: users } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const target = users?.users.find((u) => u.email?.toLowerCase() === email);
    if (!target) return actionError("No account exists for that email.");

    const { error } = await admin.auth.admin.updateUserById(target.id, {
      password: temporaryPassword,
    });
    if (error) return actionError(error.message);

    await Promise.all([
      admin
        .from("platform_users")
        .update({ must_change_password: true })
        .eq("user_id", target.id),
      admin
        .from("tenant_users")
        .update({ must_change_password: true })
        .eq("user_id", target.id),
    ]);

    await writeAudit({
      action: AUDIT_ACTIONS.passwordResetInitiated,
      entityType: "auth_user",
      entityId: target.id,
      tenantId: tenantId ?? null,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      actorType: "platform",
      // The password itself is intentionally not part of the record.
      metadata: { mode, forcedChange: true },
    });

    return actionOk(
      { temporaryPassword },
      "Temporary password set. Share it securely.",
    );
  }

  await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  await writeAudit({
    action: AUDIT_ACTIONS.passwordResetInitiated,
    entityType: "auth_user",
    entityId: email,
    tenantId: tenantId ?? null,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    actorType: "platform",
    metadata: { mode },
  });

  return actionOk({}, "A reset link has been sent.");
}
