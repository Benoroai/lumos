"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import {
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ResetPasswordDialog } from "./business-actions";
import {
  createPlatformUserAction,
  setPlatformUserActiveAction,
} from "@/lib/actions/platform/users";
import { generateTemporaryPassword } from "@/lib/utils";
import { formatDateTime } from "@/lib/format/date";

export type PlatformUserRow = {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  support: "Support",
  analyst: "Analyst",
};

export function PlatformUsersPanel({
  users,
  canAdminister,
  currentUserId,
}: {
  users: PlatformUserRow[];
  canAdminister: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(platformUserId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setPlatformUserActiveAction({
        platformUserId,
        isActive,
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
    <div className="space-y-4">
      {canAdminister ? (
        <div className="flex justify-end">
          <CreatePlatformUserDialog />
        </div>
      ) : null}

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Last login</TH>
              <TH>Access</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {users.map((user) => (
              <TR key={user.id}>
                <TD className="font-medium">
                  {user.fullName || "—"}
                  {user.userId === currentUserId ? (
                    <Badge tone="info" className="ms-2">
                      You
                    </Badge>
                  ) : null}
                </TD>
                <TD className="text-[var(--foreground-muted)]">{user.email}</TD>
                <TD>
                  <Badge
                    tone={user.role === "super_admin" ? "accent" : "neutral"}
                  >
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                  {user.mustChangePassword ? (
                    <Badge tone="warning" className="ms-2">
                      Password change pending
                    </Badge>
                  ) : null}
                </TD>
                <TD className="text-[var(--foreground-muted)]">
                  {user.lastLoginAt
                    ? formatDateTime(user.lastLoginAt)
                    : "Never"}
                </TD>
                <TD>
                  {canAdminister && user.userId !== currentUserId ? (
                    <Switch
                      checked={user.isActive}
                      disabled={pending}
                      onCheckedChange={(value) => toggle(user.id, value)}
                      aria-label={`Toggle access for ${user.email}`}
                    />
                  ) : (
                    <Badge tone={user.isActive ? "success" : "neutral"}>
                      {user.isActive ? "Active" : "Disabled"}
                    </Badge>
                  )}
                </TD>
                <TD className="text-end">
                  <ResetPasswordDialog
                    email={user.email}
                    tenantId={""}
                    canSetTemporary={canAdminister}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </div>
  );
}

function CreatePlatformUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("support");
  const [password, setPassword] = useState(generateTemporaryPassword());
  const [created, setCreated] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createPlatformUserAction({
        email,
        fullName,
        role,
        temporaryPassword: password,
      });

      if (result.ok) {
        setCreated(result.data);
        toast.success("Platform user created");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function reset() {
    setOpen(false);
    setCreated(null);
    setEmail("");
    setFullName("");
    setPassword(generateTemporaryPassword());
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : reset())}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add platform user
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a platform user</DialogTitle>
          <DialogDescription>
            Platform users administer the platform itself. They are separate
            from business accounts.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {created ? (
            <>
              <Alert tone="success" title="Account created">
                They must change this password at first sign-in. It is shown
                once and never stored in readable form.
              </Alert>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{created.email}</p>
                  <code className="text-sm break-all">
                    {created.temporaryPassword}
                  </code>
                </div>
                <CopyButton value={created.temporaryPassword} />
              </div>
            </>
          ) : (
            <>
              {error ? <Alert tone="danger">{error}</Alert> : null}

              <FieldRow>
                <Field id="pu-name" label="Full name" required>
                  <Input
                    id="pu-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </Field>
                <Field id="pu-email" label="Email" required>
                  <Input
                    id="pu-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
              </FieldRow>

              <Field
                id="pu-role"
                label="Role"
                hint="Only Super Admins can change the platform itself."
              >
                <NativeSelect
                  id="pu-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="super_admin">
                    Super Admin — full control
                  </option>
                  <option value="support">
                    Support — read and impersonate
                  </option>
                  <option value="analyst">Analyst — read only</option>
                </NativeSelect>
              </Field>

              <Field id="pu-password" label="Temporary password" required>
                <div className="flex gap-2">
                  <Input
                    id="pu-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setPassword(generateTemporaryPassword())}
                  >
                    <RefreshCw />
                  </Button>
                </div>
              </Field>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {created ? (
            <Button onClick={reset}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={reset}>
                Cancel
              </Button>
              <Button onClick={submit} loading={pending}>
                Create user
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
