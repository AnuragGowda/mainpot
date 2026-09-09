import Link from "next/link";
import type { Metadata } from "next";
import HeroGameDemo from "@/components/HeroGameDemo";
import DeferredResumeBanner from "@/components/DeferredResumeBanner";
import LandingFaq from "@/components/LandingFaq";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import SuitIcon from "@/components/SuitIcon";
import { isSupabaseConfigured } from "@/lib/supabase";
import { GITHUB_URL } from "@/lib/product";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

const linkBaseClasses =
  "inline-flex h-12 items-center justify-center rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 sm:px-6";

const steps = [
  { number: "01", title: "Start a table", description: "Set the buy-in and invite everyone with a code or QR link." },
  { number: "02", title: "Record the buy-ins", description: "Log each buy-in and rebuy. Everyone can follow the totals." },
  { number: "03", title: "Settle up", description: "Count the final stacks, resolve any difference, and see who owes whom." },
];

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Mainpot",
        url: SITE_URL,
        description:
          "A shared poker night ledger for tracking buy-ins, rebuys, cash-outs, and settlement payments.",
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#webapplication`,
        name: "Mainpot",
        url: SITE_URL,
        applicationCategory: "GameApplication",
        operatingSystem: "Any",
        description:
          "A shared poker night ledger for tracking buy-ins, rebuys, cash-outs, and settlement payments.",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        featureList: [
          "Track poker buy-ins and rebuys",
          "Reconcile the bank before cash-out",
          "Calculate the smallest practical set of settlement payments",
        ],
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };

  return (
    <div className="ante-landing relative min-h-screen overflow-x-clip bg-[#f7f8f6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div aria-hidden="true" className="ante-page-washes absolute inset-0" />
      <div aria-hidden="true" className="ante-page-glow absolute inset-x-0 top-16" />
      <div aria-hidden="true" className="ante-page-dot-arch absolute inset-x-0 top-16" />
      <SiteNav />
      <main tabIndex={-1} id="main-content" className="relative isolate pb-20 sm:pb-0">
        <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
          <section className="ante-hero relative -mx-4 px-4 pb-10 pt-10 sm:-mx-6 sm:px-10 sm:py-24 lg:px-14 lg:py-28">
            <div className="relative grid items-center gap-10 sm:gap-14 xl:grid-cols-[1.05fr_0.95fr]">
              <div>
                <div className="ante-intro inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-700 shadow-sm backdrop-blur-xl">
                  <SuitIcon className="h-3 w-3" suit="spade" />
                  For home poker cash games
                </div>
                <h1 className="ante-intro ante-intro-delay-1 mt-6 max-w-2xl text-5xl font-semibold tracking-[-0.055em] text-gray-950 sm:text-6xl lg:text-7xl">
                  Keep the game friendly. Keep the money exact.
                </h1>
                <p className="ante-intro ante-intro-delay-2 mt-6 max-w-xl text-lg leading-8 text-gray-600">
                  Track buy-ins, count the final stacks, and see who owes whom. One record for the whole table.
                </p>
                <div className="ante-intro ante-intro-delay-3 mt-7 flex gap-3 sm:mt-9">
                  <Link href="/create" className={`${linkBaseClasses} flex-1 bg-gray-950 text-white shadow-lg shadow-gray-950/10 hover:bg-gray-800 sm:flex-none`}>
                    Start a cash game
                  </Link>
                  <Link href="/join" className={`${linkBaseClasses} flex-1 border border-gray-300 bg-white text-gray-900 shadow-sm hover:border-gray-400 hover:bg-gray-50 sm:flex-none`}>
                    Join a table
                  </Link>
                </div>
                <div className="ante-intro ante-intro-delay-3 mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-gray-600 sm:mt-5">
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gray-900" />No app or player account</span>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gray-900" />{isSupabaseConfigured ? "Syncs across devices" : "Saved on this device"}</span>
                </div>
                <Link href="/poker-settlement-calculator" className="ante-intro ante-intro-delay-3 mt-2 inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-gray-700 underline decoration-gray-300 underline-offset-4 transition hover:text-gray-950 hover:decoration-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">
                  Try the settlement calculator →
                </Link>
                <div className="ante-intro ante-intro-delay-3 mt-3 sm:mt-5 sm:min-h-5">
                  <DeferredResumeBanner />
                </div>
              </div>

              <div className="ante-intro ante-intro-delay-2">
                <HeroGameDemo />
              </div>
            </div>
          </section>
          <div id="hero-end" aria-hidden="true" />
        </div>

        <div className="relative">
          <section className="relative px-4 pb-12 sm:px-6 md:pb-16">
            <div aria-hidden="true" className="ante-section-atmosphere ante-section-atmosphere-steps absolute inset-x-0 top-0" />
            <div className="relative z-10 mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-7 sm:px-8 sm:py-8">
                <h2 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">How a game works.</h2>
              </div>
              <div className="ante-steps grid divide-y divide-gray-200 md:grid-cols-3 md:divide-x md:divide-y-0">
                {steps.map((step) => (
                  <div key={step.number} className="ante-step relative p-6 sm:p-8">
                    <div className="flex items-center justify-between">
                      <span className="ante-step-marker font-mono text-xs font-semibold text-gray-500">{step.number}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-gray-950">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <LandingFaq />
        </div>

        <section aria-labelledby="open-source-heading" className="relative px-4 pb-12 sm:px-6 md:pb-16">
          <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-5 rounded-2xl border border-gray-200 bg-white px-6 py-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <div>
              <h2 id="open-source-heading" className="text-xl font-semibold tracking-tight text-gray-950">Free and open source.</h2>
              <p className="mt-1 text-sm leading-6 text-gray-600">Play here, or run Mainpot on your own server.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/self-host" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">Explore self-hosting</Link>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-gray-700 underline decoration-gray-300 underline-offset-4 transition hover:text-gray-950 hover:decoration-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">View source</a>
            </div>
          </div>
        </section>

        <section aria-labelledby="sendoff-heading" className="relative px-4 pb-12 sm:px-6 md:pb-16">
          <div aria-hidden="true" className="ante-section-atmosphere ante-section-atmosphere-cta absolute inset-x-0 top-0" />
          <div className="relative z-10 mx-auto w-full max-w-6xl">
            <div aria-hidden="true" className="ante-suit-card ante-cta-suit-card ante-cta-card-diamond"><span className="ante-suit-card-surface"><SuitIcon suit="diamond" /></span></div>
            <div aria-hidden="true" className="ante-suit-card ante-cta-suit-card ante-cta-card-heart"><span className="ante-suit-card-surface"><SuitIcon suit="heart" /></span></div>
            <div className="ante-cta relative flex w-full flex-col items-start gap-6 overflow-hidden rounded-3xl bg-gray-950 px-6 py-10 text-white sm:px-10 md:flex-row md:items-center md:justify-between md:gap-10 lg:px-14 lg:py-14">
              <h2 id="sendoff-heading" className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Ready for your next poker night?</h2>
              <Link href="/create" className={`${linkBaseClasses} ante-cta-button w-full shrink-0 bg-white text-gray-950 hover:bg-gray-100 focus-visible:ring-white focus-visible:ring-offset-gray-950 sm:w-auto`}>Start a game <span aria-hidden="true" className="ante-cta-button-arrow">→</span></Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
