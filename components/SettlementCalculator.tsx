"use client";

import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { formatCurrency, formatSignedNet, round2 } from "@/lib/format";
import { calculateMinTransfers } from "@/lib/settlement";

type CalculatorPlayer = {
  id: number;
  name: string;
  moneyIn: string;
  stacksOut: string;
};

const initialPlayers: CalculatorPlayer[] = [
  { id: 1, name: "Alex", moneyIn: "80", stacksOut: "18.75" },
  { id: 2, name: "Morgan", moneyIn: "40", stacksOut: "132.25" },
  { id: 3, name: "Sam", moneyIn: "80", stacksOut: "58.50" },
  { id: 4, name: "Jordan", moneyIn: "60", stacksOut: "100.50" },
  { id: 5, name: "Casey", moneyIn: "50", stacksOut: "0" },
];

function amount(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? round2(parsed) : 0;
}

export default function SettlementCalculator() {
  const [players, setPlayers] = useState(initialPlayers);

  const result = useMemo(() => {
    const rows = players.map((player, index) => ({
      ...player,
      name: player.name.trim() || `Player ${index + 1}`,
      moneyIn: amount(player.moneyIn),
      stacksOut: amount(player.stacksOut),
    }));
    const totalIn = round2(rows.reduce((total, player) => total + player.moneyIn, 0));
    const totalOut = round2(rows.reduce((total, player) => total + player.stacksOut, 0));
    const difference = round2(totalIn - totalOut);
    const balanced = Math.abs(difference) < 0.005;
    const transfers = balanced
      ? calculateMinTransfers(rows.map((player) => ({
          playerId: String(player.id),
          name: player.name,
          net: round2(player.stacksOut - player.moneyIn),
        })))
      : [];

    return { rows, totalIn, totalOut, difference, balanced, transfers };
  }, [players]);

  function updatePlayer(id: number, field: "name" | "moneyIn" | "stacksOut", value: string) {
    setPlayers((current) => current.map((player) => player.id === id ? { ...player, [field]: value } : player));
  }

  function addPlayer() {
    setPlayers((current) => [...current, { id: Math.max(0, ...current.map((player) => player.id)) + 1, name: "", moneyIn: "", stacksOut: "" }]);
  }

  function removePlayer(id: number) {
    setPlayers((current) => current.length > 2 ? current.filter((player) => player.id !== id) : current);
  }

  return (
    <section aria-labelledby="calculator-heading" className="border-b border-gray-200 bg-white px-4 py-14 sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-6xl">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Free calculator</p>
          <h2 id="calculator-heading" className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-gray-950 sm:text-4xl">Settle a game before you create a room.</h2>
          <p className="mt-4 text-base leading-8 text-gray-600">No account needed. Enter each player&apos;s total money in and final stack; payments appear only after the bank balances.</p>
        </div>

        <div className="mt-8 overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_18px_50px_rgba(17,24,20,0.07)]">
          <div className="overflow-x-auto">
            <div className="min-w-[42rem]">
              <div className="grid grid-cols-[minmax(12rem,1fr)_9rem_9rem_3rem] gap-3 border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 sm:px-6">
                <span>Player</span><span>Money in</span><span>Stacks out</span><span className="sr-only">Remove player</span>
              </div>
              <div className="divide-y divide-gray-100">
                {players.map((player, index) => (
                  <div key={player.id} className="grid grid-cols-[minmax(12rem,1fr)_9rem_9rem_3rem] items-center gap-3 px-5 py-3 sm:px-6">
                    <label className="sr-only" htmlFor={`player-${player.id}`}>Player {index + 1} name</label>
                    <input id={`player-${player.id}`} value={player.name} onChange={(event) => updatePlayer(player.id, "name", event.target.value)} placeholder={`Player ${index + 1}`} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10" />
                    <label className="sr-only" htmlFor={`money-in-${player.id}`}>Money in for {player.name || `player ${index + 1}`}</label>
                    <input id={`money-in-${player.id}`} inputMode="decimal" min="0" step="0.01" type="number" value={player.moneyIn} onChange={(event) => updatePlayer(player.id, "moneyIn", event.target.value)} placeholder="0.00" className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm tabular-nums text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10" />
                    <label className="sr-only" htmlFor={`stacks-out-${player.id}`}>Stacks out for {player.name || `player ${index + 1}`}</label>
                    <input id={`stacks-out-${player.id}`} inputMode="decimal" min="0" step="0.01" type="number" value={player.stacksOut} onChange={(event) => updatePlayer(player.id, "stacksOut", event.target.value)} placeholder="0.00" className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm tabular-nums text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10" />
                    <button type="button" onClick={() => removePlayer(player.id)} disabled={players.length <= 2} aria-label={`Remove ${player.name || `player ${index + 1}`}`} className="grid h-11 w-11 place-items-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 disabled:cursor-not-allowed disabled:opacity-30"><Minus aria-hidden className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-gray-200 px-5 py-4 sm:px-6">
            <button type="button" onClick={addPlayer} className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"><Plus aria-hidden className="h-4 w-4" />Add player</button>
          </div>
          <div className="grid border-t border-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-gray-200">
            <div className="px-5 py-4 sm:px-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Money in</p><p className="mt-1 text-xl font-semibold tabular-nums text-gray-950">{formatCurrency(result.totalIn)}</p></div>
            <div className="border-t border-gray-200 px-5 py-4 sm:border-t-0 sm:px-6"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Stacks out</p><p className="mt-1 text-xl font-semibold tabular-nums text-gray-950">{formatCurrency(result.totalOut)}</p></div>
            <div className={`border-t px-5 py-4 sm:border-t-0 sm:px-6 ${result.balanced ? "bg-emerald-50/70" : "bg-amber-50/70"}`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{result.balanced ? "Bank status" : "Mismatch"}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${result.balanced ? "text-emerald-800" : "text-amber-900"}`}>{result.balanced ? "Balanced" : formatSignedNet(result.difference)}</p></div>
          </div>
          {result.balanced ? (
            <div className="border-t border-emerald-100 bg-emerald-50/70 px-5 py-5 sm:px-6">
              <p className="text-sm font-semibold text-emerald-900">Payment list</p>
              {result.transfers.length ? <ul className="mt-3 divide-y divide-emerald-100 rounded-xl border border-emerald-100 bg-white/75">{result.transfers.map((transfer) => <li key={`${transfer.fromPlayerId}-${transfer.toPlayerId}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><span className="text-gray-700"><strong className="font-semibold text-gray-950">{transfer.from}</strong> pays <strong className="font-semibold text-gray-950">{transfer.to}</strong></span><span className="shrink-0 font-semibold tabular-nums text-emerald-800">{formatCurrency(transfer.amount)}</span></li>)}</ul> : <p className="mt-1 text-sm text-emerald-800">No payments needed — everyone is square.</p>}
              <a href="/create" className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">Track the next game in Mainpot</a>
            </div>
          ) : <div className="border-t border-amber-100 bg-amber-50/70 px-5 py-4 text-sm leading-6 text-amber-900 sm:px-6">Add or correct an entry until money in equals stacks out. Payments stay hidden until the bank is balanced.</div>}
        </div>
      </div>
    </section>
  );
}
