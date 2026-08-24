import type { SubscriptionStatus } from "@/lib/types/app";

/** Days before expiry at which the dashboards raise a renewal alert. */
export const EXPIRY_WARNING_THRESHOLDS = [30, 14, 7, 1] as const;

export const DEFAULT_SUBSCRIPTION_DAYS = 365;

export type DerivedSubscription = {
  status: SubscriptionStatus;
  daysRemaining: number;
  isLive: boolean;
  /** Nearest crossed alert threshold, or null when comfortably in date. */
  warningThreshold: number | null;
};

/**
 * Mirrors `app.subscription_status()` in SQL. Both exist deliberately: the
 * database is the authority for access decisions, this is the authority for
 * what the UI renders — and they must agree.
 */
export function deriveSubscriptionStatus(
  manualStatus: SubscriptionStatus | string,
  expiresAt: string | Date,
  now: Date = new Date(),
): DerivedSubscription {
  const expiry =
    typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const msRemaining = expiry.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / 86_400_000);

  if (manualStatus === "suspended" || manualStatus === "cancelled") {
    return {
      status: manualStatus,
      daysRemaining,
      isLive: false,
      warningThreshold: null,
    };
  }

  if (msRemaining <= 0) {
    return {
      status: "expired",
      daysRemaining,
      isLive: false,
      warningThreshold: 0,
    };
  }

  // Ascending, so the *tightest* threshold wins: five days out should read as
  // the 7-day warning, not the 30-day one.
  const threshold =
    [...EXPIRY_WARNING_THRESHOLDS]
      .sort((a, b) => a - b)
      .find((t) => daysRemaining <= t) ?? null;

  return {
    status:
      threshold !== null
        ? "expiring_soon"
        : (manualStatus as SubscriptionStatus),
    daysRemaining,
    isLive: true,
    warningThreshold: threshold,
  };
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** A new subscription defaults to exactly one year. */
export function defaultExpiryFrom(
  start: Date,
  durationDays = DEFAULT_SUBSCRIPTION_DAYS,
): Date {
  return addDays(start, durationDays);
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: "Trial",
  active: "Active",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

export const SUBSCRIPTION_STATUS_TONE: Record<
  SubscriptionStatus,
  "neutral" | "success" | "warning" | "danger" | "info"
> = {
  trial: "info",
  active: "success",
  expiring_soon: "warning",
  expired: "danger",
  suspended: "danger",
  cancelled: "neutral",
};
