import type { ReactNode } from "react";
import SiteNav from "@/components/SiteNav";

interface GameSetupShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export default function GameSetupShell({
  eyebrow,
  title,
  description,
  children,
}: GameSetupShellProps) {
  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <SiteNav />
      <main id="main-content" tabIndex={-1} className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 focus:outline-none sm:gap-10 sm:px-6 sm:py-12 lg:grid-cols-[1fr_440px] lg:items-start lg:gap-16 lg:py-20">
        <section className="pt-2 lg:sticky lg:top-36">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-700">
            {eyebrow}
          </p>
          <h1 className="mt-2 max-w-xl text-3xl font-semibold tracking-[-0.04em] text-gray-950 sm:mt-4 sm:text-5xl">
            {title}
          </h1>
          <p className="mt-3 max-w-lg text-base leading-6 text-gray-600 sm:text-lg sm:leading-8">
            {description}
          </p>
        </section>

        <section className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-[0_18px_50px_rgba(17,24,20,0.07)] sm:p-8">
          {children}
        </section>
      </main>
    </div>
  );
}
