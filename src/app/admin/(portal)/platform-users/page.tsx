import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { PlatformUsersPanel } from "@/components/platform/platform-users-panel";
import { requirePlatformSession } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { canAdministerPlatform } from "@/lib/permissions";

export const metadata: Metadata = { title: "Platform users" };

export default async function PlatformUsersPage() {
  const session = await requirePlatformSession();
  const admin = createAdminSupabase();

  const { data: users } = await admin
    .from("platform_users")
    .select(
      "id, user_id, email, full_name, role, is_active, last_login_at, must_change_password",
    )
    .is("deleted_at", null)
    .order("created_at");

  return (
    <>
      <PageHeader
        title="Platform users"
        description="Staff who administer the platform. Business accounts live inside their own business."
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Platform users" },
        ]}
      />

      <Alert tone="info" title="Passwords are never retrievable">
        Credentials are stored only as hashes by the auth service. A Super Admin
        can issue a reset or set a new temporary password, but no interface can
        reveal an existing one.
      </Alert>

      <PlatformUsersPanel
        users={(users ?? []).map((u) => ({
          id: u.id,
          userId: u.user_id,
          email: u.email,
          fullName: u.full_name,
          role: u.role,
          isActive: u.is_active,
          lastLoginAt: u.last_login_at,
          mustChangePassword: u.must_change_password,
        }))}
        canAdminister={canAdministerPlatform(session.role)}
        currentUserId={session.user.id}
      />
    </>
  );
}
