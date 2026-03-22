import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/s/"],
      disallow: [
        "/api/",
        "/login",
        "/register",
        "/library",
        "/playlists",
        "/favorites",
        "/history",
        "/generate",
        "/settings",
        "/profile",
        "/admin",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
