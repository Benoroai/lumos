"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";

/**
 * Destructive confirmations. When `confirmPhrase` is supplied the operator must
 * type it — reserved for actions that affect a whole business, where a stray
 * click is not an acceptable failure mode.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmPhrase,
  tone = "danger",
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmPhrase?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();

  const canConfirm = !confirmPhrase || typed.trim() === confirmPhrase;

  function handleConfirm() {
    startTransition(async () => {
      await onConfirm();
      setOpen(false);
      setTyped("");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={
                tone === "danger"
                  ? "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]"
                  : "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]"
              }
            >
              <AlertTriangle className="size-4" aria-hidden />
            </span>
            <div className="space-y-1.5">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {confirmPhrase ? (
          <div className="space-y-2 px-6 pb-2">
            <Label htmlFor="confirm-phrase">
              Type{" "}
              <span className="font-mono font-semibold">{confirmPhrase}</span>{" "}
              to continue
            </Label>
            <Input
              id="confirm-phrase"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={handleConfirm}
            disabled={!canConfirm}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
