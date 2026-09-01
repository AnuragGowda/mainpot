import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Check,
  CheckCircle2,
  ReceiptText,
  Scale,
  ShieldCheck,
} from "lucide-react";
import SettlementWalkthrough from "@/components/SettlementWalkthrough";
import SettlementCalculator from "@/components/SettlementCalculator";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import SuitIcon from "@/components/SuitIcon";

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
      "It calculates each player’s net result by subtracting their total money in from their final cash-out. It then matches the players who owe money with the players who should receive money and produces a practical payment list.",
  },
  {
    question: "Why do total buy-ins have to equal total cash-outs?",
    answer:
      "The chips on the table represent the money that entered the game. If the two totals differ, an entry may be missing, duplicated, or incorrect. Find the cause first; if the difference is intentional, the table should explicitly decide how it changes the results before creating payments.",
  },
  {
    question: "Do rebuys and add-ons count as buy-ins?",
    answer:
      "Yes. Every chip purchase counts as money in, whether it is the opening buy-in, a later rebuy, or a smaller add-on. All of those purchases must be included before calculating a player’s result.",
  },
  {
    question: "What if one player fronts a rebuy for someone else?",
    answer:
      "The chips still belong to the player receiving them, but the funding note matters at settlement. Mainpot can preserve who supplied the money so the final payment plan does not make the person who fronted the rebuy pay twice.",
  },
  {
    question: "Does Mainpot hold or send the money?",
    answer:
      "No. Mainpot records the game, checks the bank, and shows who should pay whom. Players review the result and make the actual transfers using the payment method their table prefers.",
  },
  {
    question: "Can a game be settled when the bank is still off?",
    answer:
      "Mainpot first asks the table to find the discrepancy. If it is intentional, the host can record an explicit allocation: split it proportionally across the affected winners or losers, or assign it to selected players. The adjusted result and the decision appear in the settlement record.",
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
      <main>
        <section className="relative overflow-hidden border-b border-gray-200 px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
          <div aria-hidden="true" className="ante-page-washes absolute inset-0" />
          <div aria-hidden="true" className="ante-page-glow absolute inset-x-0 top-0" />
          <div aria-hidden="true" className="ante-page-dot-arch absolute inset-x-0 top-0" />
          <div className="relative mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:gap-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-700 shadow-sm backdrop-blur-xl">
                <SuitIcon className="h-3 w-3" suit="spade" />
                Poker settlement guide
              </p>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-[-0.055em] text-gray-950 sm:text-6xl lg:text-7xl">
                From first buy-in to final payment.
              </h1>
              <p className="mt-6 max-w-3xl text-xl leading-9 text-gray-700">
                A home poker settlement is not just a final calculation. It is a chain of records that must agree: every purchase, every final stack, every player’s net result, and every payment.
              </p>
              <p className="mt-4 max-w-3xl text-base leading-8 text-gray-600">
                This guide follows one five-player $0.25/$0.50 game end to end, including a missing entry that leaves the bank $10.00 out of balance. You will see where the error appears, how correcting it changes the results, and how the balanced table becomes a short payment list.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#walkthrough"
                  className="inline-flex h-12 items-center justify-center rounded-lg bg-gray-950 px-6 text-sm font-semibold text-white shadow-lg shadow-gray-950/10 transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
                >
                  Watch the walkthrough
                </a>
                <Link
                  href="/create"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-300 bg-white px-6 text-sm font-semibold text-gray-900 shadow-sm transition hover:border-gray-400 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
                >
                  Start a game
                </Link>
              </div>
            </div>

            <aside className="rounded-3xl border border-gray-200 bg-white/90 p-6 shadow-[0_18px_50px_rgba(17,24,20,0.07)] backdrop-blur-sm sm:p-8">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-gray-950 text-white">
                  <ShieldCheck aria-hidden className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">A correct settlement proves</p>
                  <p className="mt-1 font-semibold text-gray-950">The books close from both directions.</p>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                {[
                  ["The bank balances", "Money in equals final stacks."],
                  ["The results net to zero", "Losses exactly fund the wins."],
                  ["The payments resolve every balance", "Nobody pays or receives too much."],
                ].map(([title, description]) => (
                  <div key={title} className="flex gap-3 border-t border-gray-100 pt-4 first:border-0 first:pt-0">
                    <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-gray-950">{title}</p>
                      <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <SettlementCalculator />

        <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
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

          <article className="min-w-0">
            <section id="overview" className="scroll-mt-24">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">The problem</p>
              <h2 className={`mt-3 ${sectionHeading}`}>Settlement starts long before the last hand.</h2>
              <div className="mt-6 space-y-5">
                <p className={prose}>
                  Poker chips move between players all night, but the bank only cares about two categories of information: how much money each player put in and how much value they had when play stopped. The difference between those two numbers is the player’s result.
                </p>
                <p className={prose}>
                  The difficult part is making sure the inputs are complete. A forgotten rebuy makes the recorded bank too small. A mistyped cash-out changes both the table total and one player’s result. If those mistakes survive into the payment list, the math can look tidy while still being wrong.
                </p>
                <p className={prose}>
                  Mainpot keeps the ledger attached to the game so the host can verify purchases as they happen, players can enter their final stacks, and the table can resolve any mismatch before money moves between people.
                </p>
              </div>

              <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200 sm:grid-cols-3">
                {[
                  ["1", "Balance the bank", "Total money in must equal total final stacks."],
                  ["2", "Calculate results", "Cash-out minus money in gives each player’s net."],
                  ["3", "Route payments", "Debtors pay creditors until every net reaches zero."],
                ].map(([number, title, description]) => (
                  <div key={number} className="bg-white p-5 sm:p-6">
                    <span className="font-mono text-xs font-semibold text-gray-400">0{number}</span>
                    <h3 className="mt-3 font-semibold text-gray-950">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="walkthrough" className="mt-16 scroll-mt-24 border-t border-gray-200 pt-16 sm:mt-20 sm:pt-20">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Animated walkthrough</p>
              <h2 className={`mt-3 ${sectionHeading}`}>Watch one ledger move through all four states.</h2>
              <p className={`mt-5 ${prose}`}>
                The same five-player example appears throughout this guide. The animation begins with the recorded purchases, moves to the final stacks, stops at the mismatch, and then shows the corrected settlement.
              </p>
              <div className="mt-8">
                <SettlementWalkthrough />
              </div>
            </section>

            <section id="example" className="mt-16 scroll-mt-24 border-t border-gray-200 pt-16 sm:mt-20 sm:pt-20">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Five-player example</p>
              <h2 className={`mt-3 ${sectionHeading}`}>A missing add-on puts the game $10.00 out of balance.</h2>
              <div className="mt-6 space-y-5">
                <p className={prose}>
                  The game runs with $0.25/$0.50 blinds and a $40 opening buy-in. Alex and Sam each rebuy once. Jordan adds another $20, and Casey takes an additional $10 in chips. Casey’s add-on never reaches the ledger, so the recorded bank shows $300.00 even though $310.00 in chips are in circulation.
                </p>
                <p className={prose}>
                  When the last hand ends, stacks such as $18.75 and $132.25 are normal for these stakes. Together, the five cash-outs total $310.00. The cents are not a rounding problem; the unexplained $10.00 gap is evidence that one side of the ledger is incomplete.
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
                  <div className="p-4 sm:p-5">
                    <p className="text-xs text-amber-800/70">Money in</p>
                    <p className="mt-1 text-xl font-semibold text-amber-950">$300.00</p>
                  </div>
                  <div className="p-4 sm:p-5">
                    <p className="text-xs text-amber-800/70">Stacks out</p>
                    <p className="mt-1 text-xl font-semibold text-amber-950">$310.00</p>
                  </div>
                  <div className="p-4 sm:p-5">
                    <p className="text-xs text-amber-800/70">Difference</p>
                    <p className="mt-1 text-xl font-semibold text-red-700">−$10.00</p>
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
                      Casey’s total money in changes from $40.00 to $50.00. The bank becomes $310.00, which now matches the $310.00 in final stacks. That correction also changes Casey’s loss from $40.00 to $50.00.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                  <caption className="border-b border-gray-200 px-5 py-4 text-left sm:px-6">
                    <span className="block font-semibold text-gray-950">Corrected game ledger</span>
                    <span className="mt-1 block text-sm font-normal text-gray-500">Cash-out minus total in equals the player’s net result.</span>
                  </caption>
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
            </section>

            <section id="net-results" className="mt-16 scroll-mt-24 border-t border-gray-200 pt-16 sm:mt-20 sm:pt-20">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Calculate each result</p>
              <h2 className={`mt-3 ${sectionHeading}`}>Every player gets one net number.</h2>
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
                  The positive results are Morgan at $92.25 and Jordan at $40.50, for $132.75 total. The negative results are Alex at $61.25, Sam at $21.50, and Casey at $50.00, also $132.75 total. That equality is the second reconciliation check: all player results must add up to zero.
                </p>
                <p className={prose}>
                  Notice why the missing add-on had to be fixed first. Without it, Casey would appear to lose only $40.00, the negative results would total $122.75, and the table would be unable to fund the full $132.75 owed to the winners.
                </p>
              </div>
            </section>

            <section id="payments" className="mt-16 scroll-mt-24 border-t border-gray-200 pt-16 sm:mt-20 sm:pt-20">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Build the payment list</p>
              <h2 className={`mt-3 ${sectionHeading}`}>Move $132.75 without replaying every exchange.</h2>
              <div className="mt-6 space-y-5">
                <p className={prose}>
                  A settlement does not reverse individual hands or remember who won chips from whom. It works from the final net positions. The three players with negative results fund the two players with positive results until every balance reaches zero.
                </p>
                <p className={prose}>
                  For this particular set of balances, four payments are required. Casey must split the $50.00 loss because Morgan still needs $9.50 after receiving Alex’s and Sam’s payments, while Jordan needs $40.50.
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

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Before payments</p>
                  <p className="mt-3 text-2xl font-semibold text-gray-950">Five open balances</p>
                  <p className="mt-2 text-sm leading-6 text-gray-600">Two players must receive $132.75. Three players owe $132.75.</p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">After payments</p>
                  <p className="mt-3 text-2xl font-semibold text-emerald-950">Every balance is $0.00</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-900/70">The full $132.75 has moved once, with no extra round trips.</p>
                </div>
              </div>
            </section>

            <section id="edge-cases" className="mt-16 scroll-mt-24 border-t border-gray-200 pt-16 sm:mt-20 sm:pt-20">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Special cases</p>
              <h2 className={`mt-3 ${sectionHeading}`}>The details that usually break spreadsheet settlement.</h2>
              <p className={`mt-5 ${prose}`}>
                Most home games are simple until one exception appears. These are the moments where a shared, timestamped ledger is more useful than a final total typed into a group chat.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  { title: "A rebuy was fronted", body: "Record both the player receiving the chips and the player who supplied the cash. Chip ownership and funding are different facts, and settlement needs both.", icon: ReceiptText },
                  { title: "One cash-out is missing", body: "Do not treat a blank as zero unless the player actually busted. A missing final stack keeps the table from proving that the bank balances.", icon: AlertTriangle },
                  { title: "The host acts as the bank", body: "A bank-style settlement can route every payment through one person. It is easier to coordinate, but may create more transfers than direct netting.", icon: Scale },
                  { title: "The totals differ by cents", body: "Use the same currency precision for purchases, cash-outs, and payments. Fix the source entry instead of hiding a rounding difference in the final list.", icon: Calculator },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gray-100 text-gray-700">
                        <Icon aria-hidden className="h-4 w-4" />
                      </span>
                      <h3 className="mt-4 text-lg font-semibold text-gray-950">{item.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-gray-600">{item.body}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section id="faq" className="mt-16 scroll-mt-24 border-t border-gray-200 pt-16 sm:mt-20 sm:pt-20">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Questions</p>
              <h2 className={`mt-3 ${sectionHeading}`}>Poker settlement, without the shorthand.</h2>
              <div className="mt-8 border-y border-gray-200">
                {faqs.map((faq, index) => (
                  <details key={faq.question} className="group border-b border-gray-200 last:border-0" open={index === 0}>
                    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-semibold text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">
                      {faq.question}
                      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gray-200 text-gray-500 transition group-open:rotate-45 group-open:border-gray-300 group-open:bg-white">+</span>
                    </summary>
                    <p className="max-w-3xl pb-6 text-sm leading-7 text-gray-600">{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>

            <section className="mt-16 overflow-hidden rounded-3xl bg-gray-950 px-6 py-10 text-white sm:mt-20 sm:px-10 sm:py-12">
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
