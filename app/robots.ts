import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://agent-runner.tail3ff4e2.ts.net:8443";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/friends", "/signin", "/auth/", "/game/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
