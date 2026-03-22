import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SunoFlow — Personal Music Manager",
    template: "%s — SunoFlow",
  },
  description: "Manage your Suno music, discover inspiration, and automate your creative workflow.",
  manifest: "/manifest.json",
  openGraph: {
    title: "SunoFlow — Personal Music Manager",
    description: "Manage your Suno music, discover inspiration, and automate your creative workflow.",
    type: "website",
    siteName: "SunoFlow",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "SunoFlow" }],
  },
  twitter: {
    card: "summary",
    title: "SunoFlow — Personal Music Manager",
    description: "Manage your Suno music, discover inspiration, and automate your creative workflow.",
    images: ["/icons/icon-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#7c3aed",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("sunoflow_theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} antialiased bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white min-h-screen`}>
        <ServiceWorkerRegistrar />
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
