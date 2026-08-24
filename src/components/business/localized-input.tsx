"use client";

import { useState } from "react";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { textDirection, LOCALE_LABELS } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

/**
 * One field, every language.
 *
 * Each locale tab sets `dir` on its own input, so an Arabic name types
 * right-to-left inside an otherwise left-to-right form (and vice versa) —
 * mixing scripts in one field is the normal case here, not the exception.
 */
export function LocalizedInput({
  id,
  label,
  locales,
  defaultLocale,
  value,
  onChange,
  multiline = false,
  rows = 3,
  required = false,
  hint,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  locales: string[];
  defaultLocale: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  multiline?: boolean;
  rows?: number;
  required?: boolean;
  hint?: string;
  error?: string | string[] | undefined;
  placeholder?: string;
}) {
  const [active, setActive] = useState(defaultLocale);
  const message = Array.isArray(error) ? error[0] : error;
  const dir = textDirection(active);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={`${id}-${active}`}
          className="flex items-center gap-1 text-sm font-medium"
        >
          {label}
          {required ? (
            <span className="text-[var(--danger)]" aria-hidden>
              *
            </span>
          ) : null}
        </label>

        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label={`${label} languages`}
        >
          {locales.map((locale) => {
            const filled = (value[locale] ?? "").trim().length > 0;
            return (
              <button
                key={locale}
                type="button"
                role="tab"
                aria-selected={active === locale}
                onClick={() => setActive(locale)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                  active === locale
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : filled
                      ? "bg-[var(--surface-inset)] text-[var(--foreground-muted)]"
                      : "bg-[var(--surface-muted)] text-[var(--foreground-subtle)]",
                )}
              >
                {LOCALE_LABELS[locale]?.native ?? locale}
                {!filled && locale === defaultLocale ? " •" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {multiline ? (
        <Textarea
          id={`${id}-${active}`}
          dir={dir}
          rows={rows}
          value={value[active] ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange({ ...value, [active]: e.target.value })}
          aria-invalid={message ? true : undefined}
        />
      ) : (
        <Input
          id={`${id}-${active}`}
          dir={dir}
          value={value[active] ?? ""}
          placeholder={placeholder}
          onChange={(e) => onChange({ ...value, [active]: e.target.value })}
          aria-invalid={message ? true : undefined}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {hint && !message ? (
          <p className="text-xs text-[var(--foreground-muted)]">{hint}</p>
        ) : null}
        {message ? (
          <p role="alert" className="text-xs font-medium text-[var(--danger)]">
            {message}
          </p>
        ) : null}
        {locales.filter((l) => !(value[l] ?? "").trim()).length > 0 ? (
          <Badge tone="neutral">
            {locales.filter((l) => (value[l] ?? "").trim()).length}/
            {locales.length} translated
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
