import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ante — Poker Night Ledger",
    short_name: "Ante",
    description:
      "Track poker buy-ins, reconcile the bank, and settle every home game.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f6",
    theme_color: "#171917",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
