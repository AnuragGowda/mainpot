import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ??
      "https://mainpot.app"
  ),
  title: {
    default: "Mainpot — The poker night ledger",
    template: "%s · Mainpot",
  },
  description:
    "Track poker buy-ins and rebuys, reconcile the bank, and settle every home game with fewer payments.",
  applicationName: "Mainpot",
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
  keywords: [
    "poker tracker",
    "poker settlement calculator",
    "home game ledger",
    "poker buy-in tracker",
    "poker banking app",
  ],
  openGraph: {
    type: "website",
    siteName: "Mainpot",
    title: "Mainpot — The poker night ledger",
    description:
      "Track the bank from the first chip to the final payment.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mainpot — The poker night ledger",
    description:
      "Track the bank from the first chip to the final payment.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f8f6",
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
