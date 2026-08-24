import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import {
  StaffManager,
  type StaffMember,
} from "@/components/business/staff-manager";
import { requireTenantSession } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Staff and permissions" };

export default async function StaffPage() {
  const session = await requireTenantSession();
  const supabase = await createServerSupabase();

  const [
    { data: members },
    { data: roles },
    { data: permissions },
    { data: branches },
    { data: rolePermissionRows },
    { data: overrides },
  ] = await Promise.all([
    supabase
      .from("tenant_users")
      .select(
        "id, user_id, email, full_name, role_id, status, is_owner, branch_ids, last_login_at, must_change_password, roles:role_id ( code, name )",
      )
      .eq("tenant_id", session.tenant.id)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("roles")
      .select("id, code, name, description, is_owner_role, tenant_id")
      .or(`tenant_id.is.null,tenant_id.eq.${session.tenant.id}`)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("permissions")
      .select("key, category, description")
      .order("sort_order"),
    supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", session.tenant.id)
      .is("deleted_at", null)
      .order("display_order"),
    supabase.from("role_permissions").select("role_id, permission_key"),
    supabase
      .from("tenant_user_permissions")
      .select("tenant_user_id, permission_key, effect")
      .eq("tenant_id", session.tenant.id),
  ]);

  const rolePermissions: Record<string, string[]> = {};
  for (const row of rolePermissionRows ?? []) {
    (rolePermissions[row.role_id] ??= []).push(row.permission_key);
  }

  const grantedByMember = new Map<string, string[]>();
  const revokedByMember = new Map<string, string[]>();
  for (const row of overrides ?? []) {
    const target = row.effect === "grant" ? grantedByMember : revokedByMember;
    const list = target.get(row.tenant_user_id) ?? [];
    list.push(row.permission_key);
    target.set(row.tenant_user_id, list);
  }

  const staff: StaffMember[] = (members ?? []).map((member) => {
    const role = member.roles as unknown as {
      code: string;
      name: string;
    } | null;
    return {
      id: member.id,
      userId: member.user_id,
      email: member.email,
      fullName: member.full_name,
      roleId: member.role_id,
      roleCode: role?.code ?? "viewer",
      roleName: role?.name ?? "Viewer",
      status: member.status as StaffMember["status"],
      isOwner: member.is_owner,
      branchIds: member.branch_ids ?? [],
      lastLoginAt: member.last_login_at,
      mustChangePassword: member.must_change_password,
      granted: grantedByMember.get(member.id) ?? [],
      revoked: revokedByMember.get(member.id) ?? [],
    };
  });

  // The owner role is granted by the platform, not from inside the business.
  const assignableRoles = (roles ?? []).filter((role) => !role.is_owner_role);

  return (
    <>
      <PageHeader
        title="Staff and permissions"
        description="Invite people and give them exactly the access their job needs."
        breadcrumbs={[{ label: "Staff" }]}
      />

      <Alert tone="info" title="Permissions are enforced on the server">
        Hiding a button is a convenience. Every action re-checks the caller's
        permissions server-side and the database refuses writes a role is not
        entitled to.
      </Alert>

      <StaffManager
        members={staff}
        roles={assignableRoles.map((role) => ({
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
        }))}
        permissions={(permissions ?? []).map((p) => ({
          key: p.key,
          category: p.category,
          description: p.description,
        }))}
        branches={branches ?? []}
        rolePermissions={rolePermissions}
        canManage={session.permissions.has(PERMISSIONS.staffManage)}
        currentUserId={session.user.id}
      />
    </>
  );
}
