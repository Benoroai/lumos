"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

export function AuditFilters({
  tenants,
}: {
  tenants: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-48 flex-1 space-y-1.5">
        <span className="text-xs font-medium text-[var(--foreground-muted)]">
          Business
        </span>
        <NativeSelect
          value={searchParams.get("tenantId") ?? ""}
          onChange={(e) => setParam("tenantId", e.target.value)}
        >
          <option value="">All businesses</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </NativeSelect>
      </label>

      <label className="min-w-48 flex-1 space-y-1.5">
        <span className="text-xs font-medium text-[var(--foreground-muted)]">
          Action
        </span>
        <NativeSelect
          value={searchParams.get("action") ?? ""}
          onChange={(e) => setParam("action", e.target.value)}
        >
          <option value="">All actions</option>
          {Object.values(AUDIT_ACTIONS)
            .slice()
            .sort()
            .map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
        </NativeSelect>
      </label>

      <label className="min-w-40 flex-1 space-y-1.5">
        <span className="text-xs font-medium text-[var(--foreground-muted)]">
          Actor email
        </span>
        <Input
          defaultValue={searchParams.get("actorEmail") ?? ""}
          onBlur={(e) => setParam("actorEmail", e.target.value)}
          placeholder="name@example.com"
        />
      </label>

      <label className="space-y-1.5">
        <span className="text-xs font-medium text-[var(--foreground-muted)]">
          From
        </span>
        <Input
          type="date"
          value={searchParams.get("from")?.slice(0, 10) ?? ""}
          onChange={(e) =>
            setParam(
              "from",
              e.target.value ? new Date(e.target.value).toISOString() : "",
            )
          }
        />
      </label>

      <label className="space-y-1.5">
        <span className="text-xs font-medium text-[var(--foreground-muted)]">
          To
        </span>
        <Input
          type="date"
          value={searchParams.get("to")?.slice(0, 10) ?? ""}
          onChange={(e) =>
            setParam(
              "to",
              e.target.value
                ? new Date(`${e.target.value}T23:59:59`).toISOString()
                : "",
            )
          }
        />
      </label>

      <Button variant="ghost" onClick={() => router.push(pathname)}>
        Reset
      </Button>
    </div>
  );
}
