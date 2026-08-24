"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import {
  aiTranslateSchema,
  saveTranslationSchema,
} from "@/lib/validation/catalog";
import { fieldErrors } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import { assertSubscriptionAllowsWrites, auditActor } from "./shared";
import { getTranslationProvider } from "@/lib/ai/translation";

type EntityType = "item" | "category" | "modifier_group" | "modifier" | "offer";

const TABLES: Record<
  EntityType,
  {
    table: string;
    fk: string;
    hasIngredients: boolean;
    hasDescription: boolean;
  }
> = {
  item: {
    table: "item_translations",
    fk: "item_id",
    hasIngredients: true,
    hasDescription: true,
  },
  category: {
    table: "category_translations",
    fk: "category_id",
    hasIngredients: false,
    hasDescription: true,
  },
  modifier_group: {
    table: "modifier_group_translations",
    fk: "modifier_group_id",
    hasIngredients: false,
    hasDescription: true,
  },
  modifier: {
    table: "modifier_translations",
    fk: "modifier_id",
    hasIngredients: false,
    hasDescription: false,
  },
  offer: {
    table: "offer_translations",
    fk: "offer_id",
    hasIngredients: false,
    hasDescription: true,
  },
};

const CONTEXT: Record<EntityType, string> = {
  item: "menu item or service name and description",
  category: "menu category name",
  modifier_group: "menu option group name",
  modifier: "menu option name",
  offer: "promotional offer name and description",
};

export async function saveTranslationAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.translationsManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = saveTranslationSchema.safeParse(input);
  if (!parsed.success)
    return actionError("Invalid request.", fieldErrors(parsed.error));

  const data = parsed.data;
  const config = TABLES[data.entityType];

  // Approving is its own permission: an editor may draft a translation, but
  // marking it as the approved public copy is a separate decision.
  if (
    data.status === "approved" &&
    !session.permissions.has(PERMISSIONS.translationsApprove)
  ) {
    return actionError("You do not have permission to approve translations.");
  }

  const supabase = await createServerSupabase();

  const row: Record<string, unknown> = {
    tenant_id: session.tenant.id,
    [config.fk]: data.entityId,
    locale: data.locale,
    name: data.name,
    status: data.status,
    is_machine_generated: false,
    ...(config.hasDescription ? { description: data.description } : {}),
    ...(config.hasIngredients ? { ingredients: data.ingredients } : {}),
    ...(data.status === "approved"
      ? { approved_at: new Date().toISOString(), approved_by: session.user.id }
      : {}),
  };

  const { error } = await supabase
    .from(config.table as never)
    .upsert(row as never, { onConflict: `${config.fk},locale` });

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.translationUpdated,
    entityType: data.entityType,
    entityId: data.entityId,
    newValues: { locale: data.locale, status: data.status },
  });

  revalidatePath("/dashboard/translations");
  return actionOk(null, "Translation saved.");
}

export type AiTranslateResult = {
  jobId: string;
  translated: number;
  skippedApproved: number;
  failed: number;
  provider: string;
};

/**
 * Runs AI translation over a selection.
 *
 * Approved translations are never silently replaced. When any target already
 * holds an approved translation the caller must opt in explicitly via
 * `overwriteApproved`; otherwise those locales are counted as skipped and
 * reported back so the UI can ask before retrying.
 */
export async function aiTranslateAction(
  input: unknown,
): Promise<ActionResult<AiTranslateResult>> {
  const session = await requirePermission(PERMISSIONS.translationsManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = aiTranslateSchema.safeParse(input);
  if (!parsed.success)
    return actionError("Invalid request.", fieldErrors(parsed.error));

  const data = parsed.data;
  const config = TABLES[data.entityType as EntityType];
  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();
  const provider = getTranslationProvider();

  const { data: settings } = await supabase
    .from("business_settings")
    .select("ai_translation_enabled, require_translation_approval")
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  if (settings && !settings.ai_translation_enabled) {
    return actionError("AI translation is turned off for this business.");
  }

  const { data: job, error: jobError } = await supabase
    .from("translation_jobs")
    .insert({
      tenant_id: session.tenant.id,
      entity_type: data.entityType,
      entity_id: data.entityIds[0]!,
      source_locale: data.sourceLocale,
      target_locales: data.targetLocales,
      status: "running",
      provider: provider.name,
      model: provider.model,
      overwrite_approved: data.overwriteApproved,
      requested_by: session.user.id,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobError || !job)
    return actionError(
      jobError?.message ?? "Could not start the translation job.",
    );

  let translated = 0;
  let skippedApproved = 0;
  let failed = 0;

  try {
    for (const entityId of data.entityIds) {
      const { data: sourceRow } = await supabase
        .from(config.table as never)
        .select("name, description, ingredients")
        .eq(config.fk, entityId)
        .eq("locale", data.sourceLocale)
        .maybeSingle();

      const source = sourceRow as {
        name?: string;
        description?: string;
        ingredients?: string;
      } | null;

      if (!source?.name) continue;

      for (const targetLocale of data.targetLocales) {
        if (targetLocale === data.sourceLocale) continue;

        const { data: existingRow } = await supabase
          .from(config.table as never)
          .select("status")
          .eq(config.fk, entityId)
          .eq("locale", targetLocale)
          .maybeSingle();

        const existing = existingRow as { status?: string } | null;

        if (existing?.status === "approved" && !data.overwriteApproved) {
          skippedApproved += 1;
          continue;
        }

        try {
          const result = await provider.translate({
            sourceLocale: data.sourceLocale,
            targetLocale,
            context: CONTEXT[data.entityType as EntityType],
            fields: {
              name: source.name,
              ...(config.hasDescription && source.description
                ? { description: source.description }
                : {}),
              ...(config.hasIngredients && source.ingredients
                ? { ingredients: source.ingredients }
                : {}),
            },
          });

          const row: Record<string, unknown> = {
            tenant_id: session.tenant.id,
            [config.fk]: entityId,
            locale: targetLocale,
            name: result.fields.name ?? source.name,
            status: "ai_generated",
            is_machine_generated: true,
            approved_at: null,
            approved_by: null,
            ...(config.hasDescription
              ? { description: result.fields.description ?? "" }
              : {}),
            ...(config.hasIngredients
              ? { ingredients: result.fields.ingredients ?? "" }
              : {}),
          };

          const { error } = await supabase
            .from(config.table as never)
            .upsert(row as never, { onConflict: `${config.fk},locale` });

          if (error) throw new Error(error.message);
          translated += 1;
        } catch (error) {
          console.error(
            "[ai-translate] entity failed",
            entityId,
            targetLocale,
            error,
          );
          failed += 1;
        }
      }
    }

    await admin
      .from("translation_jobs")
      .update({
        status: failed > 0 && translated === 0 ? "failed" : "completed",
        completed_at: new Date().toISOString(),
        result: { translated, skippedApproved, failed } as never,
      })
      .eq("id", job.id);
  } catch (error) {
    await admin
      .from("translation_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", job.id);

    return actionError(
      "The translation job failed. Nothing approved was changed.",
    );
  }

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.translationJobStarted,
    entityType: data.entityType,
    entityId: job.id,
    newValues: {
      provider: provider.name,
      model: provider.model,
      targets: data.targetLocales,
      translated,
      skippedApproved,
      failed,
      overwriteApproved: data.overwriteApproved,
    },
  });

  revalidatePath("/dashboard/translations");

  const message = skippedApproved
    ? `${translated} translated. ${skippedApproved} approved translation(s) were left untouched.`
    : `${translated} translation(s) generated.`;

  return actionOk(
    {
      jobId: job.id,
      translated,
      skippedApproved,
      failed,
      provider: provider.name,
    },
    message,
  );
}

export async function approveTranslationsAction(
  entityType: EntityType,
  entityIds: string[],
  locale: string,
): Promise<ActionResult<{ approved: number }>> {
  const session = await requirePermission(PERMISSIONS.translationsApprove);
  const config = TABLES[entityType];
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from(config.table as never)
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: session.user.id,
    } as never)
    .in(config.fk, entityIds)
    .eq("locale", locale)
    .eq("tenant_id", session.tenant.id)
    .select("id");

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.translationUpdated,
    entityType,
    entityId: null,
    newValues: { locale, approved: data?.length ?? 0 },
  });

  revalidatePath("/dashboard/translations");
  return actionOk(
    { approved: data?.length ?? 0 },
    `${data?.length ?? 0} translation(s) approved.`,
  );
}
