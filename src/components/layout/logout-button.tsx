"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onLogout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <Button variant="secondary" size="sm" onClick={onLogout} disabled={pending}>
      {pending ? "Signing out..." : "Sign out"}
    </Button>
  );
}
