"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { serverEnv, publicEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { writeAudit, writeLoginAudit, AUDIT_ACTIONS } from "@/lib/audit/log";
import { emailSchema, passwordSchema } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import { LOCALE_COOKIE, isDashboardLocale } from "@/lib/i18n/config";
import { stopImpersonation } from "@/lib/auth/impersonation";

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
  portal: z.enum(["platform", "business"]),
});

async function requestIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Sign-in for both portals.
 *
 * Two properties matter here and are deliberate:
 *  - Failures are indistinguishable to the caller (wrong password, unknown
 *    account, wrong portal all return the same message), so the form cannot be
 *    used to enumerate accounts.
 *  - Rate limiting is keyed on both the address and the email, so neither
 *    spraying one account nor rotating accounts from one host gets a free pass.
 */
export async function signInAction(
  _prev: ActionResult<{ redirectTo: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    portal: formData.get("portal"),
  });

  if (!parsed.success) {
    return actionError("Enter your email and password.");
  }

  const { email, password, portal } = parsed.data;
  const limitPerMinute = serverEnv().AUTH_LOGIN_RATE_LIMIT_PER_MINUTE;
  const ip = await requestIp();

  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(`login:ip:${ip}`, limitPerMinute * 3),
    checkRateLimit(`login:email:${email}`, limitPerMinute),
  ]);

  if (!byIp.allowed || !byEmail.allowed) {
    await writeLoginAudit({
      email,
      portal,
      wasSuccessful: false,
      failureReason: "rate_limited",
    });
    return actionError("Too many attempts. Please try again in a minute.");
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await writeLoginAudit({
      email,
      portal,
      wasSuccessful: false,
      failureReason: error?.message ?? "invalid_credentials",
    });
    return actionError("Email or password is incorrect.");
  }

  if (portal === "platform") {
    const { data: platformUser } = await supabase
      .from("platform_users")
      .select("id, is_active, must_change_password, deleted_at")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!platformUser || !platformUser.is_active || platformUser.deleted_at) {
      await supabase.auth.signOut();
      await writeLoginAudit({
        email,
        portal,
        wasSuccessful: false,
        userId: data.user.id,
        failureReason: "not_a_platform_user",
      });
      return actionError("Email or password is incorrect.");
    }

    await supabase
      .from("platform_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", platformUser.id);

    await writeLoginAudit({
      email,
      portal,
      wasSuccessful: true,
      userId: data.user.id,
    });

    return actionOk({
      redirectTo: platformUser.must_change_password
        ? "/admin/change-password"
        : "/admin",
    });
  }

  const { data: membership } = await supabase
    .from("tenant_users")
    .select(
      "id, tenant_id, status, must_change_password, deleted_at, tenants:tenant_id ( account_status, deleted_at )",
    )
    .eq("user_id", data.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  const tenant = membership?.tenants as unknown as {
    account_status: string;
    deleted_at: string | null;
  } | null;

  if (!membership || !tenant || tenant.deleted_at) {
    await supabase.auth.signOut();
    await writeLoginAudit({
      email,
      portal,
      wasSuccessful: false,
      userId: data.user.id,
      failureReason: "no_active_membership",
    });
    return actionError("Email or password is incorrect.");
  }

  await supabase
    .from("tenant_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", membership.id);

  await writeLoginAudit({
    email,
    portal,
    wasSuccessful: true,
    userId: data.user.id,
    tenantId: membership.tenant_id,
  });

  if (membership.must_change_password)
    return actionOk({ redirectTo: "/change-password" });
  if (tenant.account_status === "suspended")
    return actionOk({ redirectTo: "/account/suspended" });
  if (tenant.account_status === "archived")
    return actionOk({ redirectTo: "/account/archived" });

  return actionOk({ redirectTo: "/dashboard" });
}

export async function signOutAction(
  portal: "platform" | "business" = "business",
): Promise<never> {
  const supabase = await createServerSupabase();
  await stopImpersonation();
  await supabase.auth.signOut();
  redirect(portal === "platform" ? "/admin/login" : "/login");
}

const forgotPasswordSchema = z.object({
  email: emailSchema,
  portal: z.enum(["platform", "business"]),
});

/**
 * Always reports success. Telling a caller whether an address exists is an
 * account-enumeration oracle, and the reset itself is rate limited by address.
 */
export async function requestPasswordResetAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
    portal: formData.get("portal"),
  });

  if (!parsed.success) return actionError("Enter a valid email address.");

  const { email, portal } = parsed.data;
  const limit = await checkRateLimit(`pwreset:${email}`, 5, 900);

  if (limit.allowed) {
    const supabase = await createServerSupabase();
    const redirectTo = `${publicEnv.NEXT_PUBLIC_APP_URL}${portal === "platform" ? "/admin" : ""}/reset-password`;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    await writeAudit({
      action: AUDIT_ACTIONS.passwordResetInitiated,
      entityType: "auth_user",
      entityId: email,
      actorType: "system",
      actorEmail: email,
      metadata: { portal, initiatedBy: "self_service" },
    });
  }

  return actionOk(
    null,
    "If that email is registered, a reset link is on its way.",
  );
}

const changePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = changePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const flat: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (flat[issue.path.join(".") || "_form"] ??= []).push(issue.message);
    }
    return actionError("Please correct the highlighted fields.", flat);
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return actionError("Your session has expired. Sign in again.");

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return actionError(error.message);

  // Clear the forced-change flag on whichever identity this user holds.
  const admin = createAdminSupabase();
  await Promise.all([
    admin
      .from("platform_users")
      .update({ must_change_password: false })
      .eq("user_id", user.id),
    admin
      .from("tenant_users")
      .update({ must_change_password: false })
      .eq("user_id", user.id),
  ]);

  await writeAudit({
    action: AUDIT_ACTIONS.passwordChanged,
    entityType: "auth_user",
    entityId: user.id,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    actorType: "tenant",
  });

  return actionOk(null, "Your password has been updated.");
}

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isDashboardLocale(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false,
  });
}
