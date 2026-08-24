"use client";

import { useActionState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function SignInForm({
  portal,
  forgotHref,
}: {
  portal: "platform" | "business";
  forgotHref: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(signInAction, null);

  useEffect(() => {
    if (state?.ok) {
      const next = searchParams.get("next");
      // Only honour same-origin relative paths — an open redirect here would
      // be a phishing vector straight off the login page.
      const target =
        next?.startsWith("/") && !next.startsWith("//")
          ? next
          : state.data.redirectTo;
      router.replace(target);
      router.refresh();
    }
  }, [state, router, searchParams]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="portal" value={portal} />

      {state && !state.ok ? (
        <Alert tone="danger" title="Could not sign you in">
          {state.error}
        </Alert>
      ) : null}

      <Field id="email" label="Email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="you@business.com"
        />
      </Field>

      <Field id="password" label="Password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••••"
        />
      </Field>

      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Sign in
      </Button>

      <p className="text-center text-sm">
        <Link
          href={forgotHref}
          className="text-[var(--primary)] underline-offset-4 hover:underline"
        >
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
