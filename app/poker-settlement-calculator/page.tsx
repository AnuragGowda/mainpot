import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  ReceiptText,
  Scale,
} from "lucide-react";
import SettlementWalkthrough from "@/components/SettlementWalkthrough";
import SettlementCalculator from "@/components/SettlementCalculator";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "Poker Settlement Calculator for Home Games",
  description:
    "Learn how to track poker buy-ins, reconcile cash-outs, calculate player results, and settle a home game with a clear payment list.",
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
      "A step-by-step guide to balancing the poker bank and turning player results into a practical payment list.",
    url: "/poker-settlement-calculator",
  },
  twitter: {
    title: "Poker Settlement Calculator for Home Games | Mainpot",
    description:
      "A step-by-step guide to balancing the poker bank and turning player results into a practical payment list.",
  },
};

const navigation = [
  ["The problem", "overview"],
  ["Animated walkthrough", "walkthrough"],
  ["Five-player example", "example"],
  ["Calculate each result", "net-results"],
  ["Build the payment list", "payments"],
  ["Special cases", "edge-cases"],
  ["Questions", "faq"],
] as const;

const exampleRows = [
  { player: "Alex", purchases: "$40 + $40", totalIn: "$80.00", cashOut: "$18.75", net: "−$61.25", tone: "text-red-700" },
  { player: "Morgan", purchases: "$40", totalIn: "$40.00", cashOut: "$132.25", net: "+$92.25", tone: "text-emerald-700" },
  { player: "Sam", purchases: "$40 + $40", totalIn: "$80.00", cashOut: "$58.50", net: "−$21.50", tone: "text-red-700" },
  { player: "Jordan", purchases: "$40 + $20", totalIn: "$60.00", cashOut: "$100.50", net: "+$40.50", tone: "text-emerald-700" },
  { player: "Casey", purchases: "$40 + $10", totalIn: "$50.00", cashOut: "$0.00", net: "−$50.00", tone: "text-red-700" },
] as const;

const payments = [
  { from: "Alex", to: "Morgan", amount: "$61.25", note: "Alex’s full loss" },
  { from: "Sam", to: "Morgan", amount: "$21.50", note: "Sam’s full loss" },
  { from: "Casey", to: "Morgan", amount: "$9.50", note: "Finishes Morgan’s $92.25 win" },
  { from: "Casey", to: "Jordan", amount: "$40.50", note: "Finishes Jordan’s $40.50 win" },
] as const;

const faqs = [
  {
    question: "What does a poker settlement calculator calculate?",
    answer:
      "It subtracts each player’s total money in from their final cash-out, then matches players who owe with players who should receive.",
  },
  {
    question: "Why do total buy-ins have to equal total cash-outs?",
    answer:
      "The chips represent the money that entered the game. A difference usually means an entry is missing, duplicated, or incorrect. Find the cause before creating payments.",
  },
  {
    question: "Do rebuys and add-ons count as buy-ins?",
    answer:
      "Yes. Count every chip purchase, including the opening buy-in, rebuys, and add-ons, before calculating results.",
  },
  {
    question: "What if one player fronts a rebuy for someone else?",
    answer:
      "Record an advance only if the payer is still owed. If they were already repaid, record a normal rebuy. A private chip sale does not add money to the bank.",
  },
  {
    question: "Does Mainpot hold or send the money?",
    answer:
      "No. Mainpot records the game, checks the bank, and shows who should pay whom. Players make the actual transfers with their preferred method.",
  },
  {
    question: "Can a game be settled when the bank is still off?",
    answer:
      "First find the discrepancy. If it is intentional, the host can apply a proportional, selected-player, or exact agreed adjustment, which stays in the settlement record.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      headline: "Poker Settlement Calculator for Home Games",
      description:
        "A step-by-step guide to recording buy-ins, reconciling the bank, calculating net results, and settling a home poker game.",
      mainEntityOfPage: "https://mainpot.app/poker-settlement-calculator",
      author: { "@type": "Organization", name: "Mainpot contributors" },
      publisher: { "@type": "Organization", name: "Mainpot" },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ],
};

const sectionHeading =
  "text-3xl font-semibold tracking-[-0.035em] text-gray-950 sm:text-4xl";
const prose = "text-base leading-8 text-gray-600";

export default function PokerSettlementCalculatorPage() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#f7f8f6]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SiteNav />
      <main tabIndex={-1} id="main-content">
        <section className="border-b border-gray-300 bg-[#f7f8f6] px-4 py-10 sm:px-6 sm:py-20">
          <div className="mx-auto w-full max-w-6xl">
            <h1 className="mt-4 max-w-5xl text-4xl font-semibold tracking-[-0.055em] text-gray-950 sm:mt-5 sm:text-6xl lg:text-7xl">
              Poker settlement calculator
            </h1>
            <div className="mt-8 grid gap-8 border-t border-gray-300 pt-7 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <p className="max-w-3xl text-base leading-7 text-gray-700 sm:text-xl sm:leading-9">
                Enter each player&apos;s money in and final stack. Mainpot checks
                the bank and turns the results into a clear payment list.
              </p>
              <p className="hidden text-sm leading-7 text-gray-600 sm:block">
                Follow a five-player example from buy-in to final payment.
              </p>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#calculator"
                className="inline-flex h-12 items-center justify-center rounded-lg bg-gray-950 px-6 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
              >
                <span className="sm:hidden">Jump to calculator ↓</span>
                <span className="hidden sm:inline">Use the calculator</span>
              </a>
              <Link
                href="/create"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-300 bg-white px-6 text-sm font-semibold text-gray-900 transition hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
              >
                Track a live game
              </Link>
            </div>
          </div>
        </section>

        <SettlementCalculator />

        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 md:py-16 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-28">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">On this page</p>
              <ol className="mt-4 border-l border-gray-300">
                {navigation.map(([label, id], index) => (
                  <li key={id}>
                    <a href={`#${id}`} className="group flex gap-3 border-l-2 border-transparent py-2.5 pl-4 text-sm text-gray-500 transition hover:border-gray-950 hover:text-gray-950">
                      <span className="font-mono text-xs text-gray-400">{String(index + 1).padStart(2, "0")}</span>
                      <span>{label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <details className="group lg:hidden">
            <summary className="flex cursor-pointer items-center justify-between border-y border-gray-200 py-3 text-sm font-semibold text-gray-950">
              On this page
              <span aria-hidden className="text-lg text-gray-500 transition group-open:rotate-45">+</span>
            </summary>
            <nav aria-label="On this page" className="border-b border-gray-200 py-2">
              <ol className="grid grid-cols-2 gap-x-4 gap-y-1 pb-2">
                {navigation.map(([label, id]) => (
                  <li key={id}>
                    <a href={`#${id}`} className="block py-2 text-sm text-gray-600 hover:text-gray-950">{label}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </details>

          <article className="min-w-0">
            <section id="overview" className="scroll-mt-24">
              <h2 className={sectionHeading}>Balance the bank before settling.</h2>
              <div className="mt-6 space-y-5">
                <p className={prose}>
                  The bank needs two numbers per player: money in and final cash-out. Their difference is the player&apos;s result.
                </p>
                <p className={prose}>
                  Check every rebuy and cash-out before money moves. Mainpot keeps those entries with the game so the table can resolve a mismatch first.
                </p>
              </div>

              <ol className="mt-6 space-y-3 text-sm leading-6 text-gray-600">
                <li><strong className="text-gray-950">1. Balance the bank.</strong> Total money in must equal total final stacks.</li>
                <li><strong className="text-gray-950">2. Calculate results.</strong> Cash-out minus money in gives each player’s net.</li>
                <li><strong className="text-gray-950">3. Route payments.</strong> Players who owe pay those who are owed.</li>
              </ol>
            </section>

            <section id="walkthrough" className="mt-12 scroll-mt-24 border-t border-gray-200 pt-12 sm:mt-16 sm:pt-16">
              <h2 className={sectionHeading}>See the ledger move from input to settlement.</h2>
              <p className={`mt-5 ${prose}`}>
                This five-player example starts with purchases, finds the mismatch, and ends with a corrected settlement.
              </p>
              <div className="mt-8">
                <SettlementWalkthrough />
              </div>
            </section>

            <section id="example" className="mt-12 scroll-mt-24 border-t border-gray-200 pt-12 sm:mt-16 sm:pt-16">
              <h2 className={sectionHeading}>A missing add-on creates a $10.00 mismatch.</h2>
              <div className="mt-6 space-y-5">
                <p className={prose}>
                  In this $0.25/$0.50 game, Alex and Sam rebuy, Jordan adds $20, and Casey adds $10. Casey&apos;s add-on is missing, so the ledger shows $300.00 while $310.00 is in play.
                </p>
                <p className={prose}>
                  The five final stacks total $310.00. The $10.00 gap is an incomplete entry, not a rounding problem.
                </p>
              </div>

              <div className="mt-8 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50">
                <div className="flex gap-3 border-b border-amber-200 px-5 py-4 sm:px-6">
                  <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <h3 className="font-semibold text-amber-950">The calculator should stop here.</h3>
                    <p className="mt-1 text-sm leading-6 text-amber-900/75">
                      Recorded buy-ins are $300.00. Final stacks are $310.00. The table needs to find the missing $10.00 before calculating payments.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 divide-x divide-amber-200 bg-white/55">
                  <div className="min-w-0 px-2 py-3 sm:p-5">
                    <p className="text-xs text-amber-800/70">Money in</p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-amber-950 sm:text-xl">$300.00</p>
                  </div>
                  <div className="min-w-0 px-2 py-3 sm:p-5">
                    <p className="text-xs text-amber-800/70">Stacks out</p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-amber-950 sm:text-xl">$310.00</p>
                  </div>
                  <div className="min-w-0 px-2 py-3 sm:p-5">
                    <p className="text-xs text-amber-800/70">Difference</p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-red-700 sm:text-xl">−$10.00</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 sm:p-7">
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                    <ReceiptText aria-hidden className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Correction</p>
                    <h3 className="mt-1 text-xl font-semibold tracking-tight text-gray-950">Add Casey’s missing $10.00 purchase.</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      Add the omitted $10 to Casey’s buy-ins. Both table totals become $310, and Casey’s net result becomes −$50.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
                  <h3 className="text-sm font-semibold text-gray-950">Corrected game ledger</h3>
                  <p className="mt-1 text-xs text-gray-500 md:hidden">Scroll sideways to see cash-outs and net results →</p>
                </div>
                <div role="region" aria-label="Corrected game ledger" tabIndex={0} className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-950">
                <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                  <caption className="sr-only">Corrected game ledger: buy-ins, cash-outs, and net results</caption>
                  <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                    <tr>
                      <th scope="col" className="px-5 py-3 sm:px-6">Player</th>
                      <th scope="col" className="px-4 py-3">Purchases</th>
                      <th scope="col" className="px-4 py-3 text-right">Total in</th>
                      <th scope="col" className="px-4 py-3 text-right">Cash-out</th>
                      <th scope="col" className="px-5 py-3 text-right sm:px-6">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {exampleRows.map((row) => (
                      <tr key={row.player}>
                        <th scope="row" className="px-5 py-4 font-semibold text-gray-950 sm:px-6">{row.player}</th>
                        <td className="px-4 py-4 text-gray-600">{row.purchases}</td>
                        <td className="px-4 py-4 text-right tabular-nums text-gray-700">{row.totalIn}</td>
                        <td className="px-4 py-4 text-right tabular-nums text-gray-700">{row.cashOut}</td>
                        <td className={`px-5 py-4 text-right font-semibold tabular-nums sm:px-6 ${row.tone}`}>{row.net}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-gray-200 bg-gray-950 font-semibold text-white">
                    <tr>
                      <th scope="row" className="px-5 py-4 sm:px-6">Totals</th>
                      <td className="px-4 py-4 text-gray-400">Balanced</td>
                      <td className="px-4 py-4 text-right tabular-nums">$310.00</td>
                      <td className="px-4 py-4 text-right tabular-nums">$310.00</td>
                      <td className="px-5 py-4 text-right tabular-nums text-emerald-300 sm:px-6">$0.00</td>
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            </section>

            <section id="net-results" className="mt-12 scroll-mt-24 border-t border-gray-200 pt-12 sm:mt-16 sm:pt-16">
              <h2 className={sectionHeading}>Calculate each player&apos;s net result.</h2>
              <p className={`mt-5 ${prose}`}>
                The basic calculation is the same for every player. A positive result means the player should receive money. A negative result means the player owes money. A zero means the player is already square.
              </p>

              <div className="mt-8 rounded-2xl bg-gray-950 p-6 text-white sm:p-8">
                <div className="flex items-center gap-3 text-gray-400">
                  <Calculator aria-hidden className="h-5 w-5" />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">Settlement formula</p>
                </div>
                <p className="mt-5 font-mono text-xl font-semibold sm:text-2xl">
                  player net = final cash-out − total money in
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-gray-400">Morgan</p>
                    <p className="mt-2 font-mono text-lg">$132.25 − $40.00 = <span className="text-emerald-300">+$92.25</span></p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-gray-400">Casey</p>
                    <p className="mt-2 font-mono text-lg">$0.00 − $50.00 = <span className="text-red-300">−$50.00</span></p>
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-5">
                <p className={prose}>
                Morgan and Jordan receive $132.75 total. Alex, Sam, and Casey owe the same $132.75. All player results therefore add up to zero.
                </p>
                <p className={prose}>
                  Without Casey&apos;s missing add-on, the losses total only $122.75 and cannot fund the winners&apos; $132.75.
                </p>
              </div>
            </section>

            <section id="payments" className="mt-12 scroll-mt-24 border-t border-gray-200 pt-12 sm:mt-16 sm:pt-16">
              <h2 className={sectionHeading}>Turn those balances into payments.</h2>
              <div className="mt-6 space-y-5">
                <p className={prose}>
                  Settlement uses final net positions, not individual hands. Players who owe fund players who should receive until every balance reaches zero.
                </p>
                <p className={prose}>
                  Four payments settle this example: Casey splits the remaining $50.00 between Morgan and Jordan.
                </p>
              </div>

              <ol className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                {payments.map((payment, index) => (
                  <li key={`${payment.from}-${payment.to}`} className="grid gap-4 border-b border-gray-100 p-5 last:border-0 sm:grid-cols-[2.5rem_1fr_auto] sm:items-center sm:px-6">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-gray-100 font-mono text-xs font-semibold text-gray-500">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-950">
                        <span>{payment.from}</span>
                        <ArrowRight aria-hidden className="h-4 w-4 text-gray-400" />
                        <span>{payment.to}</span>
                      </p>
                      <p className="mt-1 text-sm text-gray-500">{payment.note}</p>
                    </div>
                    <span className="text-xl font-semibold tabular-nums text-gray-950">{payment.amount}</span>
                  </li>
                ))}
              </ol>

              <p className={`mt-5 ${prose}`}>After these four payments, all five balances are zero.</p>
            </section>

            <section id="edge-cases" className="mt-12 scroll-mt-24 border-t border-gray-200 pt-12 sm:mt-16 sm:pt-16">
              <h2 className={sectionHeading}>Special cases</h2>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  { title: "A buy-in was advanced", body: "Record the player receiving the bank chips and, only while repayment is outstanding, the player who advanced the cash. Mark it repaid if they settle during the game.", icon: ReceiptText },
                  { title: "One cash-out is missing", body: "Do not treat a blank as zero unless the player actually busted. A missing final stack keeps the table from proving that the bank balances.", icon: AlertTriangle },
                  { title: "The host acts as the bank", body: "A bank-style settlement can route every payment through one person. It is easier to coordinate, but may create more transfers than direct netting.", icon: Scale },
                  { title: "The totals differ by cents", body: "Use the same currency precision for purchases, cash-outs, and payments. Fix the source entry instead of hiding a rounding difference in the final list.", icon: Calculator },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                      <div className="flex items-center gap-3 sm:block">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-700">
                          <Icon aria-hidden className="h-4 w-4" />
                        </span>
                        <h3 className="text-lg font-semibold text-gray-950 sm:mt-4">{item.title}</h3>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-gray-600">{item.body}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section id="faq" className="mt-12 scroll-mt-24 border-t border-gray-200 pt-12 sm:mt-16 sm:pt-16">
              <h2 className={sectionHeading}>Poker settlement questions.</h2>
              <div className="mt-8 border-y border-gray-200">
                {faqs.map((faq, index) => (
                  <details key={faq.question} className="group border-b border-gray-200 last:border-0" open={index === 0}>
                    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">
                      <span className="min-w-0 flex-1">{faq.question}</span>
                      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gray-200 text-gray-500 transition group-open:border-gray-300 group-open:bg-white"><span className="transition group-open:rotate-45">+</span></span>
                    </summary>
                    <p className="max-w-3xl pb-6 text-sm leading-7 text-gray-600">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="mt-12 overflow-hidden rounded-3xl bg-gray-950 px-6 py-8 text-white sm:mt-16 sm:px-10 sm:py-10">
              <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 aria-hidden className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]">Ready for the next table</p>
                  </div>
                  <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                    Record the game once. Settle from facts.
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-gray-400">
                    Create a room, share the code, and let the table keep one ledger from the opening buy-in through the final payment.
                  </p>
                </div>
                <Link
                  href="/create"
                  className="inline-flex h-12 shrink-0 items-center justify-center rounded-lg bg-white px-6 text-sm font-semibold text-gray-950 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                >
                  Start a game
                </Link>
              </div>
            </section>
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
