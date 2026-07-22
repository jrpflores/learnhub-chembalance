import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { LoginForm } from "@/components/auth/login-form";
import { BrandLogo } from "@/components/layout/brand-logo";
import { getCurrentUser } from "@/lib/auth";
import { resolveLoginAccessUrls } from "@/lib/server-network";
import { getPlatformBranding } from "@/server/queries/branding";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    if (user.role === "ADMIN") {
      redirect("/admin");
    }
    if (user.role === "TEACHER") {
      redirect("/teacher");
    }
    redirect("/student");
  }

  const requestHeaders = await headers();
  const branding = getPlatformBranding();
  const accessUrls = resolveLoginAccessUrls({
    hostHeader: requestHeaders.get("host"),
    forwardedHostHeader: requestHeaders.get("x-forwarded-host"),
    forwardedProtoHeader: requestHeaders.get("x-forwarded-proto"),
  });

  return (
    <div className="min-h-screen bg-[var(--bg-page)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-[var(--line-200)] bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] sm:p-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-100)] px-3 py-1">
            <BrandLogo size={18} alt={`${branding.name} logo`} src={branding.logoUrl} />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-700)]">{branding.name}</p>
          </div>
          <h1 className="mt-5 text-3xl font-black leading-tight text-[var(--ink-900)] sm:text-4xl">
            Learning that feels like progress, not pressure.
          </h1>
          <p className="mt-4 max-w-xl text-sm text-[var(--ink-600)] sm:text-base">
            Interactive lessons, focused quizzes, and smart recommendations designed for high school and senior high students.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <InfoCard title="One-question flow" text="Focused quiz mode with progress feedback and supportive microcopy." />
            <InfoCard title="Teacher insights" text="Actionable analytics for weak topics, hardest questions, and intervention." />
            <InfoCard title="Offline-ready" text="Dockerized LMS and AI grading subsystem for controlled school deployments." />
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--line-200)] bg-white p-6 shadow-[0_18px_40px_rgba(2,6,23,0.08)] sm:p-8">
          <h2 className="text-2xl font-black text-[var(--ink-900)]">Sign in</h2>
          <div className="mt-5">
            <Suspense>
              <LoginForm brandName={branding.name || "ChemBalance"} logoUrl={branding.logoUrl} />
            </Suspense>
          </div>
          {accessUrls.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-500)]">Local Network</p>
              <p className="mt-1 text-xs text-[var(--ink-600)]">Share this login URL in your local network:</p>
              <ul className="mt-2 space-y-1">
                {accessUrls.map((url) => (
                  <li key={url} className="text-xs font-semibold text-[var(--brand-700)] break-all">
                    {url}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line-200)] bg-[var(--line-100)] p-3">
      <p className="text-sm font-bold text-[var(--ink-800)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--ink-600)]">{text}</p>
    </div>
  );
}
