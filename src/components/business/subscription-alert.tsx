import { Alert } from "@/components/ui/alert";
import { formatDate } from "@/lib/format/date";
import { EXPIRY_WARNING_THRESHOLDS } from "@/lib/subscriptions";
import type { SubscriptionStatus } from "@/lib/types/app";

/**
 * Renewal warning shown on every dashboard page.
 *
 * It only appears once a warning threshold is crossed (30/14/7/1 days), and it
 * grows more urgent as the date approaches — a permanent banner would be
 * ignored long before it mattered.
 */
export function SubscriptionAlert({
  status,
  daysRemaining,
  expiresAt,
}: {
  status: SubscriptionStatus;
  daysRemaining: number;
  expiresAt: string;
}) {
  if (status === "expired") {
    return (
      <Alert tone="danger" title="Your subscription has expired">
        Your catalog is intact and nothing has been deleted, but editing is
        paused and your public menu may be offline. Contact the platform
        administrator to renew.
      </Alert>
    );
  }

  if (status === "suspended" || status === "cancelled") {
    return (
      <Alert tone="danger" title={`Your subscription is ${status}`}>
        Editing is paused. All of your data is preserved — contact the platform
        administrator to restore access.
      </Alert>
    );
  }

  if (status !== "expiring_soon") return null;

  const threshold = EXPIRY_WARNING_THRESHOLDS.find((t) => daysRemaining <= t);
  const urgent = daysRemaining <= 7;

  return (
    <Alert
      tone={urgent ? "danger" : "warning"}
      title={`Your subscription expires in ${Math.max(daysRemaining, 0)} day${daysRemaining === 1 ? "" : "s"}`}
    >
      It ends on {formatDate(expiresAt)}
      {threshold ? ` — this is your ${threshold}-day reminder.` : "."} Contact
      the platform administrator to renew before then.
    </Alert>
  );
}
