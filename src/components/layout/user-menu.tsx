"use client";

import { useTransition } from "react";
import { LogOut, User, Languages, Check } from "lucide-react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { signOutAction, setLocaleAction } from "@/lib/actions/auth";
import { DASHBOARD_LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { initials } from "@/lib/utils";

export function UserMenu({
  name,
  email,
  roleLabel,
  portal,
}: {
  name: string;
  email: string;
  roleLabel: string;
  portal: "platform" | "business";
}) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchLocale(next: string) {
    startTransition(async () => {
      await setLocaleAction(next);
      // A full refresh is required: the direction attribute and every server
      // component's messages are resolved on the server.
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 px-2"
          aria-label="Account menu"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-[var(--secondary)] text-xs font-semibold text-[var(--secondary-foreground)]">
            {initials(name || email)}
          </span>
          <span className="hidden max-w-32 truncate text-start sm:block">
            {name || email}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="space-y-0.5 normal-case">
          <span className="block text-sm font-medium text-[var(--foreground)]">
            {name || email}
          </span>
          <span className="block truncate text-xs font-normal text-[var(--foreground-muted)]">
            {email}
          </span>
          <span className="block text-xs font-normal text-[var(--foreground-subtle)]">
            {roleLabel}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="flex items-center gap-2">
          <Languages className="size-3.5" /> Language
        </DropdownMenuLabel>
        {DASHBOARD_LOCALES.map((code) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => switchLocale(code)}
            disabled={pending}
            className="justify-between"
          >
            <span>{LOCALE_LABELS[code]?.native ?? code}</span>
            {locale === code ? (
              <Check className="size-4 text-[var(--primary)]" />
            ) : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <a
            href={
              portal === "platform"
                ? "/admin/change-password"
                : "/change-password"
            }
          >
            <User /> Change password
          </a>
        </DropdownMenuItem>

        <DropdownMenuItem
          tone="danger"
          onSelect={() => startTransition(() => void signOutAction(portal))}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
