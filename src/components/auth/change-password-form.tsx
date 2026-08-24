"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changePasswordAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

export function ChangePasswordForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message ?? "Password updated");
      router.replace(redirectTo);
      router.refresh();
    }
  }, [state, router, redirectTo]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state && !state.ok && !state.fieldErrors ? (
        <Alert tone="danger">{state.error}</Alert>
      ) : null}

      <Field
        id="password"
        label="New password"
        hint="At least 10 characters, mixing upper and lower case with a number."
        error={state && !state.ok ? state.fieldErrors?.password : undefined}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
        />
      </Field>

      <Field
        id="confirmPassword"
        label="Confirm password"
        error={
          state && !state.ok ? state.fieldErrors?.confirmPassword : undefined
        }
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Update password
      </Button>
    </form>
  );
}
