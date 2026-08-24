import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database.generated";
import { requestMetadata } from "@/lib/auth/session";

import { AUDIT_ACTIONS, type AuditAction } from "./actions";

export { AUDIT_ACTIONS };
export type { AuditAction };

export type AuditEntry = {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  tenantId?: string | null;
  actorUserId?: string | null;
  actorType?: "platform" | "tenant" | "system" | "public";
  actorEmail?: string | null;
  actorLabel?: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  isImpersonated?: boolean;
  impersonatedBy?: string | null;
};

const REDACTED = "[redacted]";
const SENSITIVE_KEYS = new Set([
  "password",
  "temporary_password",
  "temporaryPassword",
  "access_token",
  "refresh_token",
  "service_role_key",
  "api_key",
  "apiKey",
  "secret",
]);

/** Audit trails must never become a place where secrets accumulate. */
function scrub(values: Record<string, unknown> | null | undefined): Json {
  if (!values) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] = SENSITIVE_KEYS.has(key) ? REDACTED : value;
  }
  return out as Json;
}

/**
 * Writes an audit record through the service role: an actor must not be able
 * to suppress, edit, or forge their own trail. Failures are logged but never
 * propagated — a broken audit sink must not roll back a legitimate change,
 * and the append-only trigger already blocks tampering.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    const { ip, userAgent } = await requestMetadata();
    const admin = createAdminSupabase();
    await admin.from("audit_logs").insert({
      tenant_id: entry.tenantId ?? null,
      actor_user_id: entry.actorUserId ?? null,
      actor_type: entry.actorType ?? "tenant",
      actor_email: entry.actorEmail ?? null,
      actor_label: entry.actorLabel ?? "",
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      previous_values: scrub(entry.previousValues),
      new_values: scrub(entry.newValues),
      metadata: (entry.metadata ?? {}) as Json,
      ip_address: ip,
      user_agent: userAgent,
      is_impersonated: entry.isImpersonated ?? false,
      impersonated_by: entry.impersonatedBy ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to record entry", entry.action, error);
  }
}

export async function writeLoginAudit(params: {
  email: string;
  portal: "platform" | "business";
  wasSuccessful: boolean;
  userId?: string | null;
  tenantId?: string | null;
  failureReason?: string | null;
}): Promise<void> {
  try {
    const { ip, userAgent } = await requestMetadata();
    const admin = createAdminSupabase();
    await admin.from("login_audit").insert({
      email: params.email.toLowerCase(),
      portal: params.portal,
      was_successful: params.wasSuccessful,
      user_id: params.userId ?? null,
      tenant_id: params.tenantId ?? null,
      failure_reason: params.failureReason ?? null,
      ip_address: ip,
      user_agent: userAgent,
    });
  } catch (error) {
    console.error("[audit] failed to record login attempt", error);
  }
}
