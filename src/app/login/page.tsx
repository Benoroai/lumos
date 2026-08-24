import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Business sign in" };

export default function BusinessLoginPage() {
  return (
    <AuthShell
      eyebrow="Business portal"
      title="Sign in to your dashboard"
      subtitle="Manage your catalog, branches, offers and analytics."
      footer={
        <p className="text-center text-xs text-[var(--foreground-subtle)]">
          Platform staff?{" "}
          <Link href="/admin/login" className="underline underline-offset-4">
            Use the administration portal
          </Link>
        </p>
      }
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <SignInForm portal="business" forgotHref="/forgot-password" />
      </Suspense>
    </AuthShell>
  );
}
