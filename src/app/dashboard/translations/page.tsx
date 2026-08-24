import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import {
  TranslationWorkbench,
  type TranslationRowView,
} from "@/components/business/translation-workbench";
import { requireTenantSession } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCatalogContext } from "@/lib/queries/business/catalog";
import { PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Translations" };

type RawTranslation = {
  locale: string;
  name: string;
  description?: string;
  status: string;
  is_machine_generated: boolean;
};

function toRows(
  records: { id: string; translations: RawTranslation[] }[],
  defaultLocale: string,
): TranslationRowView[] {
  return records.map((record) => {
    const translations: TranslationRowView["translations"] = {};
    for (const row of record.translations ?? []) {
      translations[row.locale] = {
        name: row.name,
        description: row.description ?? "",
        status: row.status,
        isMachineGenerated: row.is_machine_generated,
      };
    }
    return {
      id: record.id,
      sourceName: translations[defaultLocale]?.name ?? "",
      translations,
    };
  });
}

export default async function TranslationsPage() {
  const session = await requireTenantSession();
  const supabase = await createServerSupabase();
  const context = await getCatalogContext(session.tenant.id);

  const [
    { data: items },
    { data: categories },
    { data: groups },
    { data: offers },
    { data: jobs },
  ] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, item_translations!left ( locale, name, description, status, is_machine_generated )",
      )
      .eq("tenant_id", session.tenant.id)
      .is("deleted_at", null)
      .order("display_order")
      .limit(300),
    supabase
      .from("categories")
      .select(
        "id, category_translations!left ( locale, name, description, status, is_machine_generated )",
      )
      .eq("tenant_id", session.tenant.id)
      .is("deleted_at", null)
      .order("display_order"),
    supabase
      .from("modifier_groups")
      .select(
        "id, modifier_group_translations!left ( locale, name, description, status, is_machine_generated )",
      )
      .eq("tenant_id", session.tenant.id)
      .is("deleted_at", null)
      .order("display_order"),
    supabase
      .from("offers")
      .select(
        "id, offer_translations!left ( locale, name, description, status, is_machine_generated )",
      )
      .eq("tenant_id", session.tenant.id)
      .is("deleted_at", null)
      .order("display_order"),
    supabase
      .from("translation_jobs")
      .select(
        "id, entity_type, status, provider, target_locales, created_at, result",
      )
      .eq("tenant_id", session.tenant.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const canManage = session.permissions.has(PERMISSIONS.translationsManage);
  const canApprove = session.permissions.has(PERMISSIONS.translationsApprove);
  const aiEnabled = context.settings?.ai_translation_enabled ?? true;
  const shared = {
    locales: session.tenant.supportedLocales,
    defaultLocale: session.tenant.defaultLocale,
    canManage,
    canApprove,
    aiEnabled,
  };

  return (
    <>
      <PageHeader
        title="Translations"
        description="Review and approve every language your catalog is published in."
        breadcrumbs={[{ label: "Translations" }]}
      />

      <Alert tone="info" title="Approved translations are protected">
        AI translation never overwrites an approved translation without an
        explicit confirmation, so copy you have signed off cannot be replaced by
        a machine on a stray click.
      </Alert>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="modifiers">Modifiers</TabsTrigger>
          <TabsTrigger value="offers">Offers</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <TranslationWorkbench
            {...shared}
            entityType="item"
            entityLabel="items"
            rows={toRows(
              (items ?? []).map((row) => ({
                id: row.id,
                translations: (row.item_translations ??
                  []) as unknown as RawTranslation[],
              })),
              session.tenant.defaultLocale,
            )}
          />
        </TabsContent>

        <TabsContent value="categories">
          <TranslationWorkbench
            {...shared}
            entityType="category"
            entityLabel="categories"
            rows={toRows(
              (categories ?? []).map((row) => ({
                id: row.id,
                translations: (row.category_translations ??
                  []) as unknown as RawTranslation[],
              })),
              session.tenant.defaultLocale,
            )}
          />
        </TabsContent>

        <TabsContent value="modifiers">
          <TranslationWorkbench
            {...shared}
            entityType="modifier_group"
            entityLabel="modifier groups"
            rows={toRows(
              (groups ?? []).map((row) => ({
                id: row.id,
                translations: (row.modifier_group_translations ??
                  []) as unknown as RawTranslation[],
              })),
              session.tenant.defaultLocale,
            )}
          />
        </TabsContent>

        <TabsContent value="offers">
          <TranslationWorkbench
            {...shared}
            entityType="offer"
            entityLabel="offers"
            rows={toRows(
              (offers ?? []).map((row) => ({
                id: row.id,
                translations: (row.offer_translations ??
                  []) as unknown as RawTranslation[],
              })),
              session.tenant.defaultLocale,
            )}
          />
        </TabsContent>
      </Tabs>

      {jobs?.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-[var(--foreground-muted)] uppercase">
            Recent translation jobs
          </h2>
          <ul className="space-y-1.5">
            {jobs.map((job) => {
              const result = job.result as {
                translated?: number;
                skippedApproved?: number;
              } | null;
              return (
                <li
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm"
                >
                  <span className="text-[var(--foreground-muted)]">
                    {job.entity_type} → {job.target_locales.join(", ")} via{" "}
                    {job.provider}
                  </span>
                  <span className="text-[var(--foreground-subtle)]">
                    {job.status}
                    {result?.translated !== undefined
                      ? ` · ${result.translated} translated`
                      : ""}
                    {result?.skippedApproved
                      ? ` · ${result.skippedApproved} approved kept`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
