"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  KeyRound,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldRow, FormSection } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/ui/copy-button";
import {
  createBusinessAction,
  type CreatedBusinessSummary,
} from "@/lib/actions/platform/businesses";
import { slugify } from "@/lib/format/slug";
import { generateTemporaryPassword } from "@/lib/utils";
import {
  defaultExpiryFrom,
  DEFAULT_SUBSCRIPTION_DAYS,
} from "@/lib/subscriptions";
import { toDateInputValue } from "@/lib/format/date";
import { BUSINESS_TYPE_LABELS } from "@/lib/business-templates";
import { cn } from "@/lib/utils";
import type { BusinessType } from "@/lib/types/app";

export type WizardOption = { id: string; code: string; name: string };

export type WizardTemplate = WizardOption & {
  businessType: BusinessType;
  description: string;
  defaultCategories: { slug: string; en: string }[];
};

export type WizardPlan = WizardOption & {
  durationDays: number;
  maxBranches: number;
  maxItems: number;
  maxCategories: number;
  maxUsers: number;
  maxLanguages: number;
  priceAmount: number;
  priceCurrency: string;
  isDefault: boolean;
};

const STEPS = [
  "Business information",
  "Business type",
  "Plan and subscription",
  "Currency and languages",
  "Owner account",
  "Features and limits",
  "Review",
] as const;

type FormState = {
  name: string;
  legalName: string;
  slug: string;
  slugTouched: boolean;
  contactEmail: string;
  contactPhone: string;
  contactWhatsapp: string;
  websiteUrl: string;
  addressLine: string;
  city: string;
  country: string;
  timezone: string;
  businessType: BusinessType;
  templateId: string;
  planId: string;
  subscriptionStartsAt: string;
  subscriptionExpiresAt: string;
  subscriptionStatus: "active" | "trial";
  defaultCurrency: string;
  defaultLocale: string;
  supportedLocales: string[];
  ownerEmail: string;
  ownerFullName: string;
  ownerPassword: string;
  forcePasswordChange: boolean;
  featureFlags: Record<string, boolean>;
  internalNotes: string;
  seedDefaultCategories: boolean;
};

export function CreateBusinessWizard({
  templates,
  plans,
  currencies,
  languages,
  featureFlags,
  timezones,
}: {
  templates: WizardTemplate[];
  plans: WizardPlan[];
  currencies: {
    code: string;
    name: string;
    symbol: string;
    decimalDigits: number;
  }[];
  languages: {
    code: string;
    englishName: string;
    nativeName: string;
    direction: string;
  }[];
  featureFlags: {
    key: string;
    name: string;
    description: string;
    defaultEnabled: boolean;
  }[];
  timezones: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedBusinessSummary | null>(null);

  const defaultPlan = plans.find((p) => p.isDefault) ?? plans[0];
  const today = new Date();

  const [form, setForm] = useState<FormState>({
    name: "",
    legalName: "",
    slug: "",
    slugTouched: false,
    contactEmail: "",
    contactPhone: "",
    contactWhatsapp: "",
    websiteUrl: "",
    addressLine: "",
    city: "",
    country: "OM",
    timezone: "Asia/Muscat",
    businessType: "restaurant",
    templateId:
      templates.find((t) => t.businessType === "restaurant")?.id ??
      templates[0]?.id ??
      "",
    planId: defaultPlan?.id ?? "",
    subscriptionStartsAt: toDateInputValue(today),
    subscriptionExpiresAt: toDateInputValue(
      defaultExpiryFrom(
        today,
        defaultPlan?.durationDays ?? DEFAULT_SUBSCRIPTION_DAYS,
      ),
    ),
    subscriptionStatus: "active",
    defaultCurrency: "OMR",
    defaultLocale: "en",
    supportedLocales: ["en", "ar"],
    ownerEmail: "",
    ownerFullName: "",
    ownerPassword: generateTemporaryPassword(),
    forcePasswordChange: true,
    featureFlags: Object.fromEntries(
      featureFlags.map((f) => [f.key, f.defaultEnabled]),
    ),
    internalNotes: "",
    seedDefaultCategories: true,
  });

  const selectedPlan = plans.find((p) => p.id === form.planId);
  const selectedTemplate = templates.find((t) => t.id === form.templateId);
  const selectedCurrency = currencies.find(
    (c) => c.code === form.defaultCurrency,
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateName(name: string) {
    setForm((prev) => ({
      ...prev,
      name,
      // Keep the slug in step with the name until the operator edits it.
      slug: prev.slugTouched ? prev.slug : slugify(name, "business"),
    }));
  }

  function selectBusinessType(type: BusinessType) {
    const template = templates.find((t) => t.businessType === type);
    setForm((prev) => ({
      ...prev,
      businessType: type,
      templateId: template?.id ?? prev.templateId,
    }));
  }

  function selectPlan(planId: string) {
    const plan = plans.find((p) => p.id === planId);
    const start = new Date(form.subscriptionStartsAt || Date.now());
    setForm((prev) => ({
      ...prev,
      planId,
      subscriptionExpiresAt: toDateInputValue(
        defaultExpiryFrom(
          start,
          plan?.durationDays ?? DEFAULT_SUBSCRIPTION_DAYS,
        ),
      ),
    }));
  }

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return (
          form.name.trim().length >= 2 &&
          /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug)
        );
      case 1:
        return !!form.templateId;
      case 2:
        return (
          !!form.planId &&
          !!form.subscriptionStartsAt &&
          !!form.subscriptionExpiresAt &&
          new Date(form.subscriptionExpiresAt) >
            new Date(form.subscriptionStartsAt)
        );
      case 3:
        return (
          form.supportedLocales.length > 0 &&
          form.supportedLocales.includes(form.defaultLocale)
        );
      case 4:
        return (
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail) &&
          form.ownerFullName.trim().length >= 2 &&
          form.ownerPassword.length >= 10
        );
      default:
        return true;
    }
  }, [step, form]);

  function submit() {
    setFormError(null);
    setErrors({});

    startTransition(async () => {
      const result = await createBusinessAction({
        ...form,
        subscriptionStartsAt: new Date(form.subscriptionStartsAt).toISOString(),
        subscriptionExpiresAt: new Date(
          `${form.subscriptionExpiresAt}T23:59:59`,
        ).toISOString(),
      });

      if (!result.ok) {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        // Jump back to the step that owns the failing field.
        const firstField = Object.keys(result.fieldErrors ?? {})[0];
        if (firstField) setStep(stepForField(firstField));
        return;
      }

      setCreated(result.data);
      toast.success("Business created");
      router.refresh();
    });
  }

  if (created) return <CreationSummary summary={created} />;

  return (
    <div className="space-y-6">
      <Stepper
        current={step}
        onSelect={(index) => index < step && setStep(index)}
      />

      {formError ? (
        <Alert tone="danger" title="Could not create the business">
          {formError}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{STEPS[step]}</CardTitle>
            <CardDescription>{STEP_HINTS[step]}</CardDescription>
          </div>
          <Badge tone="neutral">
            Step {step + 1} of {STEPS.length}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-6">
          {step === 0 ? (
            <FormSection
              title="Identity"
              description="How this business appears across the platform."
            >
              <FieldRow>
                <Field
                  id="name"
                  label="Business name"
                  required
                  error={errors.name}
                >
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => updateName(e.target.value)}
                    placeholder="Bait Al Mandi"
                    autoFocus
                  />
                </Field>
                <Field
                  id="legalName"
                  label="Legal or internal name"
                  error={errors.legalName}
                >
                  <Input
                    id="legalName"
                    value={form.legalName}
                    onChange={(e) => update("legalName", e.target.value)}
                    placeholder="Bait Al Mandi LLC"
                  />
                </Field>
              </FieldRow>

              <Field
                id="slug"
                label="URL slug"
                required
                hint="Used in the public menu URL and API paths. Lowercase letters, numbers and hyphens."
                error={errors.slug}
              >
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      slug: e.target.value.toLowerCase(),
                      slugTouched: true,
                    }))
                  }
                  placeholder="bait-al-mandi"
                  className="font-mono"
                />
              </Field>

              <FieldRow>
                <Field
                  id="contactEmail"
                  label="Contact email"
                  error={errors.contactEmail}
                >
                  <Input
                    id="contactEmail"
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => update("contactEmail", e.target.value)}
                  />
                </Field>
                <Field
                  id="contactPhone"
                  label="Contact phone"
                  error={errors.contactPhone}
                >
                  <Input
                    id="contactPhone"
                    value={form.contactPhone}
                    onChange={(e) => update("contactPhone", e.target.value)}
                    placeholder="+968 …"
                  />
                </Field>
                <Field id="contactWhatsapp" label="WhatsApp">
                  <Input
                    id="contactWhatsapp"
                    value={form.contactWhatsapp}
                    onChange={(e) => update("contactWhatsapp", e.target.value)}
                  />
                </Field>
                <Field
                  id="websiteUrl"
                  label="Website"
                  error={errors.websiteUrl}
                >
                  <Input
                    id="websiteUrl"
                    value={form.websiteUrl}
                    onChange={(e) => update("websiteUrl", e.target.value)}
                    placeholder="https://"
                  />
                </Field>
              </FieldRow>

              <FieldRow>
                <Field id="addressLine" label="Address">
                  <Input
                    id="addressLine"
                    value={form.addressLine}
                    onChange={(e) => update("addressLine", e.target.value)}
                  />
                </Field>
                <Field id="city" label="City">
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                  />
                </Field>
                <Field
                  id="country"
                  label="Country code"
                  hint="Two-letter ISO code."
                >
                  <Input
                    id="country"
                    value={form.country}
                    maxLength={2}
                    onChange={(e) =>
                      update("country", e.target.value.toUpperCase())
                    }
                    className="uppercase"
                  />
                </Field>
                <Field id="timezone" label="Timezone">
                  <NativeSelect
                    id="timezone"
                    value={form.timezone}
                    onChange={(e) => update("timezone", e.target.value)}
                  >
                    {timezones.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </FieldRow>
            </FormSection>
          ) : null}

          {step === 1 ? (
            <FormSection
              title="Business type"
              description="This selects the terminology, default categories and optional fields. It does not change the underlying data model — every business type shares the same catalog."
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => {
                  const selected = form.templateId === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => selectBusinessType(template.businessType)}
                      aria-pressed={selected}
                      className={cn(
                        "flex flex-col gap-2 rounded-lg border p-4 text-start transition-colors",
                        selected
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] ring-1 ring-[var(--primary)]"
                          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {BUSINESS_TYPE_LABELS[template.businessType] ??
                            template.name}
                        </span>
                        {selected ? (
                          <Check className="size-4 text-[var(--primary)]" />
                        ) : null}
                      </div>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        {template.description}
                      </p>
                      {template.defaultCategories.length ? (
                        <p className="text-xs text-[var(--foreground-subtle)]">
                          Starter categories:{" "}
                          {template.defaultCategories
                            .slice(0, 3)
                            .map((c) => c.en)
                            .join(", ")}
                          {template.defaultCategories.length > 3 ? "…" : ""}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-4">
                <Checkbox
                  checked={form.seedDefaultCategories}
                  onCheckedChange={(v) =>
                    update("seedDefaultCategories", v === true)
                  }
                  id="seedDefaults"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">
                    Create the starter catalog
                  </span>
                  <span className="block text-xs text-[var(--foreground-muted)]">
                    Adds the template&apos;s default categories and modifier
                    groups so the owner has something to work from on day one.
                  </span>
                </span>
              </label>
            </FormSection>
          ) : null}

          {step === 2 ? (
            <FormSection
              title="Plan and subscription"
              description="New subscriptions default to one year from today."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {plans.map((plan) => {
                  const selected = form.planId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => selectPlan(plan.id)}
                      aria-pressed={selected}
                      className={cn(
                        "rounded-lg border p-4 text-start transition-colors",
                        selected
                          ? "border-[var(--primary)] bg-[var(--primary-soft)] ring-1 ring-[var(--primary)]"
                          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{plan.name}</span>
                        <span className="tabular text-sm text-[var(--foreground-muted)]">
                          {plan.priceAmount} {plan.priceCurrency}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                        {plan.maxBranches} branch(es) · {plan.maxItems} items ·{" "}
                        {plan.maxUsers} users · {plan.maxLanguages} languages
                      </p>
                      <p className="mt-1 text-xs text-[var(--foreground-subtle)]">
                        {plan.durationDays} day term
                      </p>
                    </button>
                  );
                })}
              </div>

              <FieldRow>
                <Field
                  id="subscriptionStartsAt"
                  label="Subscription start"
                  required
                >
                  <Input
                    id="subscriptionStartsAt"
                    type="date"
                    value={form.subscriptionStartsAt}
                    onChange={(e) =>
                      update("subscriptionStartsAt", e.target.value)
                    }
                  />
                </Field>
                <Field
                  id="subscriptionExpiresAt"
                  label="Subscription expiry"
                  required
                  error={errors.subscriptionExpiresAt}
                  hint="Defaults to one year after the start date."
                >
                  <Input
                    id="subscriptionExpiresAt"
                    type="date"
                    value={form.subscriptionExpiresAt}
                    onChange={(e) =>
                      update("subscriptionExpiresAt", e.target.value)
                    }
                  />
                </Field>
              </FieldRow>

              <Field id="subscriptionStatus" label="Initial status">
                <NativeSelect
                  id="subscriptionStatus"
                  value={form.subscriptionStatus}
                  onChange={(e) =>
                    update(
                      "subscriptionStatus",
                      e.target.value as "active" | "trial",
                    )
                  }
                >
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                </NativeSelect>
              </Field>
            </FormSection>
          ) : null}

          {step === 3 ? (
            <FormSection
              title="Currency and languages"
              description="Prices are stored with three decimal places, so three-decimal currencies such as OMR are exact."
            >
              <FieldRow>
                <Field id="defaultCurrency" label="Default currency" required>
                  <NativeSelect
                    id="defaultCurrency"
                    value={form.defaultCurrency}
                    onChange={(e) => update("defaultCurrency", e.target.value)}
                  >
                    {currencies.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.code} — {currency.name} (
                        {currency.decimalDigits} dp)
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field
                  id="defaultLocale"
                  label="Default language"
                  required
                  error={errors.defaultLocale}
                >
                  <NativeSelect
                    id="defaultLocale"
                    value={form.defaultLocale}
                    onChange={(e) => update("defaultLocale", e.target.value)}
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
              </FieldRow>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Supported languages
                </legend>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Arabic and Persian switch the dashboard to right-to-left
                  automatically.
                  {selectedPlan
                    ? ` This plan allows up to ${selectedPlan.maxLanguages}.`
                    : ""}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {languages.map((language) => {
                    const checked = form.supportedLocales.includes(
                      language.code,
                    );
                    const atLimit =
                      !!selectedPlan &&
                      !checked &&
                      form.supportedLocales.length >= selectedPlan.maxLanguages;
                    return (
                      <label
                        key={language.code}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm",
                          checked
                            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                            : "border-[var(--border)]",
                          atLimit && "opacity-50",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={atLimit}
                          onCheckedChange={(value) => {
                            const next =
                              value === true
                                ? [...form.supportedLocales, language.code]
                                : form.supportedLocales.filter(
                                    (c) => c !== language.code,
                                  );
                            setForm((prev) => ({
                              ...prev,
                              supportedLocales: next.length
                                ? next
                                : prev.supportedLocales,
                              defaultLocale: next.includes(prev.defaultLocale)
                                ? prev.defaultLocale
                                : (next[0] ?? prev.defaultLocale),
                            }));
                          }}
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
              </fieldset>
            </FormSection>
          ) : null}

          {step === 4 ? (
            <FormSection
              title="First owner account"
              description="The owner signs in with this temporary password and is required to change it immediately. The platform never stores or displays it again."
            >
              <FieldRow>
                <Field
                  id="ownerFullName"
                  label="Owner name"
                  required
                  error={errors.ownerFullName}
                >
                  <Input
                    id="ownerFullName"
                    value={form.ownerFullName}
                    onChange={(e) => update("ownerFullName", e.target.value)}
                  />
                </Field>
                <Field
                  id="ownerEmail"
                  label="Owner email"
                  required
                  error={errors.ownerEmail}
                >
                  <Input
                    id="ownerEmail"
                    type="email"
                    value={form.ownerEmail}
                    onChange={(e) => update("ownerEmail", e.target.value)}
                  />
                </Field>
              </FieldRow>

              <Field
                id="ownerPassword"
                label="Temporary password"
                required
                error={errors.ownerPassword}
                hint="Shown once on the confirmation screen. Share it through a secure channel."
              >
                <div className="flex gap-2">
                  <Input
                    id="ownerPassword"
                    value={form.ownerPassword}
                    onChange={(e) => update("ownerPassword", e.target.value)}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      update("ownerPassword", generateTemporaryPassword())
                    }
                    title="Generate a new password"
                  >
                    <RefreshCw />
                  </Button>
                </div>
              </Field>

              <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] p-4">
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">
                    Force password change on first login
                  </span>
                  <span className="block text-xs text-[var(--foreground-muted)]">
                    Strongly recommended — it ensures no credential you have
                    seen stays valid.
                  </span>
                </span>
                <Switch
                  checked={form.forcePasswordChange}
                  onCheckedChange={(v) => update("forcePasswordChange", v)}
                />
              </label>
            </FormSection>
          ) : null}

          {step === 5 ? (
            <FormSection
              title="Features and limits"
              description="Feature flags start from the plan and business type, and can be changed later at any time."
            >
              <div className="space-y-2">
                {featureFlags.map((flag) => (
                  <label
                    key={flag.key}
                    className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] px-4 py-3"
                  >
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-sm font-medium">
                        {flag.name}
                      </span>
                      <span className="block text-xs text-[var(--foreground-muted)]">
                        {flag.description}
                      </span>
                    </span>
                    <Switch
                      checked={
                        form.featureFlags[flag.key] ?? flag.defaultEnabled
                      }
                      onCheckedChange={(value) =>
                        update("featureFlags", {
                          ...form.featureFlags,
                          [flag.key]: value,
                        })
                      }
                    />
                  </label>
                ))}
              </div>

              <Field
                id="internalNotes"
                label="Internal notes"
                hint="Visible to platform staff only. The business never sees this, and it is excluded from the public API."
              >
                <Textarea
                  id="internalNotes"
                  value={form.internalNotes}
                  onChange={(e) => update("internalNotes", e.target.value)}
                  rows={4}
                />
              </Field>
            </FormSection>
          ) : null}

          {step === 6 ? (
            <FormSection
              title="Review"
              description="Check everything before the account is created."
            >
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Review label="Business" value={form.name} />
                <Review label="Slug" value={`/${form.slug}`} mono />
                <Review
                  label="Type"
                  value={
                    BUSINESS_TYPE_LABELS[form.businessType] ?? form.businessType
                  }
                />
                <Review
                  label="Template"
                  value={selectedTemplate?.name ?? "—"}
                />
                <Review label="Plan" value={selectedPlan?.name ?? "—"} />
                <Review
                  label="Subscription"
                  value={`${form.subscriptionStartsAt} → ${form.subscriptionExpiresAt}`}
                />
                <Review
                  label="Currency"
                  value={`${form.defaultCurrency} (${selectedCurrency?.decimalDigits ?? 3} decimals)`}
                />
                <Review
                  label="Languages"
                  value={`${form.supportedLocales.join(", ")} — default ${form.defaultLocale}`}
                />
                <Review
                  label="Owner"
                  value={`${form.ownerFullName} · ${form.ownerEmail}`}
                />
                <Review label="Timezone" value={form.timezone} />
                <Review
                  label="Enabled features"
                  value={
                    Object.entries(form.featureFlags)
                      .filter(([, on]) => on)
                      .map(
                        ([key]) =>
                          featureFlags.find((f) => f.key === key)?.name ?? key,
                      )
                      .join(", ") || "None"
                  }
                />
                <Review
                  label="Starter catalog"
                  value={form.seedDefaultCategories ? "Yes" : "No"}
                />
              </dl>

              <Alert tone="info" title="What happens next">
                The business, its first branch, its subscription and the owner
                account are created together. If any step fails, nothing is left
                behind.
              </Alert>
            </FormSection>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link href="/admin/businesses">Cancel</Link>
        </Button>

        <div className="flex items-center gap-2">
          {step > 0 ? (
            <Button
              variant="secondary"
              onClick={() => setStep((s) => s - 1)}
              disabled={pending}
            >
              <ArrowLeft className="rtl:rotate-180" /> Back
            </Button>
          ) : null}

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!stepValid}>
              Continue <ArrowRight className="rtl:rotate-180" />
            </Button>
          ) : (
            <Button onClick={submit} loading={pending}>
              <CircleCheck /> Create business
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const STEP_HINTS = [
  "Name, slug and contact details for the business.",
  "Choose the type so the dashboard speaks the right language.",
  "Pick a commercial plan and set the subscription window.",
  "Set the currency and the languages the catalog will be published in.",
  "Create the first Business Owner login.",
  "Turn platform features on or off for this business.",
  "Confirm the details before creating the account.",
] as const;

/** Maps a server-side field error back to the wizard step that owns it. */
function stepForField(field: string): number {
  const map: Record<string, number> = {
    name: 0,
    slug: 0,
    legalName: 0,
    contactEmail: 0,
    websiteUrl: 0,
    templateId: 1,
    planId: 2,
    subscriptionStartsAt: 2,
    subscriptionExpiresAt: 2,
    defaultCurrency: 3,
    defaultLocale: 3,
    supportedLocales: 3,
    ownerEmail: 4,
    ownerFullName: 4,
    ownerPassword: 4,
  };
  return map[field] ?? 6;
}

function Stepper({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Progress">
      {STEPS.map((label, index) => {
        const state =
          index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li key={label} className="flex-1 basis-32">
            <button
              type="button"
              onClick={() => onSelect(index)}
              disabled={index >= current}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "w-full space-y-1.5 rounded-md p-1 text-start transition-colors",
                index < current && "cursor-pointer",
              )}
            >
              <span
                className={cn(
                  "block h-1 rounded-full",
                  state === "done" && "bg-[var(--primary)]",
                  state === "current" && "bg-[var(--accent)]",
                  state === "upcoming" && "bg-[var(--border)]",
                )}
              />
              <span
                className={cn(
                  "block truncate text-xs",
                  state === "upcoming"
                    ? "text-[var(--foreground-subtle)]"
                    : "text-[var(--foreground)]",
                )}
              >
                {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Review({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs tracking-wide text-[var(--foreground-subtle)] uppercase">
        {label}
      </dt>
      <dd className={cn("mt-0.5 text-sm break-words", mono && "font-mono")}>
        {value || "—"}
      </dd>
    </div>
  );
}

function CreationSummary({ summary }: { summary: CreatedBusinessSummary }) {
  return (
    <div className="space-y-5">
      <Alert tone="success" title={`${summary.name} is ready`}>
        The owner can sign in now. This is the only time the temporary password
        is shown — it is stored only as a hash and cannot be retrieved again.
      </Alert>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Hand these details to the business owner</CardTitle>
            <CardDescription>
              Share the password through a secure channel.
            </CardDescription>
          </div>
          <KeyRound className="size-5 text-[var(--foreground-subtle)]" />
        </CardHeader>
        <CardContent className="space-y-3">
          <SummaryRow label="Login URL" value={summary.loginUrl} />
          <SummaryRow label="Email" value={summary.ownerEmail} />
          <SummaryRow
            label="Temporary password"
            value={summary.temporaryPassword}
            mono
            highlight
          />
          <SummaryRow label="Public slug" value={summary.slug} mono />
          <SummaryRow
            label="Subscription expires"
            value={summary.subscriptionExpiresAt.slice(0, 10)}
          />
          <SummaryRow
            label="Public API base"
            value={summary.publicApiBase}
            mono
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/admin/businesses/${summary.tenantId}`}>
            Open business
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/admin/businesses">Back to all businesses</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/businesses/new">Add another</Link>
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3",
        highlight
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--border)]",
      )}
    >
      <div className="min-w-0">
        <p className="text-xs tracking-wide text-[var(--foreground-subtle)] uppercase">
          {label}
        </p>
        <p className={cn("mt-0.5 text-sm break-all", mono && "font-mono")}>
          {value}
        </p>
      </div>
      <CopyButton value={value} label={`Copy ${label}`} />
    </div>
  );
}
