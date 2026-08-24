"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Ticket, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  deleteOfferAction,
  saveOfferAction,
  toggleOfferActiveAction,
} from "@/lib/actions/business/offers";
import { slugify } from "@/lib/format/slug";
import { pickLocale } from "@/lib/i18n/localized";
import { formatDateTime, toDateTimeLocalValue } from "@/lib/format/date";
import {
  applyDiscount,
  formatPrice,
  type CurrencyInfo,
} from "@/lib/format/money";

export type OfferView = {
  id: string;
  code: string;
  name: Record<string, string>;
  description: Record<string, string>;
  discountType: "percentage" | "fixed_amount" | "promotional_price";
  discountValue: number;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
  displayOrder: number;
  targetType: "all_items" | "items" | "categories";
  itemIds: string[];
  categoryIds: string[];
  branchIds: string[];
};

type OfferState = "scheduled" | "live" | "ended" | "paused";

function offerState(offer: OfferView): OfferState {
  if (!offer.isActive) return "paused";
  const now = Date.now();
  if (new Date(offer.startsAt).getTime() > now) return "scheduled";
  if (offer.endsAt && new Date(offer.endsAt).getTime() <= now) return "ended";
  return "live";
}

const STATE_TONE = {
  live: "success",
  scheduled: "info",
  ended: "neutral",
  paused: "warning",
} as const;

export function OfferManager({
  offers,
  items,
  categories,
  branches,
  locales,
  defaultLocale,
  currentLocale,
  currency,
  canManage,
}: {
  offers: OfferView[];
  items: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  locales: string[];
  defaultLocale: string;
  currentLocale: string;
  currency: CurrencyInfo;
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<OfferView | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle(offer: OfferView, isActive: boolean) {
    startTransition(async () => {
      const result = await toggleOfferActiveAction(offer.id, isActive);
      if (result.ok) {
        toast.success(result.message ?? "Updated");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(offer: OfferView) {
    startTransition(async () => {
      const result = await deleteOfferAction(offer.id);
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
      <Alert tone="info" title="Offers expire on their own">
        An offer stops applying the moment its end date passes — no job to run,
        nothing to switch off, and the record stays for your history.
      </Alert>

      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New offer
          </Button>
        </div>
      ) : null}

      {offers.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No offers yet"
          description="Create a percentage discount, a fixed reduction or a promotional price, and schedule exactly when it runs."
          action={
            canManage ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> New offer
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {offers.map((offer) => {
            const state = offerState(offer);
            const name =
              pickLocale(offer.name, currentLocale, defaultLocale) ||
              offer.code;
            const example = applyDiscount(
              10,
              offer.discountType,
              offer.discountValue,
              currency.decimalDigits,
            );

            return (
              <Card key={offer.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="truncate">{name}</CardTitle>
                    <CardDescription className="truncate">
                      {pickLocale(
                        offer.description,
                        currentLocale,
                        defaultLocale,
                      ) || `/${offer.code}`}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={STATE_TONE[state]}>{state}</Badge>
                    {canManage ? (
                      <>
                        <Switch
                          checked={offer.isActive}
                          disabled={pending}
                          onCheckedChange={(value) => toggle(offer, value)}
                          aria-label={`${offer.isActive ? "Pause" : "Activate"} ${name}`}
                        />
                        <Button
                          variant="ghost"
                          size="iconSm"
                          onClick={() => setEditing(offer)}
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
                          description="The offer stops applying immediately. Its record is kept so past promotions stay in your history."
                          confirmLabel="Delete"
                          onConfirm={() => remove(offer)}
                        />
                      </>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="rounded-lg bg-[var(--surface-muted)] px-4 py-3">
                    <p className="text-sm font-semibold">
                      {offer.discountType === "percentage"
                        ? `${offer.discountValue}% off`
                        : offer.discountType === "fixed_amount"
                          ? `${formatPrice(offer.discountValue, currency)} off`
                          : `Promotional price ${formatPrice(offer.discountValue, currency)}`}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                      A {formatPrice(10, currency)} item becomes{" "}
                      {formatPrice(example, currency)}
                    </p>
                  </div>

                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--foreground-muted)]">Runs</dt>
                      <dd className="text-end">
                        {formatDateTime(offer.startsAt)} →{" "}
                        {offer.endsAt
                          ? formatDateTime(offer.endsAt)
                          : "no end date"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--foreground-muted)]">
                        Applies to
                      </dt>
                      <dd className="text-end">
                        {offer.targetType === "all_items"
                          ? "Every item"
                          : offer.targetType === "items"
                            ? `${offer.itemIds.length} item(s)`
                            : `${offer.categoryIds.length} category(ies)`}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--foreground-muted)]">
                        Branches
                      </dt>
                      <dd className="text-end">
                        {offer.branchIds.length
                          ? `${offer.branchIds.length} selected`
                          : "All branches"}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(editing || creating) && canManage ? (
        <OfferDialog
          offer={editing}
          items={items}
          categories={categories}
          branches={branches}
          locales={locales}
          defaultLocale={defaultLocale}
          currency={currency}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

function OfferDialog({
  offer,
  items,
  categories,
  branches,
  locales,
  defaultLocale,
  currency,
  onClose,
}: {
  offer: OfferView | null;
  items: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  locales: string[];
  defaultLocale: string;
  currency: CurrencyInfo;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState<Record<string, string>>(offer?.name ?? {});
  const [description, setDescription] = useState<Record<string, string>>(
    offer?.description ?? {},
  );
  const [code, setCode] = useState(offer?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(!!offer);
  const [discountType, setDiscountType] = useState(
    offer?.discountType ?? "percentage",
  );
  const [discountValue, setDiscountValue] = useState(
    String(offer?.discountValue ?? ""),
  );
  const [startsAt, setStartsAt] = useState(
    toDateTimeLocalValue(offer?.startsAt ?? new Date()),
  );
  const [endsAt, setEndsAt] = useState(toDateTimeLocalValue(offer?.endsAt));
  const [isActive, setIsActive] = useState(offer?.isActive ?? true);
  const [targetType, setTargetType] = useState(
    offer?.targetType ?? "all_items",
  );
  const [itemIds, setItemIds] = useState<string[]>(offer?.itemIds ?? []);
  const [categoryIds, setCategoryIds] = useState<string[]>(
    offer?.categoryIds ?? [],
  );
  const [branchIds, setBranchIds] = useState<string[]>(offer?.branchIds ?? []);

  function updateName(next: Record<string, string>) {
    setName(next);
    if (!codeTouched) {
      const source =
        next[defaultLocale] || Object.values(next).find(Boolean) || "";
      if (source) setCode(slugify(source, "offer"));
    }
  }

  function submit() {
    setError(null);
    setErrors({});

    startTransition(async () => {
      const result = await saveOfferAction({
        ...(offer ? { id: offer.id } : {}),
        code,
        name,
        description,
        discountType,
        discountValue: discountValue === "" ? 0 : discountValue,
        imagePath: null,
        imageUrl: null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        isActive,
        displayOrder: offer?.displayOrder ?? 0,
        targetType,
        itemIds,
        categoryIds,
        branchIds,
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
          <DialogTitle>{offer ? "Edit offer" : "New offer"}</DialogTitle>
          <DialogDescription>
            Set the window once — the offer starts and stops on its own.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <LocalizedInput
            id="offer-name"
            label="Offer name"
            required
            locales={locales}
            defaultLocale={defaultLocale}
            value={name}
            onChange={updateName}
            error={errors.name}
            placeholder="Ramadan special"
          />

          <LocalizedInput
            id="offer-description"
            label="Description"
            multiline
            rows={2}
            locales={locales}
            defaultLocale={defaultLocale}
            value={description}
            onChange={setDescription}
          />

          <FieldRow>
            <Field id="offer-code" label="Code" required error={errors.code}>
              <Input
                id="offer-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toLowerCase());
                  setCodeTouched(true);
                }}
                className="font-mono"
              />
            </Field>

            <Field id="offer-type" label="Discount type" required>
              <NativeSelect
                id="offer-type"
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as typeof discountType)
                }
              >
                <option value="percentage">Percentage off</option>
                <option value="fixed_amount">Fixed amount off</option>
                <option value="promotional_price">Promotional price</option>
              </NativeSelect>
            </Field>

            <Field
              id="offer-value"
              label={
                discountType === "percentage"
                  ? "Percentage"
                  : `Amount (${currency.code})`
              }
              required
              error={errors.discountValue}
            >
              <Input
                id="offer-value"
                inputMode="decimal"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="tabular"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field id="offer-start" label="Starts" required>
              <Input
                id="offer-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field
              id="offer-end"
              label="Ends"
              hint="Leave empty to run until you stop it."
              error={errors.endsAt}
            >
              <Input
                id="offer-end"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </Field>
          </FieldRow>

          <Field id="offer-target" label="Applies to">
            <NativeSelect
              id="offer-target"
              value={targetType}
              onChange={(e) =>
                setTargetType(e.target.value as typeof targetType)
              }
            >
              <option value="all_items">Every item</option>
              <option value="categories">Selected categories</option>
              <option value="items">Selected items</option>
            </NativeSelect>
          </Field>

          {targetType === "categories" ? (
            <MultiSelect
              legend="Categories"
              options={categories}
              selected={categoryIds}
              onChange={setCategoryIds}
              error={errors.categoryIds}
            />
          ) : null}

          {targetType === "items" ? (
            <MultiSelect
              legend="Items"
              options={items}
              selected={itemIds}
              onChange={setItemIds}
              error={errors.itemIds}
              scroll
            />
          ) : null}

          {branches.length > 1 ? (
            <MultiSelect
              legend="Branches"
              hint="Leave all unchecked to run at every branch."
              options={branches}
              selected={branchIds}
              onChange={setBranchIds}
            />
          ) : null}

          <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] px-4 py-3">
            <span className="text-sm font-medium">Active</span>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              tone="accent"
            />
          </label>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {offer ? "Save changes" : "Create offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MultiSelect({
  legend,
  hint,
  options,
  selected,
  onChange,
  error,
  scroll,
}: {
  legend: string;
  hint?: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  error?: string[] | undefined;
  scroll?: boolean;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {hint ? (
        <p className="text-xs text-[var(--foreground-muted)]">{hint}</p>
      ) : null}
      <div
        className={
          scroll
            ? "grid max-h-52 gap-2 overflow-y-auto rounded-lg border border-[var(--border)] p-2 sm:grid-cols-2"
            : "grid gap-2 sm:grid-cols-2"
        }
      >
        {options.map((option) => (
          <label
            key={option.id}
            className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <Checkbox
              checked={selected.includes(option.id)}
              onCheckedChange={(value) =>
                onChange(
                  value === true
                    ? [...selected, option.id]
                    : selected.filter((id) => id !== option.id),
                )
              }
            />
            <span className="min-w-0 truncate">{option.name}</span>
          </label>
        ))}
      </div>
      {error?.[0] ? (
        <p role="alert" className="text-xs font-medium text-[var(--danger)]">
          {error[0]}
        </p>
      ) : null}
    </fieldset>
  );
}
