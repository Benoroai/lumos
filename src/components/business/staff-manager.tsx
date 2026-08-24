"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, RefreshCw, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Input, NativeSelect } from "@/components/ui/input";
import { Field, FieldRow } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";
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
  inviteStaffAction,
  removeStaffAction,
  updateStaffAction,
} from "@/lib/actions/business/staff";
import { generateTemporaryPassword } from "@/lib/utils";
import { formatDateTime } from "@/lib/format/date";

export type StaffMember = {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  status: "invited" | "active" | "disabled";
  isOwner: boolean;
  branchIds: string[];
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  granted: string[];
  revoked: string[];
};

export type RoleOption = {
  id: string;
  code: string;
  name: string;
  description: string;
};
export type PermissionOption = {
  key: string;
  category: string;
  description: string;
};

export function StaffManager({
  members,
  roles,
  permissions,
  branches,
  rolePermissions,
  canManage,
  currentUserId,
}: {
  members: StaffMember[];
  roles: RoleOption[];
  permissions: PermissionOption[];
  branches: { id: string; name: string }[];
  rolePermissions: Record<string, string[]>;
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(member: StaffMember) {
    startTransition(async () => {
      const result = await removeStaffAction(member.id);
      if (result.ok) {
        toast.success(result.message ?? "Removed");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setInviting(true)}>
            <Plus /> Add staff member
          </Button>
        </div>
      ) : null}

      {members.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No staff yet"
          description="Invite people and give them exactly the access they need — nothing more."
          action={
            canManage ? (
              <Button onClick={() => setInviting(true)}>
                <Plus /> Add staff member
              </Button>
            ) : null
          }
        />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Branches</TH>
                <TH>Last login</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {members.map((member) => (
                <TR key={member.id}>
                  <TD className="font-medium">
                    {member.fullName || "—"}
                    {member.isOwner ? (
                      <Badge tone="accent" className="ms-2">
                        Owner
                      </Badge>
                    ) : null}
                    {member.userId === currentUserId ? (
                      <Badge tone="info" className="ms-2">
                        You
                      </Badge>
                    ) : null}
                  </TD>
                  <TD className="text-[var(--foreground-muted)]">
                    {member.email}
                  </TD>
                  <TD>
                    {member.roleName}
                    {member.granted.length || member.revoked.length ? (
                      <Badge tone="secondary" className="ms-2">
                        customised
                      </Badge>
                    ) : null}
                  </TD>
                  <TD className="text-[var(--foreground-muted)]">
                    {member.branchIds.length
                      ? member.branchIds
                          .map((id) => branches.find((b) => b.id === id)?.name)
                          .filter(Boolean)
                          .join(", ")
                      : "All"}
                  </TD>
                  <TD className="text-[var(--foreground-muted)]">
                    {member.lastLoginAt
                      ? formatDateTime(member.lastLoginAt)
                      : "Never"}
                  </TD>
                  <TD>
                    <Badge
                      tone={member.status === "active" ? "success" : "neutral"}
                    >
                      {member.status}
                    </Badge>
                    {member.mustChangePassword ? (
                      <Badge tone="warning" className="ms-2">
                        password pending
                      </Badge>
                    ) : null}
                  </TD>
                  <TD className="text-end">
                    {canManage &&
                    !member.isOwner &&
                    member.userId !== currentUserId ? (
                      <span className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(member)}
                        >
                          Edit
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[var(--danger)]"
                            >
                              Remove
                            </Button>
                          }
                          title={`Remove ${member.email}?`}
                          description="They lose access immediately. Their account is kept so access can be restored."
                          confirmLabel="Remove access"
                          onConfirm={() => remove(member)}
                        />
                      </span>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}

      {inviting && canManage ? (
        <InviteDialog
          roles={roles}
          permissions={permissions}
          branches={branches}
          rolePermissions={rolePermissions}
          onClose={() => setInviting(false)}
        />
      ) : null}

      {editing && canManage ? (
        <EditStaffDialog
          member={editing}
          roles={roles}
          permissions={permissions}
          branches={branches}
          rolePermissions={rolePermissions}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {pending ? <span className="sr-only">Working…</span> : null}
    </div>
  );
}

/**
 * Permission editor shared by invite and edit.
 *
 * Role grants are shown as the baseline; a per-person override is only recorded
 * when it actually differs from the role, so most staff carry no overrides at
 * all and the role stays meaningful.
 */
function PermissionMatrix({
  roleId,
  rolePermissions,
  permissions,
  granted,
  revoked,
  onChange,
}: {
  roleId: string;
  rolePermissions: Record<string, string[]>;
  permissions: PermissionOption[];
  granted: string[];
  revoked: string[];
  onChange: (next: { granted: string[]; revoked: string[] }) => void;
}) {
  const base = new Set(rolePermissions[roleId] ?? []);
  const categories = [...new Set(permissions.map((p) => p.category))];

  function effective(key: string): boolean {
    if (revoked.includes(key)) return false;
    if (granted.includes(key)) return true;
    return base.has(key);
  }

  function toggle(key: string, next: boolean) {
    const inRole = base.has(key);
    let nextGranted = granted.filter((k) => k !== key);
    let nextRevoked = revoked.filter((k) => k !== key);

    if (next && !inRole) nextGranted = [...nextGranted, key];
    if (!next && inRole) nextRevoked = [...nextRevoked, key];

    onChange({ granted: nextGranted, revoked: nextRevoked });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--foreground-muted)]">
        Ticked permissions come from the role. Change any of them to create a
        per-person override.
      </p>
      {categories.map((category) => (
        <fieldset
          key={category}
          className="rounded-lg border border-[var(--border)] p-3"
        >
          <legend className="px-1 text-xs font-semibold tracking-wide text-[var(--foreground-subtle)] uppercase">
            {category}
          </legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {permissions
              .filter((p) => p.category === category)
              .map((permission) => {
                const on = effective(permission.key);
                const overridden =
                  granted.includes(permission.key) ||
                  revoked.includes(permission.key);
                return (
                  <label
                    key={permission.key}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Checkbox
                      checked={on}
                      onCheckedChange={(value) =>
                        toggle(permission.key, value === true)
                      }
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block">{permission.description}</span>
                      {overridden ? (
                        <span className="text-[11px] text-[var(--warning)]">
                          overridden
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function InviteDialog({
  roles,
  permissions,
  branches,
  rolePermissions,
  onClose,
}: {
  roles: RoleOption[];
  permissions: PermissionOption[];
  branches: { id: string; name: string }[];
  rolePermissions: Record<string, string[]>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [created, setCreated] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);

  const defaultRole = roles.find((r) => r.code === "viewer") ?? roles[0];
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState(defaultRole?.id ?? "");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [password, setPassword] = useState(generateTemporaryPassword());
  const [overrides, setOverrides] = useState<{
    granted: string[];
    revoked: string[];
  }>({
    granted: [],
    revoked: [],
  });

  function submit() {
    setError(null);
    setErrors({});

    startTransition(async () => {
      const result = await inviteStaffAction({
        email,
        fullName,
        roleId,
        branchIds,
        temporaryPassword: password,
        grantedPermissions: overrides.granted,
        revokedPermissions: overrides.revoked,
      });

      if (result.ok) {
        setCreated(result.data);
        toast.success("Staff member added");
        router.refresh();
      } else {
        setError(result.error);
        setErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a staff member</DialogTitle>
          <DialogDescription>
            They sign in with a temporary password and must change it
            immediately.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {created ? (
            <>
              <Alert tone="success" title="Access granted">
                Share these details securely. The password is shown once and is
                never stored in readable form.
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
                <Field
                  id="staff-name"
                  label="Full name"
                  required
                  error={errors.fullName}
                >
                  <Input
                    id="staff-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </Field>
                <Field
                  id="staff-email"
                  label="Email"
                  required
                  error={errors.email}
                >
                  <Input
                    id="staff-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
              </FieldRow>

              <Field id="staff-role" label="Role" required>
                <NativeSelect
                  id="staff-role"
                  value={roleId}
                  onChange={(e) => {
                    setRoleId(e.target.value);
                    setOverrides({ granted: [], revoked: [] });
                  }}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} — {role.description}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <Field
                id="staff-password"
                label="Temporary password"
                required
                error={errors.temporaryPassword}
              >
                <div className="flex gap-2">
                  <Input
                    id="staff-password"
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

              {branches.length > 1 ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Branch access</legend>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Leave empty for access to every branch.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {branches.map((branch) => (
                      <label
                        key={branch.id}
                        className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <Checkbox
                          checked={branchIds.includes(branch.id)}
                          onCheckedChange={(value) =>
                            setBranchIds(
                              value === true
                                ? [...branchIds, branch.id]
                                : branchIds.filter((id) => id !== branch.id),
                            )
                          }
                        />
                        {branch.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <details className="rounded-lg border border-[var(--border)] p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Fine-tune permissions
                </summary>
                <div className="mt-3">
                  <PermissionMatrix
                    roleId={roleId}
                    rolePermissions={rolePermissions}
                    permissions={permissions}
                    granted={overrides.granted}
                    revoked={overrides.revoked}
                    onChange={setOverrides}
                  />
                </div>
              </details>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {created ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={submit} loading={pending}>
                Add staff member
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStaffDialog({
  member,
  roles,
  permissions,
  branches,
  rolePermissions,
  onClose,
}: {
  member: StaffMember;
  roles: RoleOption[];
  permissions: PermissionOption[];
  branches: { id: string; name: string }[];
  rolePermissions: Record<string, string[]>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roleId, setRoleId] = useState(member.roleId);
  const [status, setStatus] = useState<"active" | "disabled">(
    member.status === "disabled" ? "disabled" : "active",
  );
  const [branchIds, setBranchIds] = useState<string[]>(member.branchIds);
  const [overrides, setOverrides] = useState({
    granted: member.granted,
    revoked: member.revoked,
  });

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateStaffAction({
        membershipId: member.id,
        roleId,
        status,
        branchIds,
        grantedPermissions: overrides.granted,
        revokedPermissions: overrides.revoked,
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{member.fullName || member.email}</DialogTitle>
          <DialogDescription>
            Change role, branch access and permissions.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {error ? <Alert tone="danger">{error}</Alert> : null}

          <FieldRow>
            <Field id="edit-role" label="Role">
              <NativeSelect
                id="edit-role"
                value={roleId}
                onChange={(e) => {
                  setRoleId(e.target.value);
                  setOverrides({ granted: [], revoked: [] });
                }}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field id="edit-status" label="Access">
              <NativeSelect
                id="edit-status"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "active" | "disabled")
                }
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </NativeSelect>
            </Field>
          </FieldRow>

          {branches.length > 1 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Branch access</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {branches.map((branch) => (
                  <label
                    key={branch.id}
                    className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={branchIds.includes(branch.id)}
                      onCheckedChange={(value) =>
                        setBranchIds(
                          value === true
                            ? [...branchIds, branch.id]
                            : branchIds.filter((id) => id !== branch.id),
                        )
                      }
                    />
                    {branch.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <PermissionMatrix
            roleId={roleId}
            rolePermissions={rolePermissions}
            permissions={permissions}
            granted={overrides.granted}
            revoked={overrides.revoked}
            onChange={setOverrides}
          />
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={pending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
