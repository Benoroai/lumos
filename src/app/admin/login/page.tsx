import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Platform administration" };

export default function PlatformLoginPage() {
  return (
    <AuthShell
      tone="ink"
      eyebrow="Platform administration"
      title="Super Admin sign in"
      subtitle="Restricted to platform staff. All access is audited."
      footer={
        <p className="text-center text-xs text-[var(--foreground-subtle)]">
          Business owner?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Sign in to your business dashboard
          </Link>
        </p>
      }
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <SignInForm portal="platform" forgotHref="/admin/forgot-password" />
      </Suspense>
    </AuthShell>
  );
}
