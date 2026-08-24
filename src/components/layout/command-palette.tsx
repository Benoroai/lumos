"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type CommandEntry = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: string;
};

/**
 * Global search / command palette (⌘K). Entries are supplied by the surrounding
 * portal, so the same component serves both the platform and business shells.
 */
export function CommandPalette({ entries }: { entries: CommandEntry[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const groups = [...new Set(entries.map((e) => e.group))];

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-[var(--foreground-muted)]"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="ms-1 hidden rounded border border-[var(--border-strong)] bg-[var(--surface-muted)] px-1.5 py-0.5 font-sans text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl p-0">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <Command
            label="Global search"
            className="overflow-hidden rounded-xl"
            filter={(value, search) =>
              value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4">
              <Search className="size-4 text-[var(--foreground-subtle)]" />
              <Command.Input
                placeholder="Search pages and actions…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-[var(--foreground-subtle)]"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-[var(--foreground-muted)]">
                Nothing matched that search.
              </Command.Empty>
              {groups.map((group) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="px-1 py-1 text-[11px] font-semibold tracking-widest text-[var(--foreground-subtle)] uppercase [&_[cmdk-group-items]]:mt-1"
                >
                  {entries
                    .filter((entry) => entry.group === group)
                    .map((entry) => (
                      <Command.Item
                        key={entry.id}
                        value={`${entry.label} ${entry.hint ?? ""}`}
                        onSelect={() => {
                          setOpen(false);
                          router.push(entry.href);
                        }}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-[var(--foreground)] normal-case data-[selected=true]:bg-[var(--surface-muted)]"
                      >
                        <span className="font-normal">{entry.label}</span>
                        {entry.hint ? (
                          <span className="text-xs text-[var(--foreground-subtle)]">
                            {entry.hint}
                          </span>
                        ) : null}
                      </Command.Item>
                    ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
