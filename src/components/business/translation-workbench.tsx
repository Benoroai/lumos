"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Languages, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
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
  aiTranslateAction,
  approveTranslationsAction,
  saveTranslationAction,
} from "@/lib/actions/business/translations";
import { LOCALE_LABELS, textDirection } from "@/lib/i18n/config";

export type TranslationEntity =
  "item" | "category" | "modifier_group" | "offer";

export type TranslationRowView = {
  id: string;
  sourceName: string;
  translations: Record<
    string,
    | {
        name: string;
        description: string;
        status: string;
        isMachineGenerated: boolean;
      }
    | undefined
  >;
};

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "success"> =
  {
    draft: "neutral",
    ai_generated: "info",
    reviewed: "warning",
    approved: "success",
  };

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ai_generated: "AI generated",
  reviewed: "Reviewed",
  approved: "Approved",
};

export function TranslationWorkbench({
  entityType,
  rows,
  locales,
  defaultLocale,
  canManage,
  canApprove,
  aiEnabled,
  entityLabel,
}: {
  entityType: TranslationEntity;
  rows: TranslationRowView[];
  locales: string[];
  defaultLocale: string;
  canManage: boolean;
  canApprove: boolean;
  aiEnabled: boolean;
  entityLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [targetLocale, setTargetLocale] = useState(
    locales.find((l) => l !== defaultLocale) ?? defaultLocale,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<TranslationRowView | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState<{
    approved: number;
  } | null>(null);

  const otherLocales = locales.filter((l) => l !== defaultLocale);

  function runAi(overwriteApproved: boolean) {
    const ids = [...selected];
    if (!ids.length) {
      toast.error("Select at least one row first.");
      return;
    }

    startTransition(async () => {
      const result = await aiTranslateAction({
        entityType,
        entityIds: ids,
        sourceLocale: defaultLocale,
        targetLocales: [targetLocale],
        overwriteApproved,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // Approved translations are never replaced silently — if any were
      // skipped, ask before doing it again with the overwrite flag set.
      if (result.data.skippedApproved > 0 && !overwriteApproved) {
        setConfirmOverwrite({ approved: result.data.skippedApproved });
      }

      toast.success(result.message ?? "Translated");
      setSelected(new Set());
      router.refresh();
    });
  }

  function approve() {
    const ids = [...selected];
    if (!ids.length) return;

    startTransition(async () => {
      const result = await approveTranslationsAction(
        entityType,
        ids,
        targetLocale,
      );
      if (result.ok) {
        toast.success(result.message ?? "Approved");
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (otherLocales.length === 0) {
    return (
      <EmptyState
        icon={Languages}
        title="Only one language is enabled"
        description="Add another language under Localization to start translating your catalog."
      />
    );
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-44 space-y-1.5">
          <span className="text-xs font-medium text-[var(--foreground-muted)]">
            Translating into
          </span>
          <NativeSelect
            value={targetLocale}
            onChange={(e) => setTargetLocale(e.target.value)}
          >
            {otherLocales.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_LABELS[locale]?.english ?? locale} (
                {LOCALE_LABELS[locale]?.native ?? locale})
              </option>
            ))}
          </NativeSelect>
        </label>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          {selected.size > 0 ? (
            <Badge tone="info">{selected.size} selected</Badge>
          ) : null}
          {canManage && aiEnabled ? (
            <Button
              disabled={pending || selected.size === 0}
              onClick={() => runAi(false)}
            >
              <Sparkles /> Translate with AI
            </Button>
          ) : null}
          {canApprove ? (
            <Button
              variant="secondary"
              disabled={pending || selected.size === 0}
              onClick={approve}
            >
              <Check /> Approve
            </Button>
          ) : null}
        </div>
      </div>

      {!aiEnabled ? (
        <Alert tone="info">
          AI translation is turned off for this business. You can still edit
          every translation by hand.
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={Languages}
          title={`No ${entityLabel} to translate yet`}
        />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) =>
                      setSelected(
                        v === true ? new Set(rows.map((r) => r.id)) : new Set(),
                      )
                    }
                    aria-label="Select all"
                  />
                </TH>
                <TH>
                  {LOCALE_LABELS[defaultLocale]?.english ?? defaultLocale}{" "}
                  (source)
                </TH>
                <TH>{LOCALE_LABELS[targetLocale]?.english ?? targetLocale}</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const translation = row.translations[targetLocale];
                return (
                  <TR key={row.id}>
                    <TD>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(v) => {
                          const next = new Set(selected);
                          if (v === true) next.add(row.id);
                          else next.delete(row.id);
                          setSelected(next);
                        }}
                        aria-label={`Select ${row.sourceName}`}
                      />
                    </TD>
                    <TD className="font-medium">{row.sourceName || "—"}</TD>
                    <TD dir={textDirection(targetLocale)}>
                      {translation?.name || (
                        <span className="text-[var(--foreground-subtle)]">
                          Not translated
                        </span>
                      )}
                    </TD>
                    <TD>
                      {translation ? (
                        <Badge
                          tone={STATUS_TONE[translation.status] ?? "neutral"}
                        >
                          {STATUS_LABELS[translation.status] ??
                            translation.status}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Missing</Badge>
                      )}
                    </TD>
                    <TD className="text-end">
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(row)}
                        >
                          Edit
                        </Button>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>
      )}

      {confirmOverwrite ? (
        <Dialog open onOpenChange={() => setConfirmOverwrite(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Replace approved translations?</DialogTitle>
              <DialogDescription>
                {confirmOverwrite.approved} of the selected rows already have an
                approved translation in{" "}
                {LOCALE_LABELS[targetLocale]?.english ?? targetLocale}. They
                were left untouched.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setConfirmOverwrite(null)}
              >
                Keep them
              </Button>
              <Button
                variant="danger"
                loading={pending}
                onClick={() => {
                  setConfirmOverwrite(null);
                  runAi(true);
                }}
              >
                Replace them
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {editing ? (
        <TranslationEditor
          entityType={entityType}
          row={editing}
          locale={targetLocale}
          canApprove={canApprove}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function TranslationEditor({
  entityType,
  row,
  locale,
  canApprove,
  onClose,
}: {
  entityType: TranslationEntity;
  row: TranslationRowView;
  locale: string;
  canApprove: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const existing = row.translations[locale];
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [status, setStatus] = useState(existing?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveTranslationAction({
        entityType,
        entityId: row.id,
        locale,
        name,
        description,
        ingredients: "",
        status,
      });

      if (result.ok) {
        toast.success(result.message ?? "Saved");
        onClose();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  const dir = textDirection(locale);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit translation</DialogTitle>
          <DialogDescription>
            Source: <span className="font-medium">{row.sourceName}</span>
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {existing?.isMachineGenerated ? (
            <Alert tone="info">
              This translation was generated by AI. Review it before approving.
            </Alert>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              Name ({LOCALE_LABELS[locale]?.native ?? locale})
            </span>
            <Input
              dir={dir}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Description</span>
            <Textarea
              dir={dir}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Status</span>
            <NativeSelect
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="ai_generated">AI generated</option>
              <option value="reviewed">Reviewed</option>
              <option value="approved" disabled={!canApprove}>
                Approved{canApprove ? "" : " — needs approval permission"}
              </option>
            </NativeSelect>
          </label>
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Save translation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
