import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { Nunito, Space_Grotesk } from "next/font/google";
import { ClientRuntime } from "@/components/providers/client-runtime";
import { getPlatformBranding } from "@/server/queries/branding";
import { getSystemDisplayPreferences } from "@/server/queries/system-locale";
import "./globals.css";

const bodyFont = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const headingFont = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "700"],
});

function iconMimeType(url: string) {
  const normalized = url.toLowerCase().split("?")[0];
  if (normalized.endsWith(".ico")) return "image/x-icon";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

function withVersion(url: string, updatedAt: string | null) {
  if (!updatedAt) {
    return url;
  }
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${timestamp}`;
}

export async function generateMetadata(): Promise<Metadata> {
  noStore();
  const branding = getPlatformBranding();
  const faviconHref = withVersion(branding.faviconUrl, branding.updatedAt);
  const logoHref = withVersion(branding.logoUrl, branding.updatedAt);
  // Always also point /favicon.ico through the dynamic branding endpoint (cache-busted).
  const dynamicFavicon = withVersion("/api/branding/favicon", branding.updatedAt);
  const faviconType = iconMimeType(branding.faviconUrl);

  return {
    title: branding.appTitle,
    description: "Interactive LMS for junior high school students with analytics and gamification.",
    icons: {
      icon: [
        { url: dynamicFavicon, type: faviconType },
        { url: faviconHref, type: faviconType },
      ],
      shortcut: dynamicFavicon,
      apple: [{ url: logoHref }],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  noStore();
  const displayPreferences = getSystemDisplayPreferences();
  const serializedPreferences = JSON.stringify(displayPreferences).replace(/</g, "\\u003c");

  return (
    <html
      lang={displayPreferences.locale.split("-")[0] || "en"}
      data-learnhub-timezone={displayPreferences.timeZone}
      data-learnhub-locale={displayPreferences.locale}
    >
      <body className={`${bodyFont.variable} ${headingFont.variable} antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__learnhubDisplayPreferences=${serializedPreferences};`,
          }}
        />
        <ClientRuntime>{children}</ClientRuntime>
      </body>
    </html>
  );
}
