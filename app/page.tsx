import Link from "next/link";
import type { Metadata } from "next";
import HeroGameDemo from "@/components/HeroGameDemo";
import LandingFaq from "@/components/LandingFaq";
import MobileStartBar from "@/components/MobileStartBar";
import ResumeBanner from "@/components/ResumeBanner";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import SuitIcon from "@/components/SuitIcon";
import { isSupabaseConfigured } from "@/lib/supabase";
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
  { number: "01", eyebrow: "Table", title: "Open the table", description: "Name the game, set the buy-in, and share one room code." },
  { number: "02", eyebrow: "Ledger", title: "Keep a shared record", description: "Record buy-ins and rebuys as they happen, with a visible history for the table." },
  { number: "03", eyebrow: "Cash-out", title: "Balance the bank", description: "Enter each cash-out and catch any mismatch before settlement." },
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
      <main className="relative pb-20 sm:pb-0">
        <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
          <section className="ante-hero relative -mx-4 px-4 pb-10 pt-10 sm:-mx-6 sm:px-10 sm:py-24 lg:px-14 lg:py-28">
            <div className="relative grid items-center gap-10 sm:gap-14 xl:grid-cols-[1.05fr_0.95fr]">
              <div>
                <div className="ante-intro inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-700 shadow-sm backdrop-blur-xl">
                  <SuitIcon className="h-3 w-3" suit="spade" />
                  The poker night ledger
                </div>
                <h1 className="ante-intro ante-intro-delay-1 mt-6 max-w-2xl text-5xl font-semibold tracking-[-0.055em] text-gray-950 sm:text-6xl lg:text-7xl">
                  Keep the game friendly. Keep the money exact.
                </h1>
                <p className="ante-intro ante-intro-delay-2 mt-6 max-w-xl text-lg leading-8 text-gray-600">
                  A shared ledger for every buy-in, rebuy, and cash-out—kept current for everyone at the table.
                </p>
                <div className="ante-intro ante-intro-delay-3 mt-7 flex gap-3 sm:mt-9">
                  <Link href="/create" className={`${linkBaseClasses} flex-1 bg-gray-950 text-white shadow-lg shadow-gray-950/10 hover:bg-gray-800 sm:flex-none`}>
                    Start a game
                  </Link>
                  <Link href="/join" className={`${linkBaseClasses} flex-1 border border-gray-300 bg-white text-gray-900 shadow-sm hover:border-gray-400 hover:bg-gray-50 sm:flex-none`}>
                    Join with a code
                  </Link>
                </div>
                <div className="ante-intro ante-intro-delay-3 mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-gray-600 sm:mt-5">
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gray-900" />No app download</span>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gray-900" />No account required</span>
                  <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gray-900" />{isSupabaseConfigured ? "Live sync across devices" : "Runs locally"}</span>
                </div>
                <div className="ante-intro ante-intro-delay-3 mt-3 sm:mt-5 sm:min-h-5">
                  <ResumeBanner />
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
          <MobileStartBar />
          <section className="relative px-4 pb-16 sm:px-6 md:pb-24">
            <div aria-hidden="true" className="ante-section-atmosphere ante-section-atmosphere-steps absolute inset-x-0 top-0" />
            <div className="relative z-10 mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-gray-200 bg-white/95 shadow-sm backdrop-blur-sm">
              <div className="border-b border-gray-200 px-6 py-7 sm:px-8 sm:py-8">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">How it works</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">Three moments. One shared record.</h2>
              </div>
              <div className="ante-steps grid divide-y divide-gray-200 md:grid-cols-3 md:divide-x md:divide-y-0">
                {steps.map((step) => (
                  <div key={step.number} className="ante-step relative p-6 sm:p-8">
                    <div className="flex items-center justify-between">
                      <span className="ante-step-marker font-mono text-xs font-semibold text-gray-500">{step.number}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{step.eyebrow}</span>
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

        <section className="relative z-30 px-4 pb-16 sm:px-6 md:pb-24">
          <div aria-hidden="true" className="ante-section-atmosphere ante-section-atmosphere-cta absolute inset-x-0 top-0" />
          <div className="relative z-10 mx-auto w-full max-w-6xl">
            <div aria-hidden="true" className="ante-suit-card ante-cta-suit-card ante-cta-card-diamond"><span className="ante-suit-card-surface"><SuitIcon suit="diamond" /></span></div>
            <div aria-hidden="true" className="ante-suit-card ante-cta-suit-card ante-cta-card-heart"><span className="ante-suit-card-surface"><SuitIcon suit="heart" /></span></div>
            <div className="ante-cta relative grid w-full gap-10 overflow-hidden rounded-3xl bg-gray-950 px-6 py-10 text-white sm:px-10 lg:grid-cols-[1fr_20rem] lg:items-center lg:px-14 lg:py-14">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Final settlement</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Turn balanced books into fewer payments.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">Once every chip is accounted for, Mainpot calculates the smallest practical set of transfers.</p>
              </div>
              <div className="space-y-4">
                <div className="ante-cta-ledger">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs text-gray-400"><span>Final payments</span><span className="text-emerald-300">Balanced</span></div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between"><span>Alex <span className="mx-1 text-gray-500">→</span> Morgan</span><span className="font-semibold text-emerald-300">$40</span></div>
                    <div className="flex items-center justify-between"><span>Jordan <span className="mx-1 text-gray-500">→</span> Sam</span><span className="font-semibold text-emerald-300">$40</span></div>
                  </div>
                </div>
                <Link href="/create" className={`${linkBaseClasses} w-full bg-white text-gray-950 hover:bg-gray-100`}>Start a game</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
