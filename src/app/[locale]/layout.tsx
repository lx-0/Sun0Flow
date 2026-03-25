import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { SessionProvider } from "@/components/SessionProvider";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { routing } from "@/i18n/routing";
// Lazy-load the PWA install prompt — only shown when install conditions are met
const PwaInstallPrompt = dynamic(
  () => import("@/components/PwaInstallPrompt").then((m) => m.PwaInstallPrompt),
  { ssr: false }
);
import "../globals.css";

const geistSans = localFont({
  src: "../fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const { locale } = params;
  const t = await getTranslations({ locale, namespace: "common" });

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: `${t("appName")} — ${t("tagline")}`,
      template: `%s — ${t("appName")}`,
    },
    description: "Manage your Suno music, discover inspiration, and automate your creative workflow.",
    manifest: "/manifest.json",
    openGraph: {
      title: `${t("appName")} — ${t("tagline")}`,
      description: "Manage your Suno music, discover inspiration, and automate your creative workflow.",
      type: "website",
      siteName: t("appName"),
      images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "SunoFlow" }],
    },
    twitter: {
      card: "summary",
      title: `${t("appName")} — ${t("tagline")}`,
      description: "Manage your Suno music, discover inspiration, and automate your creative workflow.",
      images: ["/icons/icon-512.png"],
    },
    alternates: {
      canonical: `${siteUrl}/${locale}`,
      languages: {
        "en": `${siteUrl}/en`,
        "de": `${siteUrl}/de`,
        "ja": `${siteUrl}/ja`,
        "x-default": siteUrl,
      },
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#7c3aed",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;

  // Validate locale
  if (!routing.locales.includes(locale as typeof routing.locales[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("sunoflow_theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
        {/* hreflang tags for SEO */}
        <link rel="alternate" hrefLang="en" href={`${siteUrl}/en`} />
        <link rel="alternate" hrefLang="de" href={`${siteUrl}/de`} />
        <link rel="alternate" hrefLang="ja" href={`${siteUrl}/ja`} />
        <link rel="alternate" hrefLang="x-default" href={siteUrl} />
      </head>
      <body className={`${geistSans.variable} antialiased bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white min-h-screen`}>
        <NextIntlClientProvider messages={messages}>
          <ServiceWorkerRegistrar />
          <OfflineIndicator />
          <PwaInstallPrompt />
          <SessionProvider>
            {children}
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
