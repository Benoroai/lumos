"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";

export function SignOutButton({
  portal = "business",
}: {
  portal?: "platform" | "business";
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      className="w-full"
      loading={pending}
      onClick={() => startTransition(() => void signOutAction(portal))}
    >
      <LogOut /> Sign out
    </Button>
  );
}
