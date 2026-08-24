"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { LocalizedInput } from "./localized-input";
import { saveCategoryAction } from "@/lib/actions/business/categories";
import { slugify } from "@/lib/format/slug";
import { toDateTimeLocalValue } from "@/lib/format/date";
import type { CategoryNode } from "@/lib/queries/business/catalog";

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  branches,
  locales,
  defaultLocale,
  allCategories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryNode | null;
  branches: { id: string; name: string }[];
  locales: string[];
  defaultLocale: string;
  allCategories: CategoryNode[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState<Record<string, string>>(
    category?.name ?? {},
  );
  const [description, setDescription] = useState<Record<string, string>>(
    category?.description ?? {},
  );
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [parentId, setParentId] = useState(category?.parentId ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [color, setColor] = useState(category?.color ?? "");
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [branchIds, setBranchIds] = useState<string[]>(
    category?.branchIds ?? [],
  );
  const [visibleFrom, setVisibleFrom] = useState(
    toDateTimeLocalValue(category?.visibleFrom),
  );
  const [visibleUntil, setVisibleUntil] = useState(
    toDateTimeLocalValue(category?.visibleUntil),
  );

  function updateName(next: Record<string, string>) {
    setName(next);
    if (!slugTouched) {
      const source =
        next[defaultLocale] || Object.values(next).find(Boolean) || "";
      if (source) setSlug(slugify(source, "category"));
    }
  }

  function submit() {
    setFormError(null);
    setErrors({});

    startTransition(async () => {
      const result = await saveCategoryAction({
        ...(category ? { id: category.id } : {}),
        slug,
        parentId: parentId || null,
        name,
        description,
        icon: icon || null,
        color: color || null,
        isActive,
        displayOrder: category?.displayOrder ?? 0,
        branchIds,
        visibleFrom: visibleFrom ? new Date(visibleFrom).toISOString() : null,
        visibleUntil: visibleUntil
          ? new Date(visibleUntil).toISOString()
          : null,
        visibilitySchedule: null,
        imagePath: null,
        imageUrl: category?.imageUrl ?? null,
      });

      if (result.ok) {
        toast.success(result.message ?? "Saved");
        onOpenChange(false);
        router.refresh();
      } else {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  const parentOptions = allCategories.filter((c) => c.id !== category?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {category ? "Edit category" : "New category"}
          </DialogTitle>
          <DialogDescription>
            Names are stored per language. Untranslated languages fall back to
            the default.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}

          <LocalizedInput
            id="category-name"
            label="Name"
            required
            locales={locales}
            defaultLocale={defaultLocale}
            value={name}
            onChange={updateName}
            error={errors.name}
            placeholder="Starters"
          />

          <LocalizedInput
            id="category-description"
            label="Description"
            multiline
            locales={locales}
            defaultLocale={defaultLocale}
            value={description}
            onChange={setDescription}
          />

          <FieldRow>
            <Field
              id="category-slug"
              label="Slug"
              required
              hint="Used in the public menu URL."
              error={errors.slug}
            >
              <Input
                id="category-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase());
                  setSlugTouched(true);
                }}
                className="font-mono"
              />
            </Field>

            <Field
              id="category-parent"
              label="Parent category"
              hint="Optional nesting."
            >
              <NativeSelect
                id="category-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">None — top level</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name[defaultLocale] ?? option.slug}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FieldRow>

          <FieldRow>
            <Field
              id="category-icon"
              label="Icon"
              hint="An emoji or short label."
            >
              <Input
                id="category-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={8}
              />
            </Field>
            <Field id="category-color" label="Accent colour">
              <Input
                id="category-color"
                type="color"
                value={color || "#1F45FF"}
                onChange={(e) => setColor(e.target.value)}
                className="h-9.5 p-1"
              />
            </Field>
          </FieldRow>

          {branches.length > 1 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Branch visibility</legend>
              <p className="text-xs text-[var(--foreground-muted)]">
                Leave all unchecked to show this category at every branch.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {branches.map((branch) => (
                  <label
                    key={branch.id}
                    className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={branchIds.includes(branch.id)}
                      onCheckedChange={(value) =>
                        setBranchIds(
                          value === true
                            ? [...branchIds, branch.id]
                            : branchIds.filter((id) => id !== branch.id),
                        )
                      }
                    />
                    {branch.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <FieldRow>
            <Field
              id="category-from"
              label="Visible from"
              hint="Optional scheduled start."
            >
              <Input
                id="category-from"
                type="datetime-local"
                value={visibleFrom}
                onChange={(e) => setVisibleFrom(e.target.value)}
              />
            </Field>
            <Field
              id="category-until"
              label="Visible until"
              hint="Optional scheduled end."
            >
              <Input
                id="category-until"
                type="datetime-local"
                value={visibleUntil}
                onChange={(e) => setVisibleUntil(e.target.value)}
              />
            </Field>
          </FieldRow>

          <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] px-4 py-3">
            <span className="text-sm font-medium">Visible in the menu</span>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              tone="accent"
            />
          </label>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {category ? "Save changes" : "Create category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
