import { cn } from "@/lib/utils";
import { Label } from "./label";

/**
 * Every form field renders its label, hint and error through this one wrapper
 * so validation messages are always announced and always land in the same
 * position — including under RTL, where `text-start` does the mirroring.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | string[] | undefined;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  const describedBy = [
    hint ? `${id}-hint` : null,
    message ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("space-y-1.5 text-start", className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <div
        data-invalid={message ? "true" : undefined}
        aria-describedby={describedBy || undefined}
      >
        {children}
      </div>
      {hint && !message ? (
        <p id={`${id}-hint`} className="text-xs text-[var(--foreground-muted)]">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-xs font-medium text-[var(--danger)]"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function FieldRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)} {...props} />
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-wide text-[var(--foreground)] uppercase">
          {title}
        </h3>
        {description ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
