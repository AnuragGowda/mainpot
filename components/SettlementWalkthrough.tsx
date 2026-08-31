"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
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
    eyebrow: "During the game",
    title: "The table records $300 in buy-ins.",
    description:
      "Every purchase is attached to a player, so the running bank is visible before anyone starts counting final stacks.",
    metricLabel: "Recorded bank",
    metricValue: "$300",
    icon: ReceiptText,
    rows: [
      ["Alex", "$80 in"],
      ["Morgan", "$40 in"],
      ["Sam", "$80 in"],
      ["Jordan", "$60 in"],
      ["Casey", "$40 in"],
    ],
  },
  {
    id: "cash-outs",
    shortLabel: "Cash out",
    eyebrow: "At the last hand",
    title: "Final stacks add up to $310.",
    description:
      "Mainpot compares the money out with the recorded bank before it creates a payment list.",
    metricLabel: "Mismatch",
    metricValue: "$10 over",
    icon: CircleDollarSign,
    rows: [
      ["Alex", "$20 out"],
      ["Morgan", "$130 out"],
      ["Sam", "$60 out"],
      ["Jordan", "$100 out"],
      ["Casey", "$0 out"],
    ],
  },
  {
    id: "reconcile",
    shortLabel: "Reconcile",
    eyebrow: "Before settlement",
    title: "The table finds a missing $10 add-on.",
    description:
      "Casey bought ten dollars more in chips than the ledger showed. Adding that entry brings both sides to $310.",
    metricLabel: "Bank status",
    metricValue: "Balanced",
    icon: Scale,
    rows: [
      ["Recorded buy-ins", "$300"],
      ["Casey add-on", "+$10"],
      ["Corrected bank", "$310"],
      ["Final stacks", "$310"],
    ],
  },
  {
    id: "payments",
    shortLabel: "Settle",
    eyebrow: "When the books match",
    title: "Five results become four payments.",
    description:
      "Mainpot nets each player once, then routes money from the losing stacks to the winning stacks.",
    metricLabel: "Players square",
    metricValue: "5 of 5",
    icon: CheckCircle2,
    rows: [
      ["Alex → Morgan", "$60"],
      ["Sam → Morgan", "$20"],
      ["Casey → Morgan", "$10"],
      ["Casey → Jordan", "$40"],
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
    }, 3800);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  const active = stages[activeIndex];
  const Icon = active.icon;

  return (
    <div className="overflow-hidden rounded-3xl border border-gray-800 bg-[#0b0c0e] text-white shadow-2xl shadow-gray-950/15">
      <div className="border-b border-white/10 px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Example table · five players
            </p>
            <p className="mt-1 text-sm font-medium text-gray-200">
              Watch the ledger move from chips to payments.
            </p>
          </div>
          {!reducedMotion ? (
            <button
              type="button"
              onClick={() => setPaused((current) => !current)}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-gray-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label={paused ? "Play walkthrough" : "Pause walkthrough"}
            >
              {paused ? <Play aria-hidden className="h-4 w-4" /> : <Pause aria-hidden className="h-4 w-4" />}
            </button>
          ) : null}
        </div>

        <div
          role="tablist"
          aria-label="Settlement walkthrough"
          className="mt-4 grid grid-cols-4 gap-1.5"
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
              className={`min-h-11 rounded-lg px-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:px-3 sm:text-xs ${
                activeIndex === index
                  ? "bg-white text-gray-950"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="hidden sm:inline">{index + 1}. </span>{stage.shortLabel}
            </button>
          ))}
        </div>
      </div>

      <div
        key={active.id}
        id={`walkthrough-panel-${active.id}`}
        role="tabpanel"
        aria-labelledby={`walkthrough-tab-${active.id}`}
        className="ante-walkthrough-panel grid gap-5 p-4 sm:p-6 lg:grid-cols-[1fr_0.9fr] lg:gap-6"
      >
        <div className="flex flex-col">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-emerald-300">
            <Icon aria-hidden className="h-5 w-5" />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{active.eyebrow}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{active.title}</h3>
          <p className="mt-3 text-sm leading-6 text-gray-400">{active.description}</p>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs text-gray-500">{active.metricLabel}</p>
            <p className={`mt-1 text-xl font-semibold ${active.id === "cash-outs" ? "text-amber-300" : "text-emerald-300"}`}>
              {active.metricValue}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-[#f4f6f3] text-gray-950">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
            <span>{active.id === "payments" ? "Payment" : "Entry"}</span>
            <span>{active.id === "payments" ? "Amount" : "Value"}</span>
          </div>
          <div className="divide-y divide-gray-200/80">
            {active.rows.map(([label, value]) => (
              <div key={label} className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="font-medium">{label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{value}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-gray-200 bg-white px-4 py-3 text-xs font-medium text-gray-600">
            <span>{active.shortLabel}</span>
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            <span>{activeIndex === stages.length - 1 ? "Table settled" : stages[activeIndex + 1].shortLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
