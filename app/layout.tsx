import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import Providers from "@/components/Providers";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Mainpot — Poker Buy-In & Settlement Tracker",
    template: "%s | Mainpot",
  },
  description:
    "Track poker buy-ins, rebuys, cash-outs, and settlement payments for every home game in one shared ledger.",
  applicationName: "Mainpot",
  category: "Poker",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mainpot",
  },
  openGraph: {
    type: "website",
    siteName: "Mainpot",
    title: "Mainpot — Poker Buy-In & Settlement Tracker",
    description:
      "Track the bank from the first chip to the final settlement.",
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Mainpot — Keep the game friendly. Keep the money exact.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mainpot — Poker Buy-In & Settlement Tracker",
    description:
      "Track the bank from the first chip to the final settlement.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Mainpot — Keep the game friendly. Keep the money exact.",
      },
    ],
  },
  // Most routes are private game or account flows. The public homepage opts in
  // to indexing with route-specific metadata.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f8f6",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#f7f8f6] font-sans text-gray-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
