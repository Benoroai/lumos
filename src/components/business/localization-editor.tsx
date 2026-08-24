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
import { NativeSelect } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { saveLocalizationAction } from "@/lib/actions/business/settings";
import { cn } from "@/lib/utils";

export function LocalizationEditor({
  languages,
  currencies,
  timezones,
  initial,
  maxLanguages,
  planName,
  canManage,
}: {
  languages: {
    code: string;
    englishName: string;
    nativeName: string;
    direction: string;
  }[];
  currencies: {
    code: string;
    name: string;
    symbol: string;
    decimalDigits: number;
  }[];
  timezones: string[];
  initial: {
    defaultLocale: string;
    supportedLocales: string[];
    defaultCurrency: string;
    timezone: string;
  };
  maxLanguages: number;
  planName: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState(initial);
  const [dirty, setDirty] = useState(false);

  function toggleLocale(code: string, on: boolean) {
    const next = on
      ? [...form.supportedLocales, code]
      : form.supportedLocales.filter((c) => c !== code);

    if (next.length === 0) {
      toast.error("At least one language must stay enabled.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      supportedLocales: next,
      defaultLocale: next.includes(prev.defaultLocale)
        ? prev.defaultLocale
        : (next[0] ?? prev.defaultLocale),
    }));
    setDirty(true);
  }

  function submit() {
    setError(null);
    setErrors({});

    startTransition(async () => {
      const result = await saveLocalizationAction(form);
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

  const selectedCurrency = currencies.find(
    (c) => c.code === form.defaultCurrency,
  );

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Languages</CardTitle>
            <CardDescription>
              The languages your catalog is published in. Your {planName} plan
              allows up to {maxLanguages}.
            </CardDescription>
          </div>
          <Badge
            tone={
              form.supportedLocales.length > maxLanguages ? "danger" : "neutral"
            }
          >
            {form.supportedLocales.length} / {maxLanguages}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {languages.map((language) => {
              const checked = form.supportedLocales.includes(language.code);
              const atLimit =
                !checked && form.supportedLocales.length >= maxLanguages;
              return (
                <label
                  key={language.code}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm",
                    checked
                      ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                      : "border-[var(--border)]",
                    (atLimit || !canManage) && "opacity-60",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={atLimit || !canManage}
                    onCheckedChange={(value) =>
                      toggleLocale(language.code, value === true)
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {language.englishName}
                    </span>
                    <span className="block truncate text-xs text-[var(--foreground-subtle)]">
                      {language.nativeName}
                    </span>
                  </span>
                  {language.direction === "rtl" ? (
                    <Badge tone="secondary">RTL</Badge>
                  ) : null}
                </label>
              );
            })}
          </div>

          <Alert tone="info">
            Selecting Arabic or Persian switches the dashboard to a
            right-to-left layout for anyone who picks that language, and tells
            the public API to serve RTL content.
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Defaults</CardTitle>
            <CardDescription>
              Used when a request does not name a language, and for any content
              that has not been translated yet.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldRow>
            <Field
              id="defaultLocale"
              label="Default language"
              error={errors.defaultLocale}
            >
              <NativeSelect
                id="defaultLocale"
                value={form.defaultLocale}
                disabled={!canManage}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    defaultLocale: e.target.value,
                  }));
                  setDirty(true);
                }}
              >
                {form.supportedLocales.map((code) => {
                  const language = languages.find((l) => l.code === code);
                  return (
                    <option key={code} value={code}>
                      {language?.englishName ?? code}
                    </option>
                  );
                })}
              </NativeSelect>
            </Field>

            <Field
              id="defaultCurrency"
              label="Currency"
              hint={
                selectedCurrency
                  ? `${selectedCurrency.decimalDigits} decimal places — prices are stored exactly.`
                  : undefined
              }
            >
              <NativeSelect
                id="defaultCurrency"
                value={form.defaultCurrency}
                disabled={!canManage}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    defaultCurrency: e.target.value,
                  }));
                  setDirty(true);
                }}
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} — {currency.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field id="timezone" label="Timezone">
              <NativeSelect
                id="timezone"
                value={form.timezone}
                disabled={!canManage}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, timezone: e.target.value }));
                  setDirty(true);
                }}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FieldRow>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} loading={pending} disabled={!canManage}>
          <Save /> Save localization
        </Button>
        {dirty ? (
          <span className="text-xs text-[var(--warning)]">Unsaved changes</span>
        ) : null}
      </div>
    </div>
  );
}
