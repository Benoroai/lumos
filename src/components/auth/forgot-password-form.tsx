"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function ForgotPasswordForm({
  portal,
  backHref,
}: {
  portal: "platform" | "business";
  backHref: string;
}) {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="portal" value={portal} />

      {state?.ok ? (
        <Alert tone="success" title="Check your inbox">
          {state.message}
        </Alert>
      ) : null}
      {state && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field id="email" label="Email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
        />
      </Field>

      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Send reset link
      </Button>

      <p className="text-center text-sm">
        <Link
          href={backHref}
          className="text-[var(--primary)] underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
