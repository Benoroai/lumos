"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
} from "lucide-react";
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
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteBranchAction,
  regenerateBranchCodeAction,
  saveBranchAction,
} from "@/lib/actions/business/branches";
import { slugify } from "@/lib/format/slug";

export type BranchView = {
  id: string;
  slug: string;
  name: string;
  addressLine: string;
  city: string;
  country: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  openingHours: { day: number; closed: boolean; open: string; close: string }[];
  publicMenuCode: string;
  qrTargetUrl: string | null;
  allowBranchPrices: boolean;
  isActive: boolean;
  displayOrder: number;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function BranchManager({
  branches,
  timezones,
  publicApiBase,
  canManage,
  branchPricesEnabled,
}: {
  branches: BranchView[];
  timezones: string[];
  publicApiBase: string;
  canManage: boolean;
  branchPricesEnabled: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<BranchView | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove(branch: BranchView) {
    startTransition(async () => {
      const result = await deleteBranchAction(branch.id);
      if (result.ok) {
        toast.success(result.message ?? "Removed");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function rotate(branch: BranchView) {
    startTransition(async () => {
      const result = await regenerateBranchCodeAction(branch.id);
      if (result.ok) {
        toast.success(result.message ?? "New code issued");
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
            <Plus /> New branch
          </Button>
        </div>
      ) : null}

      {branches.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No branches yet"
          description="Every business needs at least one branch — it is what your public menu URL points at."
          action={
            canManage ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> New branch
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {branches.map((branch) => (
            <Card key={branch.id}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle className="truncate">{branch.name}</CardTitle>
                  <CardDescription className="truncate">
                    {[branch.addressLine, branch.city]
                      .filter(Boolean)
                      .join(", ") || `/${branch.slug}`}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={branch.isActive ? "success" : "neutral"}>
                    {branch.isActive ? "Open" : "Hidden"}
                  </Badge>
                  {canManage ? (
                    <>
                      <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => setEditing(branch)}
                        aria-label={`Edit ${branch.name}`}
                      >
                        <Pencil />
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={`Delete ${branch.name}`}
                          >
                            <Trash2 className="text-[var(--danger)]" />
                          </Button>
                        }
                        title={`Remove ${branch.name}?`}
                        description="The branch is hidden from your public menu. Its catalog overrides are kept."
                        confirmLabel="Remove"
                        onConfirm={() => remove(branch)}
                      />
                    </>
                  ) : null}
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Row label="Phone" value={branch.phone ?? "—"} />
                  <Row label="WhatsApp" value={branch.whatsapp ?? "—"} />
                  <Row label="Timezone" value={branch.timezone} />
                  <Row
                    label="Coordinates"
                    value={
                      branch.latitude !== null && branch.longitude !== null
                        ? `${branch.latitude}, ${branch.longitude}`
                        : "—"
                    }
                  />
                </dl>

                {branch.openingHours.length ? (
                  <details className="rounded-lg border border-[var(--border)] px-3 py-2">
                    <summary className="cursor-pointer text-sm font-medium">
                      Opening hours
                    </summary>
                    <ul className="mt-2 space-y-1 text-sm">
                      {branch.openingHours.map((entry) => (
                        <li
                          key={entry.day}
                          className="flex justify-between gap-3"
                        >
                          <span className="text-[var(--foreground-muted)]">
                            {DAY_NAMES[entry.day]}
                          </span>
                          <span className="tabular">
                            {entry.closed
                              ? "Closed"
                              : `${entry.open} – ${entry.close}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <div className="space-y-2 rounded-lg bg-[var(--surface-muted)] p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[var(--foreground-subtle)] uppercase">
                    <QrCode className="size-3.5" /> Public menu
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <code className="min-w-0 truncate text-xs">
                      {publicApiBase}/branches/{branch.slug}/menu
                    </code>
                    <CopyButton
                      value={`${publicApiBase}/branches/${branch.slug}/menu`}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--foreground-muted)]">
                      Code{" "}
                      <code className="font-mono">{branch.publicMenuCode}</code>
                    </span>
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => rotate(branch)}
                      >
                        <RefreshCw /> New code
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(editing || creating) && canManage ? (
        <BranchDialog
          branch={editing}
          timezones={timezones}
          branchPricesEnabled={branchPricesEnabled}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-xs text-[var(--foreground-subtle)]">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function BranchDialog({
  branch,
  timezones,
  branchPricesEnabled,
  onClose,
}: {
  branch: BranchView | null;
  timezones: string[];
  branchPricesEnabled: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState(branch?.name ?? "");
  const [slug, setSlug] = useState(branch?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!branch);
  const [addressLine, setAddressLine] = useState(branch?.addressLine ?? "");
  const [city, setCity] = useState(branch?.city ?? "");
  const [country, setCountry] = useState(branch?.country ?? "OM");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(branch?.whatsapp ?? "");
  const [email, setEmail] = useState(branch?.email ?? "");
  const [latitude, setLatitude] = useState(
    branch?.latitude === null ? "" : String(branch?.latitude ?? ""),
  );
  const [longitude, setLongitude] = useState(
    branch?.longitude === null ? "" : String(branch?.longitude ?? ""),
  );
  const [timezone, setTimezone] = useState(branch?.timezone ?? "Asia/Muscat");
  const [qrTargetUrl, setQrTargetUrl] = useState(branch?.qrTargetUrl ?? "");
  const [allowBranchPrices, setAllowBranchPrices] = useState(
    branch?.allowBranchPrices ?? false,
  );
  const [isActive, setIsActive] = useState(branch?.isActive ?? true);
  const [hours, setHours] = useState(
    branch?.openingHours.length
      ? branch.openingHours
      : DAY_NAMES.map((_, day) => ({
          day,
          closed: false,
          open: "09:00",
          close: "23:00",
        })),
  );

  function submit() {
    setError(null);
    setErrors({});

    startTransition(async () => {
      const result = await saveBranchAction({
        ...(branch ? { id: branch.id } : {}),
        name,
        slug,
        addressLine,
        city,
        country,
        phone: phone || null,
        whatsapp: whatsapp || null,
        email: email || null,
        latitude: latitude === "" ? null : latitude,
        longitude: longitude === "" ? null : longitude,
        timezone,
        openingHours: hours,
        qrTargetUrl: qrTargetUrl || null,
        allowBranchPrices,
        isActive,
        displayOrder: branch?.displayOrder ?? 0,
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
          <DialogTitle>{branch ? "Edit branch" : "New branch"}</DialogTitle>
          <DialogDescription>
            Each branch has its own public menu identifier, opening hours and
            availability.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <FieldRow>
            <Field
              id="branch-name"
              label="Branch name"
              required
              error={errors.name}
            >
              <Input
                id="branch-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value, "branch"));
                }}
              />
            </Field>
            <Field id="branch-slug" label="Slug" required error={errors.slug}>
              <Input
                id="branch-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase());
                  setSlugTouched(true);
                }}
                className="font-mono"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field id="branch-address" label="Address">
              <Input
                id="branch-address"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
              />
            </Field>
            <Field id="branch-city" label="City">
              <Input
                id="branch-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </Field>
            <Field id="branch-country" label="Country code">
              <Input
                id="branch-country"
                maxLength={2}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                className="uppercase"
              />
            </Field>
            <Field id="branch-timezone" label="Timezone">
              <NativeSelect
                id="branch-timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </FieldRow>

          <FieldRow>
            <Field id="branch-phone" label="Phone">
              <Input
                id="branch-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field id="branch-whatsapp" label="WhatsApp">
              <Input
                id="branch-whatsapp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </Field>
            <Field id="branch-email" label="Email">
              <Input
                id="branch-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field
              id="branch-qr"
              label="QR target URL"
              hint="Where a scanned QR code should land."
            >
              <Input
                id="branch-qr"
                value={qrTargetUrl}
                onChange={(e) => setQrTargetUrl(e.target.value)}
                placeholder="https://menu.example.com/…"
              />
            </Field>
          </FieldRow>

          <FieldRow>
            <Field id="branch-lat" label="Latitude">
              <Input
                id="branch-lat"
                inputMode="decimal"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="tabular"
              />
            </Field>
            <Field id="branch-lng" label="Longitude">
              <Input
                id="branch-lng"
                inputMode="decimal"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="tabular"
              />
            </Field>
          </FieldRow>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Opening hours</legend>
            <div className="space-y-1.5">
              {hours.map((entry, index) => (
                <div
                  key={entry.day}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  <span className="w-24 text-sm">{DAY_NAMES[entry.day]}</span>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={!entry.closed}
                      onCheckedChange={(value) =>
                        setHours((prev) =>
                          prev.map((h, i) =>
                            i === index ? { ...h, closed: !value } : h,
                          ),
                        )
                      }
                      aria-label={`${DAY_NAMES[entry.day]} open`}
                    />
                    <span className="text-[var(--foreground-muted)]">
                      {entry.closed ? "Closed" : "Open"}
                    </span>
                  </label>
                  {!entry.closed ? (
                    <>
                      <Input
                        type="time"
                        className="w-32"
                        value={entry.open}
                        onChange={(e) =>
                          setHours((prev) =>
                            prev.map((h, i) =>
                              i === index ? { ...h, open: e.target.value } : h,
                            ),
                          )
                        }
                        aria-label={`${DAY_NAMES[entry.day]} opening time`}
                      />
                      <Input
                        type="time"
                        className="w-32"
                        value={entry.close}
                        onChange={(e) =>
                          setHours((prev) =>
                            prev.map((h, i) =>
                              i === index ? { ...h, close: e.target.value } : h,
                            ),
                          )
                        }
                        aria-label={`${DAY_NAMES[entry.day]} closing time`}
                      />
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <label className="flex flex-1 items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
              <span className="text-sm font-medium">Visible to customers</span>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                tone="accent"
              />
            </label>
            {branchPricesEnabled ? (
              <label className="flex flex-1 items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    Branch-specific prices
                  </span>
                  <span className="block text-xs text-[var(--foreground-muted)]">
                    Allow items to override their price here.
                  </span>
                </span>
                <Switch
                  checked={allowBranchPrices}
                  onCheckedChange={setAllowBranchPrices}
                />
              </label>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            {branch ? "Save changes" : "Create branch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
