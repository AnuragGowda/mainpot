"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Plus,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatCurrency, formatSignedNet, round2 } from "@/lib/format";
import {
  applyDiscrepancyAllocation,
  calculateMinTransfers,
  getPlayerNetChanges,
  type DiscrepancyAllocationMethod,
} from "@/lib/settlement";

import { MAX_CURRENCY_AMOUNT, validateCurrencyAmount } from "@/lib/currency-input";

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

const inputClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-gray-950 focus:ring-2 focus:ring-gray-950/10";

export default function SettlementCalculator() {
  const [players, setPlayers] = useState(initialPlayers);
  const [usingExample, setUsingExample] = useState(true);
  const [allocationMethod, setAllocationMethod] =
    useState<DiscrepancyAllocationMethod>("proportional");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});

  const inputErrors = players.map((player) => ({
    moneyIn: validateCurrencyAmount(player.moneyIn, { allowBlank: true }),
    stacksOut: validateCurrencyAmount(player.stacksOut, { allowBlank: true }),
  }));
  const invalidInputs = inputErrors.some((errors) => errors.moneyIn || errors.stacksOut);
  const incompleteAmounts = players.some(
    (player) => !player.moneyIn.trim() || !player.stacksOut.trim()
  );

  const result = useMemo(() => {
    const rows = players.map((player, index) => ({
      ...player,
      name: player.name.trim() || `Player ${index + 1}`,
      moneyIn: validateCurrencyAmount(player.moneyIn, { allowBlank: true }) ? 0 : Number(player.moneyIn),
      stacksOut: validateCurrencyAmount(player.stacksOut, { allowBlank: true }) ? 0 : Number(player.stacksOut),
    }));
    const totalIn = round2(
      rows.reduce((total, player) => total + player.moneyIn, 0)
    );
    const totalOut = round2(
      rows.reduce((total, player) => total + player.stacksOut, 0)
    );
    const difference = round2(totalIn - totalOut);
    const balanced = Math.abs(difference) < 0.005;
    const baseNets = rows.map((player) => ({
      playerId: String(player.id),
      name: player.name,
      net: round2(player.stacksOut - player.moneyIn),
    }));
    const eligiblePlayers = baseNets.filter((player) =>
      difference > 0 ? player.net < -0.005 : player.net > 0.005
    );
    const selectedEligiblePlayers = eligiblePlayers.filter((player) =>
      selectedPlayerIds.includes(player.playerId)
    );
    const selectedCapacity = round2(
      selectedEligiblePlayers.reduce(
        (total, player) => total + Math.abs(player.net),
        0
      )
    );
    const customPlayerAllocations = eligiblePlayers
      .map((player) => ({
        playerId: player.playerId,
        amount: round2(Number(customAmounts[player.playerId] ?? 0)),
      }))
      .filter((item) => Number.isFinite(item.amount) && item.amount >= 0.005);
    const customAllocatedTotal = round2(
      customPlayerAllocations.reduce((total, item) => total + item.amount, 0)
    );
    const customHasInvalidAmount = eligiblePlayers.some((player) => {
      const raw = customAmounts[player.playerId] ?? "";
      if (raw.trim() === "") return false;
      const parsed = round2(Number(raw));
      return Boolean(validateCurrencyAmount(raw))
        || parsed < 0
        || parsed > Math.abs(player.net) + 0.005;
    });
    const customAllocationValid = customPlayerAllocations.length > 0
      && !customHasInvalidAmount
      && Math.abs(customAllocatedTotal - Math.abs(difference)) < 0.005;
    const allocationValid =
      balanced ||
      allocationMethod === "proportional" ||
      (allocationMethod === "selected"
        ? selectedCapacity + 0.005 >= Math.abs(difference)
        : customAllocationValid);
    const adjustedNets = balanced
      ? baseNets
      : allocationValid
        ? applyDiscrepancyAllocation(baseNets, difference, {
            method: allocationMethod,
            playerIds: allocationMethod === "custom"
              ? customPlayerAllocations.map((item) => item.playerId)
              : selectedPlayerIds,
            playerAllocations: allocationMethod === "custom"
              ? customPlayerAllocations
              : undefined,
          })
        : baseNets;
    const transfers = allocationValid
      ? calculateMinTransfers(adjustedNets)
      : [];

    return {
      totalIn,
      totalOut,
      difference,
      balanced,
      eligiblePlayers,
      selectedCapacity,
      customAllocatedTotal,
      customHasInvalidAmount,
      allocationValid,
      baseNets,
      adjustedNets,
      transfers,
    };
  }, [allocationMethod, customAmounts, players, selectedPlayerIds]);

  const discrepancyAmount = Math.abs(result.difference);
  const affectedSide = result.difference < 0 ? "winners" : "losing players";
  const presetTitle =
    result.difference < 0
      ? "Adjust all winners proportionally"
      : "Adjust all losing players proportionally";
  const presetDescription =
    result.difference < 0
      ? "Larger wins absorb more of the difference. Losing results stay unchanged."
      : "Larger losses receive more of the adjustment. Winning results stay unchanged.";

  function updatePlayer(
    id: number,
    field: "name" | "moneyIn" | "stacksOut",
    value: string
  ) {
    setUsingExample(false);
    setPlayers((current) =>
      current.map((player) =>
        player.id === id ? { ...player, [field]: value } : player
      )
    );
  }

  function addPlayer() {
    setUsingExample(false);
    setPlayers((current) => [
      ...current,
      {
        id: Math.max(0, ...current.map((player) => player.id)) + 1,
        name: "",
        moneyIn: "",
        stacksOut: "",
      },
    ]);
  }

  function removePlayer(id: number) {
    setUsingExample(false);
    setPlayers((current) =>
      current.length > 2
        ? current.filter((player) => player.id !== id)
        : current
    );
    setSelectedPlayerIds((current) =>
      current.filter((playerId) => playerId !== String(id))
    );
    setCustomAmounts((current) => {
      const next = { ...current };
      delete next[String(id)];
      return next;
    });
  }

  function clearExample() {
    setPlayers([
      { id: 1, name: "", moneyIn: "", stacksOut: "" },
      { id: 2, name: "", moneyIn: "", stacksOut: "" },
    ]);
    setUsingExample(false);
    setAllocationMethod("proportional");
    setSelectedPlayerIds([]);
    setCustomAmounts({});
    document.getElementById("player-1")?.focus();
  }

  function toggleSelectedPlayer(playerId: string) {
    setSelectedPlayerIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId]
    );
  }

  return (
    <section
      id="calculator"
      aria-labelledby="calculator-heading"
      className="scroll-mt-20 border-b border-gray-200 bg-white px-4 py-5 sm:px-6 sm:py-8"
    >
      <div className="mx-auto w-full max-w-6xl">
        <h2 id="calculator-heading" className="sr-only">Who owes whom?</h2>

        <div className="overflow-hidden rounded-2xl border border-gray-300 bg-[#f4f5f2]">
          <header className="flex flex-col gap-3 border-b border-gray-300 bg-[#111512] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-400" />
                <h3 className="font-semibold">Settlement worksheet</h3>
              </div>
              <p className="mt-1 text-xs text-gray-300">
                {usingExample ? "Example game · change any value to try it." : "Updates as you type. Enter 0 when a player has no money in or no final chips. Nothing is saved."}
              </p>
            </div>
            <button
              type="button"
              onClick={addPlayer}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Plus aria-hidden className="h-4 w-4" />
              Add player
            </button>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-gray-300 px-4 py-2 text-sm sm:px-6">
            {usingExample ? <button type="button" onClick={clearExample} className="min-h-11 font-semibold text-gray-800 underline underline-offset-4">Clear example</button> : <span className="text-gray-600">{players.length} players</span>}
            <a href="#calculator-results" className="inline-flex min-h-11 items-center font-semibold text-gray-800 underline underline-offset-4">View payments ↓</a>
          </div>
          <div className="grid lg:grid-cols-[minmax(0,1.18fr)_minmax(21rem,0.82fr)]">
            <div className="bg-white p-4 sm:p-6 lg:border-r lg:border-gray-300">
              <div className="mb-3 hidden grid-cols-[minmax(10rem,1fr)_8.5rem_8.5rem_2.75rem] gap-3 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600 sm:grid">
                <span>Player</span>
                <span>Money in</span>
                <span>Final stack</span>
                <span className="sr-only">Remove player</span>
              </div>

              <div className="space-y-3">
                {players.map((player, index) => (
                  <div
                    key={player.id}
                    className="grid grid-cols-[1fr_1fr_2.75rem] gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-[minmax(10rem,1fr)_8.5rem_8.5rem_2.75rem] sm:items-center sm:border-0 sm:p-0"
                  >
                    <div className="col-span-3 sm:col-span-1">
                      <label
                        className="sr-only"
                        htmlFor={`player-${player.id}`}
                      >
                        Player {index + 1}
                      </label>
                      <input
                        id={`player-${player.id}`}
                        value={player.name}
                        onChange={(event) =>
                          updatePlayer(player.id, "name", event.target.value)
                        }
                        placeholder={`Player ${index + 1}`}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label
                        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-600 sm:sr-only"
                        htmlFor={`money-in-${player.id}`}
                      >
                        Money in
                      </label>
                      <input
                        id={`money-in-${player.id}`}
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        type="text"
                        max={MAX_CURRENCY_AMOUNT}
                        aria-invalid={Boolean(inputErrors[index].moneyIn)}
                        aria-describedby={inputErrors[index].moneyIn ? `money-in-error-${player.id}` : undefined}
                        value={player.moneyIn}
                        onChange={(event) =>
                          updatePlayer(player.id, "moneyIn", event.target.value)
                        }
                        placeholder="0.00"
                        aria-label={`Money in for ${player.name || `player ${index + 1}`}`}
                        className={`${inputClass} tabular-nums`}
                      />
                      {inputErrors[index].moneyIn ? <p id={`money-in-error-${player.id}`} className="mt-1 text-xs text-red-700">{inputErrors[index].moneyIn}</p> : null}
                    </div>
                    <div>
                      <label
                        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-600 sm:sr-only"
                        htmlFor={`stacks-out-${player.id}`}
                      >
                        Final stack
                      </label>
                      <input
                        id={`stacks-out-${player.id}`}
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        type="text"
                        max={MAX_CURRENCY_AMOUNT}
                        aria-invalid={Boolean(inputErrors[index].stacksOut)}
                        aria-describedby={inputErrors[index].stacksOut ? `stacks-out-error-${player.id}` : undefined}
                        value={player.stacksOut}
                        onChange={(event) =>
                          updatePlayer(player.id, "stacksOut", event.target.value)
                        }
                        placeholder="0.00"
                        aria-label={`Final stack for ${player.name || `player ${index + 1}`}`}
                        className={`${inputClass} tabular-nums`}
                      />
                      {inputErrors[index].stacksOut ? <p id={`stacks-out-error-${player.id}`} className="mt-1 text-xs text-red-700">{inputErrors[index].stacksOut}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removePlayer(player.id)}
                      disabled={players.length <= 2}
                      aria-label={`Remove ${player.name || `player ${index + 1}`}`}
                      className="mt-[1.375rem] grid h-11 w-11 place-items-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 disabled:cursor-not-allowed disabled:opacity-30 sm:mt-0"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <aside id="calculator-results" tabIndex={-1} aria-label="Settlement results" aria-live="polite" className="min-w-0 scroll-mt-20 p-4 focus:outline-none sm:p-6">
              {invalidInputs || incompleteAmounts ? (
                <p role="status" className="rounded-lg border border-gray-300 bg-white p-4 text-sm leading-6 text-gray-700">
                  {invalidInputs
                    ? "Correct the highlighted amounts to calculate payments."
                    : "Enter money in and a final stack for every player. Enter 0 when either amount is zero."}
                </p>
              ) : <>
              <div className="grid grid-cols-2 gap-x-5 border-b border-gray-300 pb-5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                    Money in
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-gray-950">
                    {formatCurrency(result.totalIn)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                    Final stacks
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-gray-950">
                    {formatCurrency(result.totalOut)}
                  </p>
                </div>
              </div>

              {result.balanced ? (
                <div className="flex items-start gap-3 border-b border-gray-300 py-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-700 text-white">
                    <Check aria-hidden className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-semibold text-gray-950">Bank balanced</p>
                    <p className="mt-1 text-sm leading-6 text-gray-600">
                      The payment list uses the recorded results as entered.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border-b border-gray-300 py-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      aria-hidden
                      className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
                    />
                    <div>
                      <p className="font-semibold text-gray-950">
                        {formatCurrency(discrepancyAmount)} needs a decision
                      </p>
                      <p className="mt-1 text-sm leading-6 text-gray-600">
                        The ledger is {formatSignedNet(result.difference)} out.
                        Correct a mistake above, or record how the table wants to
                        allocate it.
                      </p>
                    </div>
                  </div>

                  <fieldset className="mt-5 space-y-2">
                    <legend className="sr-only">Discrepancy allocation</legend>
                    <label
                      className={`block cursor-pointer rounded-xl border p-4 transition ${
                        allocationMethod === "proportional"
                          ? "border-gray-950 bg-white"
                          : "border-gray-300 bg-transparent hover:bg-white/70"
                      }`}
                    >
                      <span className="flex gap-3">
                        <input
                          type="radio"
                          name="calculator-allocation"
                          checked={allocationMethod === "proportional"}
                          onChange={() => setAllocationMethod("proportional")}
                          className="mt-1 h-4 w-4"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-gray-950">
                            {presetTitle}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-gray-600">
                            {presetDescription}
                          </span>
                        </span>
                      </span>
                    </label>
                    <label
                      className={`block cursor-pointer rounded-xl border p-4 transition ${
                        allocationMethod === "selected"
                          ? "border-gray-950 bg-white"
                          : "border-gray-300 bg-transparent hover:bg-white/70"
                      }`}
                    >
                      <span className="flex gap-3">
                        <input
                          type="radio"
                          name="calculator-allocation"
                          checked={allocationMethod === "selected"}
                          onChange={() => setAllocationMethod("selected")}
                          className="mt-1 h-4 w-4"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-gray-950">
                            Choose specific players
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-gray-600">
                            Adjust only the selected {affectedSide}. Multiple selections are weighted by result.
                          </span>
                        </span>
                      </span>
                    </label>
                    <label
                      className={`block cursor-pointer rounded-xl border p-4 transition ${
                        allocationMethod === "custom"
                          ? "border-gray-950 bg-white"
                          : "border-gray-300 bg-transparent hover:bg-white/70"
                      }`}
                    >
                      <span className="flex gap-3">
                        <input
                          type="radio"
                          name="calculator-allocation"
                          checked={allocationMethod === "custom"}
                          onChange={() => setAllocationMethod("custom")}
                          className="mt-1 h-4 w-4"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-gray-950">
                            Enter exact amounts
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-gray-600">
                            Advanced: specify each eligible player&apos;s exact adjustment.
                          </span>
                        </span>
                      </span>
                    </label>
                  </fieldset>

                  {allocationMethod === "selected" ? (
                    <fieldset className="mt-4">
                      <legend className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        <Users aria-hidden className="h-3.5 w-3.5" />
                        Select {affectedSide}
                      </legend>
                      <div className="mt-2 divide-y divide-gray-200 rounded-xl border border-gray-300 bg-white px-3">
                        {result.eligiblePlayers.map((player) => (
                          <label
                            key={player.playerId}
                            className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2 text-sm"
                          >
                            <span className="font-medium text-gray-800">
                              {player.name}
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="text-xs tabular-nums text-gray-600">
                                {formatCurrency(Math.abs(player.net))} capacity
                              </span>
                              <input
                                type="checkbox"
                                checked={selectedPlayerIds.includes(
                                  player.playerId
                                )}
                                onChange={() =>
                                  toggleSelectedPlayer(player.playerId)
                                }
                                className="h-4 w-4"
                              />
                            </span>
                          </label>
                        ))}
                      </div>
                      {!result.allocationValid ? (
                        <p className="mt-2 text-xs leading-5 text-red-700">
                          Select enough result value to cover {formatCurrency(discrepancyAmount)}.
                          {" "}Selected: {formatCurrency(result.selectedCapacity)}.
                        </p>
                      ) : null}
                    </fieldset>
                  ) : null}

                  {allocationMethod === "custom" ? (
                    <fieldset className="mt-4">
                      <legend className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">
                        <Users aria-hidden className="h-3.5 w-3.5" />
                        Exact adjustments
                      </legend>
                      <p className="mt-2 text-xs leading-5 text-gray-600">
                        Assign {formatCurrency(discrepancyAmount)} without moving anyone past even.
                      </p>
                      <div className="mt-2 divide-y divide-gray-200 rounded-xl border border-gray-300 bg-white px-3">
                        {result.eligiblePlayers.map((player) => (
                          <label
                            key={player.playerId}
                            className="flex min-h-14 items-center justify-between gap-3 py-2 text-sm"
                          >
                            <span>
                              <span className="block font-medium text-gray-800">{player.name}</span>
                              <span className="block text-xs tabular-nums text-gray-600">
                                Up to {formatCurrency(Math.abs(player.net))}
                              </span>
                            </span>
                            <span className="relative w-28">
                              <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">$</span>
                              <input
                                aria-label={`Exact discrepancy adjustment for ${player.name}`}
                                type="text"
                                inputMode="decimal"
                                min="0"
                                max={Math.abs(player.net)}
                                step="0.01"
                                placeholder="0.00"
                                value={customAmounts[player.playerId] ?? ""}
                                onChange={(event) => setCustomAmounts((current) => ({
                                  ...current,
                                  [player.playerId]: event.target.value,
                                }))}
                                className={`${inputClass} pl-7 text-right tabular-nums`}
                              />
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className={`mt-2 text-xs leading-5 ${result.allocationValid ? "text-emerald-700" : "text-red-700"}`}>
                        Assigned {formatCurrency(result.customAllocatedTotal)} of {formatCurrency(discrepancyAmount)}
                        {result.customHasInvalidAmount ? ". Each amount must stay within that player’s result." : "."}
                      </p>
                    </fieldset>
                  ) : null}

                  {result.allocationValid ? (
                    <div className="mt-4 rounded-xl border border-gray-300 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                        Result preview
                      </p>
                      <ul className="mt-2 space-y-1.5 text-xs">
                        {getPlayerNetChanges(result.baseNets, result.adjustedNets)
                          .filter((player) => Math.abs(player.adjustment) >= 0.005)
                          .map((player) => (
                            <li key={player.playerId} className="flex items-baseline justify-between gap-3">
                              <span className="font-medium text-gray-800">{player.name}</span>
                              <span className="whitespace-nowrap tabular-nums text-gray-600">
                                {formatSignedNet(player.before)} <strong className="text-gray-950">{formatSignedNet(player.adjustment)}</strong> → {formatSignedNet(player.final)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="pt-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                      {result.balanced ? "Payment list" : "Adjusted payment list"}
                    </p>
                    {!result.balanced && result.allocationValid ? (
                      <p className="mt-1 text-xs text-gray-600">
                        Includes the {formatCurrency(discrepancyAmount)} recorded adjustment.
                      </p>
                    ) : null}
                  </div>
                  <span className="text-xs font-medium text-gray-600">
                    {result.allocationValid
                      ? `${result.transfers.length} ${result.transfers.length === 1 ? "payment" : "payments"}`
                      : "Waiting"}
                  </span>
                </div>

                {result.allocationValid ? (
                  result.transfers.length ? (
                    <ol className="mt-4 divide-y divide-gray-200 border-y border-gray-300">
                      {result.transfers.map((transfer) => (
                        <li
                          key={`${transfer.fromPlayerId}-${transfer.toPlayerId}`}
                          className="flex items-center gap-3 py-3 text-sm"
                        >
                          <span className="min-w-0 flex-1">
                            <strong className="font-semibold text-gray-950">
                              {transfer.from}
                            </strong>
                            <ArrowRight
                              aria-label="pays"
                              className="mx-2 inline h-3.5 w-3.5 text-gray-400"
                            />
                            <strong className="font-semibold text-gray-950">
                              {transfer.to}
                            </strong>
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-gray-950">
                            {formatCurrency(transfer.amount)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-3 text-sm text-gray-600">
                      No payments needed — everyone is square.
                    </p>
                  )
                ) : (
                  <p className="mt-3 text-sm leading-6 text-gray-600">
                    Complete the selected allocation so it covers the full
                    difference to reveal the payments.
                  </p>
                )}

                <a
                  href="/create"
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
                >
                  Track the next game in Mainpot
                </a>
              </div>
              </>}
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
