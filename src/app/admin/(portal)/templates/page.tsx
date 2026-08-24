import type { Metadata } from "next";
import { LayoutTemplate } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { requirePlatformSession } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  BUSINESS_TYPE_LABELS,
  OPTIONAL_FIELD_LABELS,
  parseDefaultCategories,
  parseDefaultModifierGroups,
  type OptionalItemField,
} from "@/lib/business-templates";
import type { BusinessType } from "@/lib/types/app";

export const metadata: Metadata = { title: "Business types and templates" };

export default async function TemplatesPage() {
  await requirePlatformSession();
  const admin = createAdminSupabase();

  const [{ data: templates }, { data: usage }] = await Promise.all([
    admin
      .from("business_templates")
      .select("*")
      .is("deleted_at", null)
      .order("sort_order"),
    admin.from("tenants").select("template_id").is("deleted_at", null),
  ]);

  const usageByTemplate = new Map<string, number>();
  for (const row of usage ?? []) {
    if (!row.template_id) continue;
    usageByTemplate.set(
      row.template_id,
      (usageByTemplate.get(row.template_id) ?? 0) + 1,
    );
  }

  return (
    <>
      <PageHeader
        title="Business types and templates"
        description="Templates decide terminology, starter categories and which optional fields are surfaced."
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Business types" },
        ]}
      />

      <Alert tone="info" title="One model, many vocabularies">
        A template never creates its own tables. A restaurant dish, a café drink
        and a salon service are all rows in the same{" "}
        <code className="font-mono">items</code> table — the template only
        changes the words, the defaults and the fields the dashboard shows.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        {(templates ?? []).map((template) => {
          const categories = parseDefaultCategories(
            template.default_categories,
          );
          const groups = parseDefaultModifierGroups(
            template.default_modifier_groups,
          );
          const fields = Array.isArray(template.enabled_item_fields)
            ? (template.enabled_item_fields as string[])
            : [];
          const terminology = (template.terminology ?? {}) as Record<
            string,
            Record<string, string> | undefined
          >;

          return (
            <Card key={template.id}>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutTemplate className="size-4 text-[var(--foreground-subtle)]" />
                    {template.name}
                  </CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge tone="secondary">
                    {
                      BUSINESS_TYPE_LABELS[
                        template.business_type as BusinessType
                      ]
                    }
                  </Badge>
                  <span className="text-xs text-[var(--foreground-subtle)]">
                    {usageByTemplate.get(template.id) ?? 0} business(es)
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--foreground-subtle)] uppercase">
                    Terminology
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {(["en", "ar", "fa"] as const).map((locale) => {
                          const words = terminology[locale];
                          if (!words) return null;
                          return (
                            <tr
                              key={locale}
                              className="border-b border-[var(--border)] last:border-0"
                            >
                              <td className="py-1.5 pe-3 font-mono text-xs text-[var(--foreground-subtle)]">
                                {locale}
                              </td>
                              <td className="py-1.5">
                                {[words.catalog, words.category, words.item]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--foreground-subtle)] uppercase">
                    Optional fields enabled by default
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {fields.length ? (
                      fields.map((field) => (
                        <Badge key={field} tone="neutral">
                          {OPTIONAL_FIELD_LABELS[field as OptionalItemField] ??
                            field}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-[var(--foreground-muted)]">
                        None
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--foreground-subtle)] uppercase">
                      Starter categories
                    </p>
                    <ul className="space-y-0.5 text-sm text-[var(--foreground-muted)]">
                      {categories.length ? (
                        categories.map((category) => (
                          <li key={category.slug}>
                            {category.en}
                            {category.ar ? (
                              <span className="ms-2 text-[var(--foreground-subtle)]">
                                {category.ar}
                              </span>
                            ) : null}
                          </li>
                        ))
                      ) : (
                        <li>None</li>
                      )}
                    </ul>
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--foreground-subtle)] uppercase">
                      Starter modifier groups
                    </p>
                    <ul className="space-y-0.5 text-sm text-[var(--foreground-muted)]">
                      {groups.length ? (
                        groups.map((group) => (
                          <li key={group.code}>
                            {group.en}{" "}
                            <span className="text-xs text-[var(--foreground-subtle)]">
                              ({group.selection_type}
                              {group.is_required ? ", required" : ""})
                            </span>
                          </li>
                        ))
                      ) : (
                        <li>None</li>
                      )}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
