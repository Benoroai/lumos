"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field, FieldRow, FormSection } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { saveBrandingAction } from "@/lib/actions/business/settings";
import {
  formatPrice,
  type CurrencyInfo,
  type PriceDisplayFormat,
} from "@/lib/format/money";
import { textDirection } from "@/lib/i18n/config";

export type BrandingValues = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
  priceDisplayFormat: PriceDisplayFormat;
  showPrices: boolean;
  taxDisplay: "inclusive" | "exclusive" | "hidden";
  taxRate: string;
  taxLabel: string;
  socialLinks: Record<string, string>;
};

const SOCIAL_FIELDS = [
  "instagram",
  "facebook",
  "x",
  "tiktok",
  "snapchat",
  "youtube",
] as const;

export function BrandingEditor({
  initial,
  businessName,
  logoUrl,
  currency,
  locale,
  sampleItems,
  canManage,
}: {
  initial: BrandingValues;
  businessName: string;
  logoUrl: string | null;
  currency: CurrencyInfo;
  locale: string;
  sampleItems: {
    name: string;
    description: string;
    price: number;
    salePrice: number | null;
  }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);

  function set<K extends keyof BrandingValues>(
    key: K,
    value: BrandingValues[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function submit() {
    setError(null);
    setErrors({});

    startTransition(async () => {
      const result = await saveBrandingAction({
        ...form,
        taxRate: form.taxRate === "" ? 0 : form.taxRate,
      });

      if (result.ok) {
        toast.success(result.message ?? "Saved");
        setDirty(false);
        router.refresh();
      } else {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Colours</CardTitle>
              <CardDescription>
                These drive your public menu — not this dashboard.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <FieldRow>
              <ColorField
                id="primaryColor"
                label="Primary"
                value={form.primaryColor}
                onChange={(v) => set("primaryColor", v)}
                error={errors.primaryColor}
              />
              <ColorField
                id="secondaryColor"
                label="Secondary"
                value={form.secondaryColor}
                onChange={(v) => set("secondaryColor", v)}
                error={errors.secondaryColor}
              />
              <ColorField
                id="accentColor"
                label="Accent"
                value={form.accentColor}
                onChange={(v) => set("accentColor", v)}
                error={errors.accentColor}
              />
              <ColorField
                id="backgroundColor"
                label="Background"
                value={form.backgroundColor}
                onChange={(v) => set("backgroundColor", v)}
                error={errors.backgroundColor}
              />
            </FieldRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Prices and tax</CardTitle>
              <CardDescription>
                How amounts appear to customers.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldRow>
              <Field id="priceDisplayFormat" label="Price format">
                <NativeSelect
                  id="priceDisplayFormat"
                  value={form.priceDisplayFormat}
                  onChange={(e) =>
                    set(
                      "priceDisplayFormat",
                      e.target.value as PriceDisplayFormat,
                    )
                  }
                >
                  <option value="symbol_before">
                    {currency.symbol} 12.500
                  </option>
                  <option value="symbol_after">12.500 {currency.symbol}</option>
                  <option value="code_after">12.500 {currency.code}</option>
                  <option value="amount_only">12.500</option>
                </NativeSelect>
              </Field>

              <Field id="taxDisplay" label="Tax display">
                <NativeSelect
                  id="taxDisplay"
                  value={form.taxDisplay}
                  onChange={(e) =>
                    set(
                      "taxDisplay",
                      e.target.value as BrandingValues["taxDisplay"],
                    )
                  }
                >
                  <option value="inclusive">Prices include tax</option>
                  <option value="exclusive">Tax added at checkout</option>
                  <option value="hidden">Do not mention tax</option>
                </NativeSelect>
              </Field>

              <Field id="taxRate" label="Tax rate (%)">
                <Input
                  id="taxRate"
                  inputMode="decimal"
                  value={form.taxRate}
                  onChange={(e) => set("taxRate", e.target.value)}
                  className="tabular"
                />
              </Field>

              <Field id="taxLabel" label="Tax label">
                <Input
                  id="taxLabel"
                  value={form.taxLabel}
                  onChange={(e) => set("taxLabel", e.target.value)}
                />
              </Field>
            </FieldRow>

            <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  Show prices publicly
                </span>
                <span className="block text-xs text-[var(--foreground-muted)]">
                  Turn off for a menu where prices are quoted in person.
                </span>
              </span>
              <Switch
                checked={form.showPrices}
                onCheckedChange={(v) => set("showPrices", v)}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Social links</CardTitle>
              <CardDescription>
                Shown on your public menu footer.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <FormSection title="Profiles">
              <FieldRow>
                {SOCIAL_FIELDS.map((platform) => (
                  <Field
                    key={platform}
                    id={`social-${platform}`}
                    label={platform}
                  >
                    <Input
                      id={`social-${platform}`}
                      value={form.socialLinks[platform] ?? ""}
                      onChange={(e) =>
                        set("socialLinks", {
                          ...form.socialLinks,
                          [platform]: e.target.value,
                        })
                      }
                      placeholder="https://"
                    />
                  </Field>
                ))}
              </FieldRow>
            </FormSection>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} loading={pending} disabled={!canManage}>
            <Save /> Save branding
          </Button>
          {dirty ? (
            <span className="text-xs text-[var(--warning)]">
              Unsaved changes
            </span>
          ) : null}
        </div>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Live preview</CardTitle>
              <CardDescription>
                An impression of your public menu. The customer-facing frontend
                is a separate application that reads this configuration through
                the public API.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div
              dir={textDirection(locale)}
              className="overflow-hidden rounded-xl border border-[var(--border)]"
              style={{ backgroundColor: form.backgroundColor }}
            >
              <div
                className="flex items-center gap-3 px-4 py-4"
                style={{ backgroundColor: form.primaryColor }}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt=""
                    className="size-9 rounded-lg bg-white/20 object-cover"
                  />
                ) : (
                  <span
                    className="flex size-9 items-center justify-center rounded-lg text-sm font-bold"
                    style={{
                      backgroundColor: form.accentColor,
                      color: form.secondaryColor,
                    }}
                  >
                    {businessName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate font-semibold text-white">
                  {businessName}
                </span>
              </div>

              <div className="space-y-2 p-4">
                <span
                  className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: form.accentColor,
                    color: form.secondaryColor,
                  }}
                >
                  Popular
                </span>

                {sampleItems.map((item, index) => (
                  <div
                    key={index}
                    className="rounded-lg border p-3"
                    style={{
                      borderColor: `${form.secondaryColor}22`,
                      backgroundColor: "#ffffffcc",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="truncate text-sm font-semibold"
                          style={{ color: form.secondaryColor }}
                        >
                          {item.name}
                        </p>
                        {item.description ? (
                          <p
                            className="mt-0.5 line-clamp-2 text-xs"
                            style={{ color: `${form.secondaryColor}99` }}
                          >
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                      {form.showPrices ? (
                        <p
                          className="tabular shrink-0 text-sm font-semibold"
                          style={{ color: form.primaryColor }}
                        >
                          {item.salePrice !== null ? (
                            <>
                              <span
                                className="me-1.5 line-through"
                                style={{ color: `${form.secondaryColor}66` }}
                              >
                                {formatPrice(
                                  item.price,
                                  currency,
                                  form.priceDisplayFormat,
                                  locale,
                                )}
                              </span>
                              {formatPrice(
                                item.salePrice,
                                currency,
                                form.priceDisplayFormat,
                                locale,
                              )}
                            </>
                          ) : (
                            formatPrice(
                              item.price,
                              currency,
                              form.priceDisplayFormat,
                              locale,
                            )
                          )}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}

                {form.taxDisplay !== "hidden" ? (
                  <p
                    className="pt-1 text-[11px]"
                    style={{ color: `${form.secondaryColor}88` }}
                  >
                    {form.taxDisplay === "inclusive"
                      ? `Prices include ${form.taxLabel} at ${form.taxRate || 0}%`
                      : `${form.taxLabel} of ${form.taxRate || 0}% is added`}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  "primaryColor",
                  "secondaryColor",
                  "accentColor",
                  "backgroundColor",
                ] as const
              ).map((key) => (
                <Badge key={key} tone="neutral">
                  <span
                    className="me-1 inline-block size-2.5 rounded-full border border-black/10"
                    style={{ backgroundColor: form[key] }}
                  />
                  {form[key]}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string[] | undefined;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <div className="flex gap-2">
        <Input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9.5 w-14 p-1"
          aria-label={`${label} colour picker`}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="font-mono uppercase"
          aria-label={`${label} hex value`}
        />
      </div>
    </Field>
  );
}
