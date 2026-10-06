"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Settings,
  Sparkles,
  Trophy,
  UserCircle2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";
import { LogoutButton } from "@/components/layout/logout-button";
import { BrandLogo } from "@/components/layout/brand-logo";
type PortalShellProps = {
  roleLabel: string;
  userName: string;
  navItems: NavItem[];
  brandName: string;
  brandLogoUrl: string;
  children: React.ReactNode;
};

export function PortalShell({ roleLabel, userName, navItems, brandName, brandLogoUrl, children }: PortalShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams?.toString() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return window.localStorage.getItem("learnhub:sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const normalizedRole = roleLabel.toLowerCase();

  const roleMenu = useMemo(
    () =>
      navItems.map((item) => ({
        ...item,
        icon: iconForItem(item),
      })),
    [navItems],
  );

  const roleSubtitle = `${roleLabel} Portal`;
  const profileHref = `${navItems[0]?.href ?? "/student"}/profile`;
  const userInitials = getInitials(userName);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(pathname, navItems), [pathname, navItems]);
  const hideAutoBreadcrumb = useMemo(() => shouldHideAutoBreadcrumb(pathname), [pathname]);

  useEffect(() => {
    try {
      window.localStorage.setItem("learnhub:sidebar-collapsed", desktopCollapsed ? "1" : "0");
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, [desktopCollapsed]);

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-[var(--line-200)] bg-white transition-[width,padding] duration-200 lg:block",
          desktopCollapsed ? "w-20 p-3" : "w-72 p-4",
        )}
      >
        <div className="flex h-full flex-col">
          <div className={cn("mb-6 rounded-2xl border border-[var(--line-200)] bg-[var(--line-100)]", desktopCollapsed ? "p-3" : "p-4")}>
            <div className={cn("flex items-center", desktopCollapsed ? "justify-center" : "gap-3")}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1 shadow-sm">
                <BrandLogo size={30} alt={`${brandName} logo`} src={brandLogoUrl} />
              </div>
              {!desktopCollapsed ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-600)]">{brandName}</p>
                  <p className="text-base font-bold text-[var(--ink-900)]">{roleSubtitle}</p>
                </div>
              ) : null}
            </div>
            {!desktopCollapsed ? (
              <p className="mt-3 text-xs text-[var(--ink-500)]">Interactive learning, clear progress, and consistent momentum.</p>
            ) : null}
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto">
            {roleMenu.map((item) => (
              <NavRow key={item.href} item={item} active={isActivePath(pathname, currentQuery, item.href)} collapsed={desktopCollapsed} />
            ))}
          </nav>

          <div
            className={cn(
              "mt-4 rounded-xl border border-[var(--line-200)] bg-[var(--line-100)]",
              desktopCollapsed ? "p-2.5 text-center" : "p-3",
            )}
          >
            {desktopCollapsed ? (
              <div
                title={`${userName} (${normalizedRole})`}
                className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-[var(--brand-700)]"
              >
                {userInitials}
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">Signed in</p>
                <p className="mt-1 text-sm font-semibold text-[var(--ink-900)]">{userName}</p>
                <p className="text-xs capitalize text-[var(--ink-500)]">{normalizedRole}</p>
              </>
            )}
          </div>
        </div>
      </aside>

      <div className={cn("transition-[padding] duration-200", desktopCollapsed ? "lg:pl-20" : "lg:pl-72")}>
        <header className="sticky top-0 z-20 border-b border-[var(--line-200)] bg-white">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line-200)] bg-white text-[var(--ink-700)] lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setDesktopCollapsed((prev) => !prev)}
                className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[var(--line-200)] bg-white text-[var(--ink-700)] lg:inline-flex"
                aria-label={desktopCollapsed ? "Expand navigation" : "Collapse navigation"}
                title={desktopCollapsed ? "Expand menu" : "Collapse menu"}
              >
                {desktopCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </button>
              <div className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[var(--line-200)] bg-white p-1 sm:flex">
                <BrandLogo size={30} alt={`${brandName} logo`} src={brandLogoUrl} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-600)]">{brandName}</p>
                <h1 className="text-lg font-bold text-[var(--ink-900)]">{roleSubtitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-[var(--ink-900)]">{userName}</p>
                <p className="text-xs text-[var(--ink-500)]">Welcome back</p>
              </div>
              <Link
                href={profileHref}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[var(--line-300)] bg-white px-3 text-sm font-semibold text-[var(--ink-700)] hover:bg-[var(--line-100)]"
              >
                <UserCircle2 className="h-4 w-4 text-[var(--brand-600)]" />
                <span className="hidden sm:inline">Account</span>
              </Link>
              <LogoutButton />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {breadcrumbs.length > 1 && !hideAutoBreadcrumb ? (
            <nav aria-label="Breadcrumb" className="mb-4 overflow-x-auto">
              <ol className="flex min-w-max items-center gap-1 text-sm text-[var(--ink-500)]">
                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <li key={`${crumb.href}-${index}`} className="flex items-center gap-1">
                      {isLast || crumb.clickable === false ? (
                        <span className="font-semibold text-[var(--ink-900)]">{crumb.label}</span>
                      ) : (
                        <Link href={crumb.href} className="hover:text-[var(--ink-700)] hover:underline">
                          {crumb.label}
                        </Link>
                      )}
                      {!isLast ? <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" /> : null}
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : null}
          {children}
        </main>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/45 transition lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 border-r border-[var(--line-200)] bg-white p-4 shadow-2xl transition-transform lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
              <BrandLogo size={28} alt={`${brandName} logo`} src={brandLogoUrl} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-600)]">{brandName}</p>
              <p className="text-sm font-semibold text-[var(--ink-900)]">{roleSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-200)] bg-white"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4 text-[var(--ink-700)]" />
          </button>
        </div>

        <nav className="mt-5 space-y-1">
          {roleMenu.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isActivePath(pathname, currentQuery, item.href)}
              onClick={() => setMobileOpen(false)}
            />
          ))}
        </nav>
      </aside>
    </div>
  );
}

function isActivePath(pathname: string, currentQuery: string, href: string) {
  const [hrefPath, hrefQuery] = href.split("?");
  if (hrefQuery) {
    if (pathname !== hrefPath) {
      return false;
    }

    const current = new URLSearchParams(currentQuery);
    const target = new URLSearchParams(hrefQuery);
    for (const [key, value] of target.entries()) {
      if (current.get(key) !== value) {
        return false;
      }
    }

    return true;
  }

  if (isRoleRootHref(href)) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isRoleRootHref(href: string) {
  return href === "/admin" || href === "/teacher" || href === "/student";
}

function buildBreadcrumbs(pathname: string, navItems: NavItem[]) {
  const [roleRoot] = navItems;
  if (!roleRoot) {
    return [];
  }

  const cleanPath = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const rawSegments = cleanPath.split("/").filter(Boolean);
  const rootSegments = roleRoot.href.split("/").filter(Boolean);

  if (rawSegments.length === 0 || rawSegments[0] !== rootSegments[0]) {
    return [];
  }

  const crumbs: { href: string; label: string; clickable?: boolean }[] = [
    { href: roleRoot.href, label: roleRoot.label, clickable: true },
  ];
  const trailSegments = rawSegments.slice(rootSegments.length);
  if (trailSegments.length === 0) {
    return crumbs;
  }

  const navLabelMap = new Map(navItems.map((item) => [item.href, item.label]));
  const cumulative = [...rootSegments];

  for (let index = 0; index < trailSegments.length; index += 1) {
    const segment = trailSegments[index];
    cumulative.push(segment);
    const href = `/${cumulative.join("/")}`;

    const mapped = navLabelMap.get(href);
    const isIdSegment = isLikelyIdSegment(segment);
    const label = mapped ?? humanizeSegment(segment, trailSegments[index - 1]);
    crumbs.push({ href, label, clickable: !isIdSegment });
  }

  return crumbs;
}

function shouldHideAutoBreadcrumb(pathname: string) {
  return (
    /^\/teacher\/lessons(?:\/.*)?$/.test(pathname) ||
    /^\/teacher\/subjects\/[^/]+\/?$/.test(pathname) ||
    /^\/student(?:\/.*)?$/.test(pathname)
  );
}

function humanizeSegment(segment: string, previousSegment?: string) {
  if (isLikelyIdSegment(segment)) {
    if (previousSegment) {
      return singularize(humanizePlainText(previousSegment));
    }
    return "Details";
  }

  return humanizePlainText(segment);
}

function humanizePlainText(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isLikelyIdSegment(segment: string) {
  return (
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment) ||
    /^[a-z]{2,4}_[a-z0-9]{8,}$/i.test(segment) ||
    /^[0-9]{4,}$/.test(segment)
  );
}

function singularize(value: string) {
  if (value.endsWith("ies")) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith("s") && !value.endsWith("ss")) {
    return value.slice(0, -1);
  }
  return value;
}

function iconForItem(item: NavItem): LucideIcon {
  if (item.href.endsWith("/users")) return Users;
  if (item.href.endsWith("/students")) return Users;
  if (item.href.endsWith("/subjects")) return BookOpen;
  if (item.href.includes("/lessons?subject=")) return BookOpen;
  if (item.href.includes("/student/lessons?subject=")) return BookOpen;
  if (item.href.endsWith("/sections")) return Users;
  if (item.href.endsWith("/lessons")) return BookOpen;
  if (item.href.endsWith("/equations")) return FlaskConical;
  if (item.href.endsWith("/quizzes")) return FileQuestion;
  if (item.href.endsWith("/practice") || item.href.endsWith("/practice/equations")) return FlaskConical;
  if (item.href.endsWith("/analytics")) return BarChart3;
  if (item.href.endsWith("/settings")) return Settings;
  if (item.href.endsWith("/results")) return Trophy;
  if (item.href.endsWith("/achievements")) return Sparkles;
  if (item.href.endsWith("/profile")) return UserCircle2;
  if (item.href.endsWith("/questions")) return FileQuestion;
  return LayoutDashboard;
}

function NavRow({
  item,
  active,
  onClick,
  collapsed = false,
}: {
  item: NavItem & { icon: LucideIcon };
  active: boolean;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  const linkNode = (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center rounded-lg py-2.5 text-sm font-medium transition",
        collapsed ? "justify-center px-2" : "gap-2 px-3",
        active
          ? "bg-[var(--brand-500)] !text-white hover:bg-[var(--brand-600)]"
          : "bg-transparent text-[var(--ink-600)] hover:bg-[var(--line-100)]",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-current")} />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className={active ? "text-white" : undefined}>{item.label}</span>}
    </Link>
  );

  if (!collapsed) {
    return linkNode;
  }

  return (
    <div className="group/nav relative">
      {linkNode}
      <span
        className={cn(
          "pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold shadow-md transition",
          "bg-[var(--ink-900)] text-white opacity-0",
          "group-hover/nav:opacity-100 group-focus-within/nav:opacity-100",
        )}
      >
        {item.label}
      </span>
    </div>
  );
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "U";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
