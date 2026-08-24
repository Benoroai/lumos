import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  info: { bg: "bg-[var(--info-soft)] text-[var(--info)]", Icon: Info },
  success: {
    bg: "bg-[var(--success-soft)] text-[var(--success)]",
    Icon: CheckCircle2,
  },
  warning: {
    bg: "bg-[var(--warning-soft)] text-[var(--warning)]",
    Icon: AlertTriangle,
  },
  danger: { bg: "bg-[var(--danger-soft)] text-[var(--danger)]", Icon: XCircle },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { bg, Icon } = TONES[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-lg px-4 py-3 text-sm",
        bg,
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="opacity-90">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
