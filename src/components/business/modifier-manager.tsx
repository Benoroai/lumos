"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LocalizedInput } from "./localized-input";
import {
  deleteModifierGroupAction,
  saveModifierGroupAction,
} from "@/lib/actions/business/modifiers";
import { slugify } from "@/lib/format/slug";
import { pickLocale } from "@/lib/i18n/localized";
import { formatPrice, type CurrencyInfo } from "@/lib/format/money";

export type ModifierOption = {
  id?: string;
  code: string;
  name: Record<string, string>;
  priceAdjustment: string;
  isDefault: boolean;
  isActive: boolean;
  inStock: boolean;
};

export type ModifierGroupView = {
  id: string;
  code: string;
  name: Record<string, string>;
  description: Record<string, string>;
  selectionType: "single" | "multiple";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number | null;
  isActive: boolean;
  displayOrder: number;
  usageCount: number;
  modifiers: ModifierOption[];
};

export function ModifierManager({
  groups,
  locales,
  defaultLocale,
  currentLocale,
  currency,
  canManage,
}: {
  groups: ModifierGroupView[];
  locales: string[];
  defaultLocale: string;
  currentLocale: string;
  currency: CurrencyInfo;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ModifierGroupView | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove(group: ModifierGroupView) {
    startTransition(async () => {
      const result = await deleteModifierGroupAction(group.id);
      if (result.ok) {
        toast.success(result.message ?? "Removed");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New modifier group
          </Button>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No modifier groups yet"
          description="Modifier groups are reusable option sets — size, extras, side choices, service add-ons — that you attach to any number of items."
          action={
            canManage ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> New modifier group
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => {
            const name =
              pickLocale(group.name, currentLocale, defaultLocale) ||
              group.code;
            return (
              <Card key={group.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="truncate">{name}</CardTitle>
                    <CardDescription>
                      {pickLocale(
                        group.description,
                        currentLocale,
                        defaultLocale,
                      ) ||
                        `Used by ${group.usageCount} item${group.usageCount === 1 ? "" : "s"}`}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={group.isActive ? "success" : "neutral"}>
                      {group.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {canManage ? (
                      <>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          onClick={() => setEditing(group)}
                          aria-label={`Edit ${name}`}
                        >
                          <Pencil />
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="iconSm"
                              aria-label={`Delete ${name}`}
                            >
                              <Trash2 className="text-[var(--danger)]" />
                            </Button>
                          }
                          title={`Delete ${name}?`}
                          description={`It will be detached from ${group.usageCount} item(s). The group and its options are kept in the database.`}
                          confirmLabel="Delete"
                          onConfirm={() => remove(group)}
                        />
                      </>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="neutral">
                      {group.selectionType === "single"
                        ? "Choose one"
                        : "Choose several"}
                    </Badge>
                    {group.isRequired ? (
                      <Badge tone="warning">Required</Badge>
                    ) : null}
                    <Badge tone="neutral">
                      Min {group.minSelections}
                      {group.maxSelections
                        ? ` · Max ${group.maxSelections}`
                        : ""}
                    </Badge>
                    <Badge tone="secondary">{group.usageCount} item(s)</Badge>
                  </div>

                  <ul className="divide-y divide-[var(--border)]">
                    {group.modifiers.map((modifier) => (
                      <li
                        key={modifier.id ?? modifier.code}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {pickLocale(
                            modifier.name,
                            currentLocale,
                            defaultLocale,
                          ) || modifier.code}
                          {modifier.isDefault ? (
                            <Badge tone="accent" className="ms-2">
                              Default
                            </Badge>
                          ) : null}
                          {!modifier.inStock ? (
                            <Badge tone="danger" className="ms-2">
                              Out of stock
                            </Badge>
                          ) : null}
                        </span>
                        <span className="tabular shrink-0 text-sm text-[var(--foreground-muted)]">
                          {Number(modifier.priceAdjustment) === 0
                            ? "Included"
                            : `${Number(modifier.priceAdjustment) > 0 ? "+" : "−"} ${formatPrice(
                                Math.abs(Number(modifier.priceAdjustment)),
                                currency,
                              )}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(editing || creating) && canManage ? (
        <ModifierGroupDialog
          group={editing}
          locales={locales}
          defaultLocale={defaultLocale}
          currency={currency}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      ) : null}

      {pending ? <span className="sr-only">Saving…</span> : null}
    </div>
  );
}

function ModifierGroupDialog({
  group,
  locales,
  defaultLocale,
  currency,
  onClose,
}: {
  group: ModifierGroupView | null;
  locales: string[];
  defaultLocale: string;
  currency: CurrencyInfo;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState<Record<string, string>>(group?.name ?? {});
  const [description, setDescription] = useState<Record<string, string>>(
    group?.description ?? {},
  );
  const [code, setCode] = useState(group?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(!!group);
  const [selectionType, setSelectionType] = useState(
    group?.selectionType ?? "single",
  );
  const [isRequired, setIsRequired] = useState(group?.isRequired ?? false);
  const [minSelections, setMinSelections] = useState(
    String(group?.minSelections ?? 0),
  );
  const [maxSelections, setMaxSelections] = useState(
    group?.maxSelections === null || group?.maxSelections === undefined
      ? ""
      : String(group.maxSelections),
  );
  const [isActive, setIsActive] = useState(group?.isActive ?? true);
  const [options, setOptions] = useState<ModifierOption[]>(
    group?.modifiers ?? [
      {
        code: "",
        name: {},
        priceAdjustment: "0",
        isDefault: false,
        isActive: true,
        inStock: true,
      },
    ],
  );

  function updateName(next: Record<string, string>) {
    setName(next);
    if (!codeTouched) {
      const source =
        next[defaultLocale] || Object.values(next).find(Boolean) || "";
      if (source) setCode(slugify(source, "group"));
    }
  }

  function updateOption(index: number, patch: Partial<ModifierOption>) {
    setOptions((prev) =>
      prev.map((option, i) => (i === index ? { ...option, ...patch } : option)),
    );
  }

  function submit() {
    setError(null);
    setErrors({});

    startTransition(async () => {
      const result = await saveModifierGroupAction({
        ...(group ? { id: group.id } : {}),
        code,
        name,
        description,
        selectionType,
        isRequired,
        minSelections,
        maxSelections: maxSelections === "" ? null : maxSelections,
        displayOrder: group?.displayOrder ?? 0,
        isActive,
        modifiers: options
          .filter((option) => Object.values(option.name).some((v) => v.trim()))
          .map((option, index) => ({
            ...(option.id ? { id: option.id } : {}),
            code:
              option.code ||
              slugify(
                option.name[defaultLocale] ?? `option-${index}`,
                "option",
              ),
            name: option.name,
            priceAdjustment:
              option.priceAdjustment === "" ? 0 : option.priceAdjustment,
            isDefault: option.isDefault,
            isActive: option.isActive,
            inStock: option.inStock,
            displayOrder: index,
          })),
      });

      if (result.ok) {
        toast.success(result.message ?? "Saved");
        onClose();
        router.refresh();
      } else {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {group ? "Edit modifier group" : "New modifier group"}
          </DialogTitle>
          <DialogDescription>
            Attach this group to as many items as you like — a size or add-on
            set is defined once.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <LocalizedInput
            id="group-name"
            label="Group name"
            required
            locales={locales}
            defaultLocale={defaultLocale}
            value={name}
            onChange={updateName}
            error={errors.name}
            placeholder="Size"
          />

          <LocalizedInput
            id="group-description"
            label="Description"
            multiline
            rows={2}
            locales={locales}
            defaultLocale={defaultLocale}
            value={description}
            onChange={setDescription}
          />

          <FieldRow>
            <Field id="group-code" label="Code" required error={errors.code}>
              <Input
                id="group-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toLowerCase());
                  setCodeTouched(true);
                }}
                className="font-mono"
              />
            </Field>

            <Field id="group-selection" label="Selection">
              <NativeSelect
                id="group-selection"
                value={selectionType}
                onChange={(e) =>
                  setSelectionType(e.target.value as "single" | "multiple")
                }
              >
                <option value="single">Choose one</option>
                <option value="multiple">Choose several</option>
              </NativeSelect>
            </Field>

            <Field
              id="group-min"
              label="Minimum selections"
              error={errors.minSelections}
            >
              <Input
                id="group-min"
                inputMode="numeric"
                value={minSelections}
                onChange={(e) => setMinSelections(e.target.value)}
              />
            </Field>

            <Field
              id="group-max"
              label="Maximum selections"
              hint="Leave empty for no limit."
              error={errors.maxSelections}
            >
              <Input
                id="group-max"
                inputMode="numeric"
                value={maxSelections}
                onChange={(e) => setMaxSelections(e.target.value)}
              />
            </Field>
          </FieldRow>

          <div className="flex flex-wrap gap-4">
            <label className="flex flex-1 items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
              <span className="text-sm font-medium">Required</span>
              <Switch
                checked={isRequired}
                onCheckedChange={(value) => {
                  setIsRequired(value);
                  if (value && Number(minSelections) < 1) setMinSelections("1");
                }}
              />
            </label>
            <label className="flex flex-1 items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
              <span className="text-sm font-medium">Active</span>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                tone="accent"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Options</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setOptions((prev) => [
                    ...prev,
                    {
                      code: "",
                      name: {},
                      priceAdjustment: "0",
                      isDefault: false,
                      isActive: true,
                      inStock: true,
                    },
                  ])
                }
              >
                <Plus /> Add option
              </Button>
            </div>

            {options.map((option, index) => (
              <div
                key={index}
                className="space-y-3 rounded-lg border border-[var(--border)] p-3"
              >
                <LocalizedInput
                  id={`option-${index}`}
                  label={`Option ${index + 1}`}
                  locales={locales}
                  defaultLocale={defaultLocale}
                  value={option.name}
                  onChange={(value) => updateOption(index, { name: value })}
                  placeholder="Large"
                />

                <div className="flex flex-wrap items-end gap-3">
                  <Field
                    id={`option-price-${index}`}
                    label={`Price change (${currency.code})`}
                    className="min-w-32 flex-1"
                    hint="Use a negative number for a discount."
                  >
                    <Input
                      id={`option-price-${index}`}
                      inputMode="decimal"
                      value={option.priceAdjustment}
                      onChange={(e) =>
                        updateOption(index, { priceAdjustment: e.target.value })
                      }
                      className="tabular"
                    />
                  </Field>

                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <span className="text-[var(--foreground-muted)]">
                      Default
                    </span>
                    <Switch
                      checked={option.isDefault}
                      onCheckedChange={(v) =>
                        updateOption(index, { isDefault: v })
                      }
                    />
                  </label>

                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <span className="text-[var(--foreground-muted)]">
                      In stock
                    </span>
                    <Switch
                      checked={option.inStock}
                      tone="accent"
                      onCheckedChange={(v) =>
                        updateOption(index, { inStock: v })
                      }
                    />
                  </label>

                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    className="mb-2"
                    onClick={() =>
                      setOptions((prev) => prev.filter((_, i) => i !== index))
                    }
                    aria-label={`Remove option ${index + 1}`}
                  >
                    <Trash2 className="text-[var(--danger)]" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {group ? "Save changes" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
