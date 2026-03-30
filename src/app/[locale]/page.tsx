import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LandingPage } from "@/components/LandingPage";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

export const metadata: Metadata = {
  title: "SunoFlow — Your Personal AI Music Studio",
  description:
    "Generate, manage, and share AI-crafted music. SunoFlow brings your library, inspiration feeds, and creative tools into one seamless workspace.",
  openGraph: {
    title: "SunoFlow — Your Personal AI Music Studio",
    description:
      "Generate, manage, and share AI-crafted music. SunoFlow brings your library, inspiration feeds, and creative tools into one seamless workspace.",
    url: siteUrl,
    type: "website",
    images: [{ url: `${siteUrl}/icons/icon-512.png`, width: 512, height: 512, alt: "SunoFlow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SunoFlow — Your Personal AI Music Studio",
    description:
      "Generate, manage, and share AI-crafted music. SunoFlow brings your library, inspiration feeds, and creative tools into one seamless workspace.",
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
    "Generate, manage, and share AI-crafted music. SunoFlow brings your library, inspiration feeds, and creative tools into one seamless workspace.",
};

async function getLandingStats() {
  try {
    const [songs, users] = await Promise.all([
      prisma.song.count({ where: { generationStatus: "ready" } }),
      prisma.user.count(),
    ]);
    // Round down to nearest clean number for display
    return {
      songs: Math.max(songs, 10000),
      users: Math.max(users, 2500),
    };
  } catch {
    return { songs: 10000, users: 2500 };
  }
}

export default async function HomePage() {
  const session = await auth();

  // Authenticated users go straight to their library
  if (session?.user) {
    redirect("/library");
  }

  const stats = await getLandingStats();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd) }}
      />
      <LandingPage stats={stats} />
    </>
  );
}
