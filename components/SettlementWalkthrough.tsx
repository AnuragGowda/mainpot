"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleDollarSign,
  Pause,
  Play,
  ReceiptText,
  Scale,
} from "lucide-react";

const stages = [
  {
    id: "buy-ins",
    shortLabel: "Record",
    eyebrow: "Live ledger",
    title: "Every chip purchase creates an entry.",
    description:
      "The opening buy-ins, rebuys, and add-ons stay attached to the players who received the chips. Before cash-out, the approved ledger shows $300.00 in the bank.",
    metricLabel: "Recorded bank",
    metricValue: "$300.00",
    metricNote: "Seven approved purchases",
    icon: ReceiptText,
    rows: [
      ["Alex", "$80.00 in"],
      ["Morgan", "$40.00 in"],
      ["Sam", "$80.00 in"],
      ["Jordan", "$60.00 in"],
      ["Casey", "$40.00 in"],
    ],
  },
  {
    id: "cash-outs",
    shortLabel: "Cash out",
    eyebrow: "Last hand",
    title: "The final stacks total $310.00.",
    description:
      "At $0.25/$0.50 stakes, chip stacks rarely land on round dollars. The cents are expected; the unexplained $10.00 difference is not.",
    metricLabel: "Reconciliation gap",
    metricValue: "$10.00 over",
    metricNote: "Cash-outs exceed recorded buy-ins",
    icon: CircleDollarSign,
    rows: [
      ["Alex", "$18.75 out"],
      ["Morgan", "$132.25 out"],
      ["Sam", "$58.50 out"],
      ["Jordan", "$100.50 out"],
      ["Casey", "$0.00 out"],
    ],
  },
  {
    id: "reconcile",
    shortLabel: "Reconcile",
    eyebrow: "Ledger review",
    title: "One missing add-on explains the gap.",
    description:
      "Casey remembers taking another $10.00 in chips. The host adds that purchase to the source ledger instead of hiding the difference in a payment.",
    metricLabel: "Reconciliation",
    metricValue: "$310.00 = $310.00",
    metricNote: "Money in now matches chips out",
    icon: Scale,
    rows: [
      ["Recorded buy-ins", "$300.00"],
      ["Casey add-on", "+$10.00"],
      ["Corrected bank", "$310.00"],
      ["Final stacks", "$310.00"],
    ],
  },
  {
    id: "payments",
    shortLabel: "Settle",
    eyebrow: "Final settlement",
    title: "Five net results become four payments.",
    description:
      "Mainpot matches the three losing balances with the two winning balances. Once these transfers are made, every player is square.",
    metricLabel: "After payments",
    metricValue: "0 open balances",
    metricNote: "$132.75 routed between players",
    icon: Check,
    rows: [
      ["Alex → Morgan", "$61.25"],
      ["Sam → Morgan", "$21.50"],
      ["Casey → Morgan", "$9.50"],
      ["Casey → Jordan", "$40.50"],
    ],
  },
] as const;

export default function SettlementWalkthrough() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % stages.length);
    }, 4800);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  const active = stages[activeIndex];
  const Icon = active.icon;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-[0_18px_45px_rgba(17,24,20,0.08)]">
      <header className="bg-[#111512] px-4 py-4 text-white sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400" />
              <p className="truncate text-sm font-semibold">The Basement Game</p>
            </div>
            <p className="mt-1 text-xs text-gray-400">Friday · settlement review</p>
          </div>
          {!reducedMotion ? (
            <button
              type="button"
              onClick={() => setPaused((current) => !current)}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold text-gray-300 transition hover:border-white/25 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={paused ? "Play settlement walkthrough" : "Pause settlement walkthrough"}
            >
              {paused ? <Play aria-hidden className="h-3.5 w-3.5" /> : <Pause aria-hidden className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{paused ? "Resume" : "Pause"}</span>
            </button>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-3">
          {[
            ["Stakes", "$0.25 / $0.50"],
            ["Buy-in", "$40.00"],
            ["Players", "5"],
          ].map(([label, value]) => (
            <div key={label} className="px-3 first:pl-0 last:pr-0 sm:px-5">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">{label}</dt>
              <dd className="mt-1 text-xs font-semibold tabular-nums text-gray-100 sm:text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div
        role="tablist"
        aria-label="Settlement walkthrough"
        className="grid grid-cols-4 border-b border-gray-200 bg-white px-2 sm:px-4"
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction = event.key === "ArrowRight" ? 1 : -1;
          const nextIndex = (activeIndex + direction + stages.length) % stages.length;
          setActiveIndex(nextIndex);
          setPaused(true);
          document.getElementById(`walkthrough-tab-${stages[nextIndex].id}`)?.focus();
        }}
      >
        {stages.map((stage, index) => (
          <button
            key={stage.id}
            type="button"
            role="tab"
            id={`walkthrough-tab-${stage.id}`}
            aria-selected={activeIndex === index}
            aria-controls={`walkthrough-panel-${stage.id}`}
            tabIndex={activeIndex === index ? 0 : -1}
            onClick={() => {
              setActiveIndex(index);
              setPaused(true);
            }}
            className={`relative min-h-14 px-1 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-950 sm:min-h-16 sm:text-xs ${
              activeIndex === index ? "text-gray-950" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <span className="mr-1 hidden font-mono text-[10px] text-gray-400 sm:inline">0{index + 1}</span>
            {stage.shortLabel}
            <span
              aria-hidden
              className={`absolute inset-x-1 bottom-0 h-0.5 transition-colors ${
                activeIndex === index ? "bg-gray-950" : "bg-transparent"
              }`}
            />
          </button>
        ))}
      </div>

      <div
        key={active.id}
        id={`walkthrough-panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={`walkthrough-tab-${active.id}`}
        className="ante-walkthrough-panel grid gap-6 bg-[#f3f5f2] p-4 sm:p-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8 lg:p-8"
      >
        <div className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-gray-500">
              <Icon aria-hidden className="h-4 w-4" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">{active.eyebrow}</p>
            </div>
            <h3 className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-gray-950">{active.title}</h3>
            <p className="mt-3 text-sm leading-7 text-gray-600">{active.description}</p>
          </div>

          <dl className="mt-6 border-t border-gray-300 pt-4">
            <dt className="text-xs font-medium text-gray-500">{active.metricLabel}</dt>
            <dd className={`mt-1 text-xl font-semibold tabular-nums ${active.id === "cash-outs" ? "text-amber-700" : "text-gray-950"}`}>
              {active.metricValue}
            </dd>
            <dd className="mt-1 text-xs leading-5 text-gray-500">{active.metricNote}</dd>
          </dl>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            <span>{active.id === "payments" ? "Payment route" : "Ledger entry"}</span>
            <span>{active.id === "payments" ? "Send" : "Amount"}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {active.rows.map(([label, value]) => (
              <div key={label} className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="font-medium text-gray-800">{label}</span>
                <span className="shrink-0 font-semibold tabular-nums text-gray-950">{value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs">
            <span className="font-medium text-gray-500">Step {activeIndex + 1} of {stages.length}</span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-gray-700">
              {activeIndex === stages.length - 1 ? "All balances closed" : stages[activeIndex + 1].shortLabel}
              {activeIndex === stages.length - 1 ? (
                <Check aria-hidden className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
