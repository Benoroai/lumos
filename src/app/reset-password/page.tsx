import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata: Metadata = { title: "Set a new password" };

/**
 * Reached from the emailed reset link. Supabase exchanges the recovery token
 * for a session before this renders, so the form only needs to set the new
 * password on the already-authenticated user.
 */
export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a password you have not used before."
    >
      <ChangePasswordForm redirectTo="/dashboard" />
    </AuthShell>
  );
}
