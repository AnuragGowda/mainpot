import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://agent-runner.tail3ff4e2.ts.net:8443";

  const lastModified = new Date();
  return [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/create`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/join`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/feedback`, lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
