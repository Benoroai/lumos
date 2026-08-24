"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Save, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocalizedInput } from "./localized-input";
import { MediaPicker } from "./media-picker";
import { deleteItemAction, saveItemAction } from "@/lib/actions/business/items";
import { ALLERGENS, DIETARY_TAGS } from "@/lib/validation/catalog";
import {
  isFieldEnabled,
  type OptionalItemField,
} from "@/lib/business-templates";
import type { CurrencyInfo } from "@/lib/format/money";
import { formatPrice } from "@/lib/format/money";

export type ItemFormValues = {
  id?: string;
  categoryId: string;
  sku: string;
  name: Record<string, string>;
  description: Record<string, string>;
  ingredients: Record<string, string>;
  basePrice: string;
  salePrice: string;
  imagePath: string | null;
  imageUrl: string | null;
  gallery: { path: string; url: string; alt: string }[];
  isActive: boolean;
  inStock: boolean;
  isFeatured: boolean;
  isNew: boolean;
  isPopular: boolean;
  displayOrder: number;
  dietaryTags: string[];
  allergens: string[];
  spiceLevel: string;
  calories: string;
  preparationTimeMinutes: string;
  serviceDurationMinutes: string;
  visibleFrom: string;
  visibleUntil: string;
  modifierGroupIds: string[];
  branchSettings: {
    branchId: string;
    isAvailable: boolean;
    inStock: boolean;
    priceOverride: string;
  }[];
};

export function ItemForm({
  initial,
  categories,
  branches,
  modifierGroups,
  locales,
  defaultLocale,
  currency,
  enabledFields,
  allowBranchPrices,
  canManage,
  canPrice,
  labels,
}: {
  initial: ItemFormValues;
  categories: { id: string; name: string }[];
  branches: { id: string; name: string; allowBranchPrices: boolean }[];
  modifierGroups: {
    id: string;
    name: string;
    selectionType: string;
    isRequired: boolean;
  }[];
  locales: string[];
  defaultLocale: string;
  currency: CurrencyInfo;
  enabledFields: unknown;
  allowBranchPrices: boolean;
  canManage: boolean;
  canPrice: boolean;
  labels: { item: string; items: string; category: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Warn before losing edits — a half-written menu item is expensive to redo.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function set<K extends keyof ItemFormValues>(
    key: K,
    value: ItemFormValues[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  const show = useMemo(
    () => (field: OptionalItemField) => isFieldEnabled(enabledFields, field),
    [enabledFields],
  );

  const previewPrice = useMemo(() => {
    const base = Number(form.basePrice || 0);
    const sale = form.salePrice ? Number(form.salePrice) : null;
    return { base, sale };
  }, [form.basePrice, form.salePrice]);

  function submit() {
    setFormError(null);
    setErrors({});

    startTransition(async () => {
      const result = await saveItemAction({
        ...(form.id ? { id: form.id } : {}),
        categoryId: form.categoryId || null,
        sku: form.sku || null,
        name: form.name,
        description: form.description,
        ingredients: form.ingredients,
        basePrice: form.basePrice === "" ? 0 : form.basePrice,
        salePrice: form.salePrice === "" ? null : form.salePrice,
        currency: null,
        imagePath: form.imagePath,
        imageUrl: form.imageUrl,
        gallery: form.gallery,
        isActive: form.isActive,
        inStock: form.inStock,
        outOfStockUntil: null,
        outOfStockReason: null,
        isFeatured: form.isFeatured,
        isNew: form.isNew,
        isPopular: form.isPopular,
        displayOrder: form.displayOrder,
        dietaryTags: form.dietaryTags,
        allergens: form.allergens,
        spiceLevel: form.spiceLevel === "" ? null : form.spiceLevel,
        calories: form.calories === "" ? null : form.calories,
        preparationTimeMinutes:
          form.preparationTimeMinutes === ""
            ? null
            : form.preparationTimeMinutes,
        serviceDurationMinutes:
          form.serviceDurationMinutes === ""
            ? null
            : form.serviceDurationMinutes,
        customAttributes: {},
        visibleFrom: form.visibleFrom
          ? new Date(form.visibleFrom).toISOString()
          : null,
        visibleUntil: form.visibleUntil
          ? new Date(form.visibleUntil).toISOString()
          : null,
        visibilitySchedule: null,
        modifierGroupIds: form.modifierGroupIds,
        branchSettings: form.branchSettings.map((setting) => ({
          branchId: setting.branchId,
          isAvailable: setting.isAvailable,
          inStock: setting.inStock,
          priceOverride:
            setting.priceOverride === "" ? null : setting.priceOverride,
          salePriceOverride: null,
        })),
      });

      if (result.ok) {
        toast.success(result.message ?? "Saved");
        setDirty(false);
        if (!form.id) router.push(`/dashboard/catalog/items/${result.data.id}`);
        else router.refresh();
      } else {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  function remove() {
    if (!form.id) return;
    startTransition(async () => {
      const result = await deleteItemAction(form.id!);
      if (result.ok) {
        toast.success(result.message ?? "Deleted");
        router.push("/dashboard/catalog/items");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      {formError ? (
        <Alert tone="danger" title="Could not save">
          {formError}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Tabs defaultValue="content">
            <TabsList>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              {modifierGroups.length ? (
                <TabsTrigger value="modifiers">Modifiers</TabsTrigger>
              ) : null}
              {branches.length > 1 ? (
                <TabsTrigger value="branches">Branches</TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value="content">
              <Card>
                <CardContent className="space-y-5 pt-5">
                  <LocalizedInput
                    id="item-name"
                    label="Name"
                    required
                    locales={locales}
                    defaultLocale={defaultLocale}
                    value={form.name}
                    onChange={(v) => set("name", v)}
                    error={errors.name}
                  />

                  {show("description") ? (
                    <LocalizedInput
                      id="item-description"
                      label="Description"
                      multiline
                      locales={locales}
                      defaultLocale={defaultLocale}
                      value={form.description}
                      onChange={(v) => set("description", v)}
                    />
                  ) : null}

                  {show("ingredients") ? (
                    <LocalizedInput
                      id="item-ingredients"
                      label="Ingredients"
                      multiline
                      rows={2}
                      locales={locales}
                      defaultLocale={defaultLocale}
                      value={form.ingredients}
                      onChange={(v) => set("ingredients", v)}
                      hint="Comma-separated is fine."
                    />
                  ) : null}

                  {show("image") ? (
                    <MediaPicker
                      label="Main image"
                      value={form.imageUrl}
                      onChange={(asset) => {
                        setForm((prev) => ({
                          ...prev,
                          imagePath: asset?.path ?? null,
                          imageUrl: asset?.url ?? null,
                        }));
                        setDirty(true);
                      }}
                      disabled={!canManage}
                    />
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricing">
              <Card>
                <CardContent className="space-y-5 pt-5">
                  {!canPrice ? (
                    <Alert tone="info">
                      Your role can edit content but not prices. The price
                      fields are read-only.
                    </Alert>
                  ) : null}

                  <FieldRow>
                    <Field
                      id="basePrice"
                      label={`Base price (${currency.code})`}
                      required
                      hint={`${currency.decimalDigits} decimal places.`}
                      error={errors.basePrice}
                    >
                      <Input
                        id="basePrice"
                        inputMode="decimal"
                        value={form.basePrice}
                        readOnly={!canPrice}
                        onChange={(e) => set("basePrice", e.target.value)}
                        className="tabular"
                      />
                    </Field>

                    <Field
                      id="salePrice"
                      label="Sale price"
                      hint="Leave empty for no discount."
                      error={errors.salePrice}
                    >
                      <Input
                        id="salePrice"
                        inputMode="decimal"
                        value={form.salePrice}
                        readOnly={!canPrice}
                        onChange={(e) => set("salePrice", e.target.value)}
                        className="tabular"
                      />
                    </Field>
                  </FieldRow>

                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
                    <p className="text-xs tracking-wide text-[var(--foreground-subtle)] uppercase">
                      Customers will see
                    </p>
                    <p className="tabular mt-1 text-lg font-semibold">
                      {previewPrice.sale !== null && previewPrice.sale > 0 ? (
                        <>
                          <span className="text-[var(--foreground-subtle)] line-through">
                            {formatPrice(previewPrice.base, currency)}
                          </span>
                          <span className="ms-3 text-[var(--danger)]">
                            {formatPrice(previewPrice.sale, currency)}
                          </span>
                        </>
                      ) : (
                        formatPrice(previewPrice.base, currency)
                      )}
                    </p>
                  </div>

                  {show("sku") ? (
                    <Field
                      id="sku"
                      label="SKU / internal code"
                      hint="Must be unique within your business."
                      error={errors.sku}
                    >
                      <Input
                        id="sku"
                        value={form.sku}
                        onChange={(e) => set("sku", e.target.value)}
                        className="font-mono"
                      />
                    </Field>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details">
              <Card>
                <CardContent className="space-y-6 pt-5">
                  {show("dietary_tags") ? (
                    <FormSection title="Dietary tags">
                      <div className="flex flex-wrap gap-2">
                        {DIETARY_TAGS.map((tag) => {
                          const on = form.dietaryTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() =>
                                set(
                                  "dietaryTags",
                                  on
                                    ? form.dietaryTags.filter((t) => t !== tag)
                                    : [...form.dietaryTags, tag],
                                )
                              }
                              aria-pressed={on}
                              className={
                                on
                                  ? "rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-medium text-[var(--accent-foreground)]"
                                  : "rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)]"
                              }
                            >
                              {tag.replace(/_/g, " ")}
                            </button>
                          );
                        })}
                      </div>
                    </FormSection>
                  ) : null}

                  {show("allergens") ? (
                    <FormSection
                      title="Allergens"
                      description="Shown prominently on the public menu."
                    >
                      <div className="grid gap-2 sm:grid-cols-3">
                        {ALLERGENS.map((allergen) => (
                          <label
                            key={allergen}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={form.allergens.includes(allergen)}
                              onCheckedChange={(v) =>
                                set(
                                  "allergens",
                                  v === true
                                    ? [...form.allergens, allergen]
                                    : form.allergens.filter(
                                        (a) => a !== allergen,
                                      ),
                                )
                              }
                            />
                            <span className="capitalize">{allergen}</span>
                          </label>
                        ))}
                      </div>
                    </FormSection>
                  ) : null}

                  <FormSection title="Attributes">
                    <FieldRow>
                      {show("calories") ? (
                        <Field id="calories" label="Calories">
                          <Input
                            id="calories"
                            inputMode="numeric"
                            value={form.calories}
                            onChange={(e) => set("calories", e.target.value)}
                          />
                        </Field>
                      ) : null}

                      {show("preparation_time") ? (
                        <Field id="prepTime" label="Preparation time (minutes)">
                          <Input
                            id="prepTime"
                            inputMode="numeric"
                            value={form.preparationTimeMinutes}
                            onChange={(e) =>
                              set("preparationTimeMinutes", e.target.value)
                            }
                          />
                        </Field>
                      ) : null}

                      {show("service_duration") ? (
                        <Field
                          id="serviceDuration"
                          label="Service duration (minutes)"
                        >
                          <Input
                            id="serviceDuration"
                            inputMode="numeric"
                            value={form.serviceDurationMinutes}
                            onChange={(e) =>
                              set("serviceDurationMinutes", e.target.value)
                            }
                          />
                        </Field>
                      ) : null}

                      {show("spice_level") ? (
                        <Field id="spiceLevel" label="Spice level">
                          <NativeSelect
                            id="spiceLevel"
                            value={form.spiceLevel}
                            onChange={(e) => set("spiceLevel", e.target.value)}
                          >
                            <option value="">Not specified</option>
                            {[0, 1, 2, 3, 4, 5].map((level) => (
                              <option key={level} value={level}>
                                {level === 0 ? "None" : "🌶️".repeat(level)}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                      ) : null}
                    </FieldRow>
                  </FormSection>

                  <FormSection
                    title="Scheduled visibility"
                    description="Optional. Outside this window the item is hidden from the public menu without being deactivated."
                  >
                    <FieldRow>
                      <Field id="visibleFrom" label="Visible from">
                        <Input
                          id="visibleFrom"
                          type="datetime-local"
                          value={form.visibleFrom}
                          onChange={(e) => set("visibleFrom", e.target.value)}
                        />
                      </Field>
                      <Field id="visibleUntil" label="Visible until">
                        <Input
                          id="visibleUntil"
                          type="datetime-local"
                          value={form.visibleUntil}
                          onChange={(e) => set("visibleUntil", e.target.value)}
                        />
                      </Field>
                    </FieldRow>
                  </FormSection>
                </CardContent>
              </Card>
            </TabsContent>

            {modifierGroups.length ? (
              <TabsContent value="modifiers">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Modifier groups</CardTitle>
                      <CardDescription>
                        Reusable option groups such as size, extras or add-ons.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {modifierGroups.map((group) => (
                      <label
                        key={group.id}
                        className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-3"
                      >
                        <Checkbox
                          checked={form.modifierGroupIds.includes(group.id)}
                          onCheckedChange={(v) =>
                            set(
                              "modifierGroupIds",
                              v === true
                                ? [...form.modifierGroupIds, group.id]
                                : form.modifierGroupIds.filter(
                                    (id) => id !== group.id,
                                  ),
                            )
                          }
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {group.name}
                        </span>
                        <Badge tone="neutral">{group.selectionType}</Badge>
                        {group.isRequired ? (
                          <Badge tone="warning">Required</Badge>
                        ) : null}
                      </label>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}

            {branches.length > 1 ? (
              <TabsContent value="branches">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Per-branch availability</CardTitle>
                      <CardDescription>
                        Override availability, and price where the branch allows
                        it.
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {branches.map((branch) => {
                      const setting = form.branchSettings.find(
                        (s) => s.branchId === branch.id,
                      ) ?? {
                        branchId: branch.id,
                        isAvailable: true,
                        inStock: true,
                        priceOverride: "",
                      };

                      function update(patch: Partial<typeof setting>) {
                        const next = form.branchSettings.filter(
                          (s) => s.branchId !== branch.id,
                        );
                        next.push({ ...setting, ...patch });
                        set("branchSettings", next);
                      }

                      return (
                        <div
                          key={branch.id}
                          className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--border)] px-4 py-3"
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {branch.name}
                          </span>

                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-[var(--foreground-muted)]">
                              Available
                            </span>
                            <Switch
                              checked={setting.isAvailable}
                              onCheckedChange={(v) =>
                                update({ isAvailable: v })
                              }
                            />
                          </label>

                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-[var(--foreground-muted)]">
                              In stock
                            </span>
                            <Switch
                              checked={setting.inStock}
                              tone="accent"
                              onCheckedChange={(v) => update({ inStock: v })}
                            />
                          </label>

                          {allowBranchPrices &&
                          branch.allowBranchPrices &&
                          canPrice ? (
                            <label className="flex items-center gap-2 text-sm">
                              <span className="text-[var(--foreground-muted)]">
                                Price
                              </span>
                              <Input
                                className="tabular w-28"
                                inputMode="decimal"
                                placeholder="Default"
                                value={setting.priceOverride}
                                onChange={(e) =>
                                  update({ priceOverride: e.target.value })
                                }
                                aria-label={`Price override at ${branch.name}`}
                              />
                            </label>
                          ) : null}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Publishing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="categoryId" label={labels.category}>
                <NativeSelect
                  id="categoryId"
                  value={form.categoryId}
                  onChange={(e) => set("categoryId", e.target.value)}
                >
                  <option value="">Uncategorised</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <Toggle
                label="Visible in menu"
                checked={form.isActive}
                onChange={(v) => set("isActive", v)}
              />
              <Toggle
                label="In stock"
                hint="Out of stock items stay listed and show as unavailable."
                checked={form.inStock}
                tone="accent"
                onChange={(v) => set("inStock", v)}
              />
              <Toggle
                label="Featured"
                checked={form.isFeatured}
                onChange={(v) => set("isFeatured", v)}
              />
              <Toggle
                label="New badge"
                checked={form.isNew}
                onChange={(v) => set("isNew", v)}
              />
              <Toggle
                label="Popular badge"
                checked={form.isPopular}
                onChange={(v) => set("isPopular", v)}
              />

              <Field id="displayOrder" label="Display order">
                <Input
                  id="displayOrder"
                  inputMode="numeric"
                  value={String(form.displayOrder)}
                  onChange={(e) =>
                    set("displayOrder", Number(e.target.value) || 0)
                  }
                  className="tabular"
                />
              </Field>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={submit}
              loading={pending}
              disabled={!canManage}
              className="flex-1"
            >
              <Save />{" "}
              {form.id ? "Save changes" : `Create ${labels.item.toLowerCase()}`}
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/dashboard/catalog/items">Cancel</Link>
            </Button>
          </div>

          {form.id && canManage ? (
            <ConfirmDialog
              trigger={
                <Button variant="outlineDanger" className="w-full">
                  <Trash2 /> Delete {labels.item.toLowerCase()}
                </Button>
              }
              title={`Delete this ${labels.item.toLowerCase()}?`}
              description="It is removed from your menu but kept in the database, so it can be restored if this was a mistake."
              confirmLabel="Delete"
              onConfirm={remove}
            />
          ) : null}

          {dirty ? (
            <p className="text-center text-xs text-[var(--warning)]">
              You have unsaved changes.
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  tone,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  tone?: "primary" | "accent";
}) {
  return (
    <label className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint ? (
          <span className="block text-xs text-[var(--foreground-muted)]">
            {hint}
          </span>
        ) : null}
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        tone={tone ?? "primary"}
      />
    </label>
  );
}

export function emptyItemForm(): ItemFormValues {
  return {
    categoryId: "",
    sku: "",
    name: {},
    description: {},
    ingredients: {},
    basePrice: "",
    salePrice: "",
    imagePath: null,
    imageUrl: null,
    gallery: [],
    isActive: true,
    inStock: true,
    isFeatured: false,
    isNew: false,
    isPopular: false,
    displayOrder: 0,
    dietaryTags: [],
    allergens: [],
    spiceLevel: "",
    calories: "",
    preparationTimeMinutes: "",
    serviceDurationMinutes: "",
    visibleFrom: "",
    visibleUntil: "",
    modifierGroupIds: [],
    branchSettings: [],
  };
}
