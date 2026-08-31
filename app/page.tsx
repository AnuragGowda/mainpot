import Link from "next/link";
import { Copy, DoorOpen, HandCoins, ListPlus, QrCode } from "lucide-react";
import ResumeBanner from "@/components/ResumeBanner";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import { isSupabaseConfigured } from "@/lib/supabase";

const linkBaseClasses =
  "inline-flex h-12 items-center justify-center rounded-lg px-6 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2";

const steps = [
  { number: "01", icon: DoorOpen, title: "Open the table", description: "Name the game, set the buy-in, and share one room code." },
  { number: "02", icon: ListPlus, title: "Run the ledger", description: "Log every buy-in and rebuy while the cards are in the air." },
  { number: "03", icon: HandCoins, title: "Settle cleanly", description: "Reconcile the bank and generate the fewest possible payments." },
];

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Mainpot",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
    description:
      "A shared poker night ledger for tracking buy-ins, rebuys, cash-outs, and settlement payments.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SiteNav />
      <main>
        <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
          <section className="ante-hero relative -mx-4 overflow-hidden px-4 py-16 sm:-mx-6 sm:rounded-[2rem] sm:px-10 sm:py-24 lg:px-14 lg:py-28">
            <div aria-hidden="true" className="ante-hero-glow absolute inset-0" />
            <div aria-hidden="true" className="ante-dot-grid absolute inset-0" />
            <div className="relative grid items-center gap-14 xl:grid-cols-[1.05fr_0.95fr]">
              <div>
                <div className="ante-intro inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-700 shadow-sm backdrop-blur-xl">
                  <span aria-hidden="true">♠</span>
                  The poker night ledger
                </div>
                <h1 className="ante-intro ante-intro-delay-1 mt-6 max-w-2xl text-5xl font-semibold tracking-[-0.055em] text-gray-950 sm:text-6xl lg:text-7xl">
                  Keep the game friendly. Keep the money exact.
                </h1>
                <p className="ante-intro ante-intro-delay-2 mt-6 max-w-xl text-lg leading-8 text-gray-600">
                  Mainpot tracks the bank from the first chip to the final payment—without spreadsheets, group-chat math, or awkward IOUs.
                </p>
                <div className="ante-intro ante-intro-delay-3 mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link href="/create" className={`${linkBaseClasses} bg-gray-950 text-white shadow-lg shadow-gray-950/10 hover:bg-gray-800`}>
                    Start a game
                  </Link>
                  <Link href="/join" className={`${linkBaseClasses} border border-gray-300 bg-white text-gray-900 shadow-sm hover:border-gray-400 hover:bg-gray-50`}>
                    Join with a code
                  </Link>
                </div>
                <p className="ante-intro ante-intro-delay-3 mt-4 text-xs text-gray-500">
                  No account required · {isSupabaseConfigured ? "Live sync across every device" : "Works in private local mode"} · Free during beta
                </p>
                <div className="ante-intro ante-intro-delay-3 mt-5 min-h-5">
                  <ResumeBanner />
                </div>
              </div>

              <div className="ante-intro ante-intro-delay-2 relative mx-auto w-full max-w-lg">
                <div aria-hidden="true" className="ante-card-halo absolute -inset-8 rounded-[3rem]" />
                <div aria-hidden="true" className="ante-suit-card ante-suit-card-one">♠</div>
                <div aria-hidden="true" className="ante-suit-card ante-suit-card-two">♣</div>
                <div className="ante-card-float relative rounded-3xl border border-white/10 bg-[#0b0c0e] p-5 text-white shadow-2xl shadow-gray-950/25 sm:p-7">
                  <div className="flex items-start justify-between">
                    <div><p className="text-xs uppercase tracking-[0.18em] text-gray-400">Friday night</p><h2 className="mt-1 text-xl font-semibold">The Basement Game</h2></div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-gray-200"><span className="ante-live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />Live</span>
                  </div>
                  <div className="mt-8 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">Bank</p><p className="mt-1 text-lg font-semibold">$360</p></div>
                    <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">Buy-in</p><p className="mt-1 text-lg font-semibold">$40</p></div>
                    <div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-400">Players</p><p className="mt-1 text-lg font-semibold">4</p></div>
                  </div>
                  <div className="mt-5 overflow-hidden rounded-xl bg-white text-gray-900">
                    {[
                      ["AP", "Alex", "$80", "Verified"],
                      ["MK", "Morgan", "$120", "Verified"],
                      ["SR", "Sam", "$80", "Verified"],
                      ["JT", "Jordan", "$80", "Pending"],
                    ].map(([initials, name, amount, status], index) => (
                      <div key={name} className={`flex items-center gap-3 px-4 py-3 ${index ? "border-t border-gray-100" : ""}`}>
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">{initials}</span>
                        <span className="flex-1 text-sm font-medium">{name}</span>
                        <span className="text-sm font-semibold tabular-nums">{amount}</span>
                        <span className={`w-14 text-right text-[10px] font-medium ${status === "Verified" ? "text-emerald-600" : "text-amber-600"}`}>{status}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <div><p className="text-xs text-gray-400">Room code</p><p className="mt-0.5 font-mono text-lg font-semibold tracking-[0.2em]">RIVER7</p></div>
                    <div className="flex items-center gap-2" aria-label="Share room code">
                      <span aria-label="Copy room code" className="grid h-9 w-9 place-items-center rounded-lg bg-white text-gray-950 shadow-sm" role="img">
                        <Copy aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <span aria-label="Show room QR code" className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/10 text-white" role="img">
                        <QrCode aria-hidden="true" className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="px-4 pb-16 sm:px-6 md:pb-24">
          <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-7 sm:px-8 sm:py-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Simple by design</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">From first chip to final payment.</h2>
            </div>
            <div className="grid divide-y divide-gray-200 md:grid-cols-3 md:divide-x md:divide-y-0">
              {steps.map((step) => {
                const StepIcon = step.icon;

                return (
                <div key={step.number} className="ante-step group relative p-6 transition-colors sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-gray-500">{step.number}</span>
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 bg-gray-50 text-gray-700 transition group-hover:-translate-y-0.5 group-hover:border-gray-300 group-hover:bg-white group-hover:text-gray-950">
                      <StepIcon aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-gray-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
                </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 md:pb-24">
          <div className="ante-cta grid gap-10 overflow-hidden rounded-3xl bg-gray-950 px-6 py-10 text-white sm:px-10 lg:grid-cols-[1fr_auto] lg:items-center lg:px-14 lg:py-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">When the game ends</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">One clean settlement. Zero debate.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">Mainpot checks that every chip is accounted for, then reduces the table to the smallest practical set of payments.</p>
            </div>
            <Link href="/create" className={`${linkBaseClasses} bg-white text-gray-950 hover:bg-gray-100`}>Open the table</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
