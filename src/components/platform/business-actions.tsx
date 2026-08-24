"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Archive,
  KeyRound,
  LifeBuoy,
  Pause,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogBody,
} from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/ui/copy-button";
import { changeBusinessLifecycleAction } from "@/lib/actions/platform/businesses";
import { resetUserPasswordAction } from "@/lib/actions/platform/users";
import { startImpersonationAction } from "@/lib/actions/platform/impersonation";
import { generateTemporaryPassword } from "@/lib/utils";

export function BusinessLifecycleActions({
  tenantId,
  tenantName,
  accountStatus,
  isDeleted,
  canAdminister,
  canImpersonate,
}: {
  tenantId: string;
  tenantName: string;
  accountStatus: "active" | "suspended" | "archived";
  isDeleted: boolean;
  canAdminister: boolean;
  canImpersonate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    action: "suspend" | "reactivate" | "archive" | "soft_delete" | "restore",
    reason = "",
  ) {
    startTransition(async () => {
      const result = await changeBusinessLifecycleAction({
        tenantId,
        action,
        reason,
      });
      if (result.ok) {
        toast.success(result.message ?? "Updated");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canImpersonate ? (
        <ConfirmDialog
          tone="primary"
          trigger={
            <Button variant="secondary">
              <LifeBuoy /> Support mode
            </Button>
          }
          title="Enter support mode"
          description={`You will act inside ${tenantName} as if you were its owner. A banner stays visible for the whole session and every action is written to the audit log with your identity attached.`}
          confirmLabel="Enter support mode"
          onConfirm={async () => {
            await startImpersonationAction(tenantId);
          }}
        />
      ) : null}

      {canAdminister ? (
        <>
          {accountStatus === "active" ? (
            <ConfirmDialog
              trigger={
                <Button variant="secondary" disabled={pending}>
                  <Pause /> Suspend
                </Button>
              }
              title="Suspend this business?"
              description="Staff lose access to the dashboard and the public menu stops serving. Nothing is deleted — you can reactivate at any time."
              confirmLabel="Suspend"
              onConfirm={() => run("suspend")}
            />
          ) : (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run("reactivate")}
            >
              <Play /> Reactivate
            </Button>
          )}

          {accountStatus !== "archived" ? (
            <ConfirmDialog
              trigger={
                <Button variant="secondary" disabled={pending}>
                  <Archive /> Archive
                </Button>
              }
              title="Archive this business?"
              description="Archiving hides the business from day-to-day lists while keeping every record intact."
              confirmLabel="Archive"
              onConfirm={() => run("archive")}
            />
          ) : null}

          {isDeleted ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run("restore")}
            >
              <RotateCcw /> Restore
            </Button>
          ) : (
            <ConfirmDialog
              trigger={
                <Button variant="outlineDanger" disabled={pending}>
                  <Trash2 /> Delete
                </Button>
              }
              title="Delete this business?"
              description="This is a soft delete: the catalog, media and history are all preserved and the business can be restored. Type the business name to confirm."
              confirmLabel="Delete business"
              confirmPhrase={tenantName}
              onConfirm={() => run("soft_delete")}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

export function ResetPasswordDialog({
  email,
  tenantId,
  canSetTemporary,
}: {
  email: string;
  tenantId: string;
  canSetTemporary: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"email_link" | "temporary_password">(
    "email_link",
  );
  const [password, setPassword] = useState(generateTemporaryPassword());
  const [issued, setIssued] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await resetUserPasswordAction({
        email,
        tenantId,
        mode,
        ...(mode === "temporary_password"
          ? { temporaryPassword: password }
          : {}),
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(result.message ?? "Done");
      if (mode === "temporary_password") setIssued(password);
      else setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setIssued(null);
          setPassword(generateTemporaryPassword());
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <KeyRound /> Reset password
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Existing passwords are stored only as hashes and can never be read —
            you can issue a new one, not recover the old one.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {issued ? (
            <>
              <Alert tone="success" title="Temporary password set">
                The user must change it on their next sign-in. This is the only
                time it is shown.
              </Alert>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3">
                <code className="text-sm break-all">{issued}</code>
                <CopyButton value={issued} />
              </div>
            </>
          ) : (
            <>
              <Field id="reset-user" label="Account">
                <Input
                  id="reset-user"
                  value={email}
                  readOnly
                  className="bg-[var(--surface-muted)]"
                />
              </Field>

              <Field id="reset-mode" label="Method">
                <NativeSelect
                  id="reset-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="email_link">
                    Email a reset link (recommended)
                  </option>
                  {canSetTemporary ? (
                    <option value="temporary_password">
                      Set a temporary password
                    </option>
                  ) : null}
                </NativeSelect>
              </Field>

              {mode === "temporary_password" ? (
                <Field
                  id="reset-password"
                  label="Temporary password"
                  hint="Use only when the user cannot access their mailbox."
                >
                  <Input
                    id="reset-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="font-mono"
                  />
                </Field>
              ) : null}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {issued ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} loading={pending}>
                Continue
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
