import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Bug, Code2, Lightbulb } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import Card from "@/components/ui/Card";
import { BUG_REPORT_URL, FEATURE_REQUEST_URL, GITHUB_URL } from "@/lib/product";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Request a feature, report a bug, or contribute to the open-source poker ledger.",
};

const options = [
  {
    title: "Request a feature",
    description: "Tell us what would make your next poker night easier.",
    href: FEATURE_REQUEST_URL,
    label: "Open feature request",
    icon: Lightbulb,
  },
  {
    title: "Report a bug",
    description: "Share what happened, what you expected, and how to reproduce it.",
    href: BUG_REPORT_URL,
    label: "Open bug report",
    icon: Bug,
  },
];

export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <SiteNav />
      <main className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Built in public</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-gray-950 sm:text-5xl">Help make poker night smoother.</h1>
          <p className="mt-5 text-lg leading-8 text-gray-600">This project is open source. Feedback, fixes, and thoughtful ideas are welcome on GitHub.</p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <a key={option.title} href={option.href} target="_blank" rel="noreferrer" className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">
                <Card className="h-full transition duration-200 group-hover:-translate-y-0.5 group-hover:border-gray-300 group-hover:shadow-md">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-gray-950 text-white"><Icon aria-hidden size={19} /></span>
                  <h2 className="mt-5 text-lg font-semibold text-gray-950">{option.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{option.description}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-950">{option.label}<ArrowUpRight aria-hidden size={15} /></span>
                </Card>
              </a>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <p className="font-medium text-gray-950">Want to contribute code?</p>
            <p className="mt-0.5 text-sm text-gray-500">Browse the source, roadmap, and open issues.</p>
          </div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-semibold text-gray-900 transition hover:bg-gray-50">
            <Code2 aria-hidden size={17} /> View GitHub
          </a>
        </div>

        <Link href="/" className="mt-8 inline-block text-sm font-medium text-gray-600 hover:text-gray-950">← Back home</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
