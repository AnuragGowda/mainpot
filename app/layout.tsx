import type { Metadata } from "next";
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
      "https://agent-runner.tail3ff4e2.ts.net:8443"
  ),
  title: {
    default: "Ante — The poker night ledger",
    template: "%s · Ante",
  },
  description:
    "Track poker buy-ins and rebuys, reconcile the bank, and settle every home game with fewer payments.",
  applicationName: "Ante",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ante",
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
    siteName: "Ante",
    title: "Ante — The poker night ledger",
    description:
      "Track the bank from the first chip to the final payment.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ante — The poker night ledger",
    description:
      "Track the bank from the first chip to the final payment.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: "/" },
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
