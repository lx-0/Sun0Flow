import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { DashboardView } from "@/components/DashboardView";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

export const metadata: Metadata = {
  title: "SunoFlow — Personal Music Manager",
  description:
    "Manage your Suno music, discover inspiration, and automate your creative workflow.",
  openGraph: {
    title: "SunoFlow — Personal Music Manager",
    description:
      "Manage your Suno music, discover inspiration, and automate your creative workflow.",
    url: siteUrl,
    type: "website",
  },
};

function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "SunoFlow",
  url: siteUrl,
  description:
    "Manage your Suno music, discover inspiration, and automate your creative workflow.",
};

export default async function HomePage() {
  const session = await auth();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd) }}
      />
      <AppShell>
        <DashboardView userName={session?.user?.name} />
      </AppShell>
    </>
  );
}
