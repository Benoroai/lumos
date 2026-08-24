import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ChangePasswordPage() {
  return (
    <AuthShell
      tone="primary"
      eyebrow="Security"
      title="Choose a new password"
      subtitle="Your account was created with a temporary password. Pick your own before continuing."
    >
      <ChangePasswordForm redirectTo="/dashboard" />
    </AuthShell>
  );
}
