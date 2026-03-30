import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunoflow.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/s/", "/p/", "/u/", "/explore", "/discover"],
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
        "/dashboard/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
