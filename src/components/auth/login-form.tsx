"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginSplash } from "@/components/auth/login-splash";
import { Button } from "@/components/ui/button";

type LoginFormProps = {
  brandName?: string;
  logoUrl?: string;
};

const SPLASH_MS = 1600;

export function LoginForm({ brandName = "ChemBalance", logoUrl = "/branding/logo.png" }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = useMemo(() => searchParams.get("next") ?? null, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-learnhub-toast-silent": "1",
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json()) as { error?: string; user?: { role: string } };

      if (!response.ok) {
        setError(payload.error ?? "Unable to sign in.");
        return;
      }

      setShowSplash(true);
      await new Promise((resolve) => window.setTimeout(resolve, SPLASH_MS));

      if (nextParam) {
        router.push(nextParam);
        router.refresh();
        return;
      }

      const role = payload.user?.role;
      if (role === "ADMIN") {
        router.push("/admin");
      } else if (role === "TEACHER") {
        router.push("/teacher");
      } else {
        router.push("/student");
      }
      router.refresh();
    });
  }

  return (
    <>
      <LoginSplash open={showSplash} logoUrl={logoUrl} title={brandName} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--ink-700)]" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--line-300)] bg-white px-3 text-sm text-[var(--ink-900)] outline-none ring-[var(--brand-300)] transition focus:ring-2"
            required
            autoComplete="email"
            disabled={pending || showSplash}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-[var(--ink-700)]" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--line-300)] bg-white px-3 text-sm text-[var(--ink-900)] outline-none ring-[var(--brand-300)] transition focus:ring-2"
            required
            autoComplete="current-password"
            disabled={pending || showSplash}
          />
        </div>

        {error ? <p className="rounded-lg bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">{error}</p> : null}

        <Button type="submit" className="w-full" size="lg" disabled={pending || showSplash}>
          {pending || showSplash ? "Signing In..." : "Sign In"}
        </Button>
      </form>
    </>
  );
}
