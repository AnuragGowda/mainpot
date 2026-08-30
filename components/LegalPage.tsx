import type { ReactNode } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";

interface LegalPageProps {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}

export default function LegalPage({ eyebrow, title, intro, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <SiteNav />
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{eyebrow}</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-gray-950 sm:text-5xl">{title}</h1>
        <p className="mt-5 text-lg leading-8 text-gray-600">{intro}</p>
        <p className="mt-4 text-sm text-gray-500">Effective August 30, 2026</p>
        <article className="mt-10 space-y-8 rounded-2xl border border-gray-200 bg-white p-6 text-sm leading-7 text-gray-600 shadow-sm sm:p-9">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-950">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
