"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  renewSubscriptionAction,
  setSubscriptionAction,
} from "@/lib/actions/platform/subscriptions";
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONE,
  type DerivedSubscription,
} from "@/lib/subscriptions";
import { formatDate } from "@/lib/format/date";
import { toDateInputValue } from "@/lib/format/date";

export type SubscriptionPanelProps = {
  tenantId: string;
  plans: { id: string; name: string; durationDays: number }[];
  current: {
    id: string;
    planId: string;
    planName: string;
    status: string;
    startsAt: string;
    expiresAt: string;
    autoRenew: boolean;
  } | null;
  derived: DerivedSubscription | null;
  history: {
    id: string;
    planName: string;
    status: string;
    startsAt: string;
    expiresAt: string;
  }[];
  canAdminister: boolean;
};

export function SubscriptionPanel({
  tenantId,
  plans,
  current,
  derived,
  history,
  canAdminister,
}: SubscriptionPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function renew(durationDays: number, fromToday: boolean) {
    startTransition(async () => {
      const result = await renewSubscriptionAction({
        tenantId,
        durationDays,
        fromToday,
      });
      if (result.ok) {
        toast.success(result.message ?? "Renewed");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>
            Expired subscriptions make the dashboard read-only and can stop the
            public API. Nothing is ever deleted.
          </CardDescription>
        </div>
        {derived ? (
          <Badge tone={SUBSCRIPTION_STATUS_TONE[derived.status]}>
            {SUBSCRIPTION_STATUS_LABELS[derived.status]}
          </Badge>
        ) : (
          <Badge tone="danger">No subscription</Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {derived && derived.status === "expired" ? (
          <Alert tone="danger" title="This subscription has expired">
            The catalog is preserved in full. Renewing restores access
            immediately.
          </Alert>
        ) : null}
        {derived && derived.status === "expiring_soon" ? (
          <Alert
            tone="warning"
            title={`Expires in ${derived.daysRemaining} day(s)`}
          >
            The business is being warned in its own dashboard as well.
          </Alert>
        ) : null}

        {current ? (
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Detail label="Plan" value={current.planName} />
            <Detail
              label="Manual status"
              value={
                SUBSCRIPTION_STATUS_LABELS[current.status as never] ??
                current.status
              }
            />
            <Detail label="Started" value={formatDate(current.startsAt)} />
            <Detail label="Expires" value={formatDate(current.expiresAt)} />
            <Detail
              label="Days remaining"
              value={derived ? String(Math.max(derived.daysRemaining, 0)) : "—"}
            />
            <Detail
              label="Auto renew"
              value={current.autoRenew ? "Yes" : "No"}
            />
          </dl>
        ) : (
          <p className="text-sm text-[var(--foreground-muted)]">
            This business has no subscription record yet.
          </p>
        )}

        {canAdminister ? (
          <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
            <Button
              variant="secondary"
              disabled={pending || !current}
              onClick={() => renew(365, false)}
            >
              <RefreshCw /> Extend one year
            </Button>
            <Button
              variant="ghost"
              disabled={pending || !current}
              onClick={() => renew(30, false)}
            >
              Extend 30 days
            </Button>
            <SubscriptionDialog
              tenantId={tenantId}
              plans={plans}
              current={current}
            />
          </div>
        ) : null}

        {history.length > 1 ? (
          <details className="rounded-lg border border-[var(--border)] p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Subscription history ({history.length})
            </summary>
            <ul className="mt-3 space-y-2 text-sm">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-[var(--foreground-muted)]">
                    {row.planName} · {formatDate(row.startsAt)} →{" "}
                    {formatDate(row.expiresAt)}
                  </span>
                  <Badge tone="neutral">{row.status}</Badge>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-[var(--foreground-subtle)] uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function SubscriptionDialog({
  tenantId,
  plans,
  current,
}: {
  tenantId: string;
  plans: { id: string; name: string; durationDays: number }[];
  current: SubscriptionPanelProps["current"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [planId, setPlanId] = useState(current?.planId ?? plans[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState(
    toDateInputValue(current?.startsAt ?? new Date()),
  );
  const [expiresAt, setExpiresAt] = useState(
    toDateInputValue(
      current?.expiresAt ?? new Date(Date.now() + 365 * 86_400_000),
    ),
  );
  const [status, setStatus] = useState(current?.status ?? "active");
  const [autoRenew, setAutoRenew] = useState(current?.autoRenew ?? false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await setSubscriptionAction({
        tenantId,
        planId,
        startsAt: new Date(startsAt).toISOString(),
        expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString(),
        status,
        autoRenew,
        notes,
      });

      if (result.ok) {
        toast.success(result.message ?? "Subscription updated");
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost">
          <CalendarClock /> Change plan or dates
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set subscription</DialogTitle>
          <DialogDescription>
            The current period is kept in the history and replaced by this one.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <Field id="sub-plan" label="Plan" required>
            <NativeSelect
              id="sub-plan"
              value={planId}
              onChange={(e) => {
                setPlanId(e.target.value);
                const plan = plans.find((p) => p.id === e.target.value);
                if (plan) {
                  const next = new Date(startsAt);
                  next.setDate(next.getDate() + plan.durationDays);
                  setExpiresAt(toDateInputValue(next));
                }
              }}
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.durationDays} days)
                </option>
              ))}
            </NativeSelect>
          </Field>

          <FieldRow>
            <Field id="sub-start" label="Starts" required>
              <Input
                id="sub-start"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field id="sub-expiry" label="Expires" required>
              <Input
                id="sub-expiry"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </Field>
          </FieldRow>

          <Field id="sub-status" label="Status">
            <NativeSelect
              id="sub-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </NativeSelect>
          </Field>

          <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] px-4 py-3">
            <span className="text-sm font-medium">Auto renew</span>
            <Switch checked={autoRenew} onCheckedChange={setAutoRenew} />
          </label>

          <Field
            id="sub-notes"
            label="Notes"
            hint="Visible to platform staff only."
          >
            <Textarea
              id="sub-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Save subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
