import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { Alert } from "@/components/ui/alert";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "Account archived" };

export default function AccountStatusPage() {
  return (
    <AuthShell
      title="This business account has been archived"
      subtitle="Everything you built is still here. The platform administrator can reactivate the account at any time."
    >
      <div className="space-y-4">
        <Alert tone="warning" title="Nothing has been lost">
          Your catalog, media, translations and analytics are all intact and
          will be exactly as you left them when access is restored.
        </Alert>
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
