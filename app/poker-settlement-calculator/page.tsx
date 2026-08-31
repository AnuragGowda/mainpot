import type { Metadata } from "next";
import Link from "next/link";
import HeroGameDemo from "@/components/HeroGameDemo";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import SuitIcon from "@/components/SuitIcon";

export const metadata: Metadata = {
  title: "Poker Settlement Calculator for Home Games",
  description:
    "Track poker buy-ins, rebuys, and cash-outs in one shared ledger, then calculate the smallest practical set of settlement payments.",
  alternates: { canonical: "/poker-settlement-calculator" },
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
  openGraph: {
    title: "Poker Settlement Calculator for Home Games | Mainpot",
    description:
      "Track the bank throughout poker night and settle the table with fewer payments.",
    url: "/poker-settlement-calculator",
  },
  twitter: {
    title: "Poker Settlement Calculator for Home Games | Mainpot",
    description:
      "Track the bank throughout poker night and settle the table with fewer payments.",
  },
};

const steps = [
  {
    number: "01",
    title: "Open the ledger",
    description:
      "Set the buy-in, name the game, and share the room code.",
  },
  {
    number: "02",
    title: "Keep the bank current",
    description:
      "Record purchases during the game, then enter every final stack.",
  },
  {
    number: "03",
    title: "Get the payment list",
    description:
      "Once totals match, Mainpot reduces the tab to as few transfers as possible.",
  },
];

const faqs = [
  {
    question: "How does a poker settlement calculator work?",
    answer:
      "It compares what each player put into the game with what they took out. Players who cashed out less than they put in owe the difference; players who cashed out more receive it. Mainpot then reduces those balances to a practical payment list.",
  },
  {
    question: "What is a poker bank?",
    answer:
      "The bank is the total money collected from buy-ins and rebuys. Before a game can settle, the combined cash-outs must equal that total. Matching the two is how the table catches a missing or incorrect entry.",
  },
  {
    question: "Does Mainpot process payments?",
    answer:
      "No. Mainpot is a shared ledger and settlement calculator. It records the game and lists who should pay whom; players handle the actual transfer however the table prefers.",
  },
];

export default function PokerSettlementCalculatorPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#f7f8f6]">
      <SiteNav />
      <main>
        <section className="relative overflow-hidden px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
          <div aria-hidden="true" className="ante-page-washes absolute inset-0" />
          <div aria-hidden="true" className="ante-page-glow absolute inset-x-0 top-0" />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1fr_0.9fr] lg:gap-16">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-700 shadow-sm backdrop-blur-xl">
                <SuitIcon className="h-3 w-3" suit="spade" />
                Poker settlement calculator
              </p>
              <h1 className="mt-6 max-w-3xl text-5xl font-semibold tracking-[-0.055em] text-gray-950 sm:text-6xl">
                Settle a home poker game with fewer payments.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-600">
                Track the bank as chips change hands. When the game ends, Mainpot checks the totals and shows exactly who pays whom.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/create"
                  className="inline-flex h-12 items-center justify-center rounded-lg bg-gray-950 px-6 text-sm font-semibold text-white shadow-lg shadow-gray-950/10 transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
                >
                  Start a game
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-300 bg-white px-6 text-sm font-semibold text-gray-900 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
                >
                  See how it works
                </a>
              </div>
              <p className="mt-5 text-sm leading-6 text-gray-500">
                Free to use. No account or download needed.
              </p>
            </div>
            <div className="mx-auto w-full max-w-lg lg:max-w-none">
              <HeroGameDemo />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-7 sm:px-8 sm:py-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">How it works</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
                The calculator stays with the game.
              </h2>
            </div>
            <div className="grid divide-y divide-gray-200 md:grid-cols-3 md:divide-x md:divide-y-0">
              {steps.map((step) => (
                <div key={step.number} className="p-6 sm:p-8">
                  <span className="font-mono text-xs font-semibold text-gray-500">{step.number}</span>
                  <h3 className="mt-3 text-lg font-semibold text-gray-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">A quick example</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">
                One table, one balanced bank.
              </h2>
              <p className="mt-4 max-w-md text-base leading-7 text-gray-600">
                If Alex finishes $40 ahead and Ben finishes $40 behind, the final instruction is simple: Ben pays Alex $40. Everyone else is already even.
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 sm:px-6">
                <span>Player</span>
                <span>In</span>
                <span>Out</span>
              </div>
              {[
                ["Alex", "$60", "$100"],
                ["Ben", "$60", "$20"],
                ["Casey", "$40", "$40"],
              ].map(([player, paidIn, cashedOut]) => (
                <div key={player} className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-gray-100 px-5 py-4 text-sm sm:px-6">
                  <span className="font-medium text-gray-950">{player}</span>
                  <span className="tabular-nums text-gray-600">{paidIn}</span>
                  <span className="tabular-nums text-gray-600">{cashedOut}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 bg-gray-950 px-5 py-4 text-sm text-white sm:px-6">
                <span className="font-medium">Final payment</span>
                <span className="font-semibold tabular-nums">Ben → Alex · $40</span>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 pt-8 sm:px-6 md:pb-28">
          <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Poker bank questions</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
                Clear before the last chip leaves the table.
              </h2>
            </div>
            <div className="border-y border-gray-200">
              {faqs.map((faq, index) => (
                <details key={faq.question} className="group border-b border-gray-200 last:border-0" open={index === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-gray-950">
                    {faq.question}
                    <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gray-200 text-gray-500 transition group-open:rotate-45 group-open:border-gray-300 group-open:bg-gray-50">+</span>
                  </summary>
                  <p className="max-w-2xl pb-5 text-sm leading-6 text-gray-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 md:pb-24">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 rounded-3xl bg-gray-950 px-6 py-10 text-white sm:px-10 sm:py-12 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Ready for the next game?</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Create the ledger before the first hand.</h2>
            </div>
            <Link
              href="/create"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-lg bg-white px-6 text-sm font-semibold text-gray-950 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              Start a game
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
