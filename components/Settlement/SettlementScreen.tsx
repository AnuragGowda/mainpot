"use client";

import { useEffect, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import Badge from "@/components/ui/Badge";
import type { BadgeVariant } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import ConfirmButton from "@/components/GameRoom/ConfirmButton";
import { copyText } from "@/lib/clipboard";
import { addCashOut, markEnded, saveDiscrepancyAllocation, submitGameFeedback } from "@/lib/data";
import { formatCurrency, round2 } from "@/lib/format";
import { getPlayerCashOut, playerInvested, totalPot } from "@/lib/game";
import { getSessionId } from "@/lib/session";
import {
  applyFundingAdjustments,
  applyDiscrepancyAllocation,
  calculateBankSettlement,
  calculateMinTransfers,
} from "@/lib/settlement";
import type { GameSnapshot, GameStatus } from "@/lib/types";
import CashOutEntry from "./CashOutEntry";
import FundingNotes from "./FundingNotes";
import NetList from "./NetList";
import ReconciliationBar from "./ReconciliationBar";
import SettlementSummary from "./SettlementSummary";
import TransferList from "./TransferList";

type SettlementMode = "entry" | "allocation" | "results";
type ResultsTab = "min" | "bank";

export interface SettlementScreenProps {
  snapshot: GameSnapshot;
}

const statusMeta: Record<
  GameStatus,
  { label: string; variant: BadgeVariant }
> = {
  active: { label: "Active", variant: "green" },
  settling: { label: "Settling", variant: "amber" },
  ended: { label: "Ended", variant: "gray" },
};

function defaultBankId(players: GameSnapshot["players"]): string {
  const host = players.find((player) => player.is_host);
  return (host ?? players[0])?.id ?? "";
}

function tabClass(selected: boolean): string {
  return [
    "inline-flex h-11 items-center rounded-md px-4 text-sm font-medium transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-1",
    selected ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900",
  ].join(" ");
}

/**
 * Settlement flow for non-active games: cash-out reconciliation (entry mode)
 * and transfer planning with min-transfers / bank tabs (results mode).
 * Self-contained — the current player is derived from the browser session id.
 */
export default function SettlementScreen({ snapshot }: SettlementScreenProps) {
  const { toast } = useToast();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<SettlementMode>(() =>
    snapshot.game.status === "ended" ? "results" : "entry"
  );
  const [tab, setTab] = useState<ResultsTab>("min");
  const [bankPlayerId, setBankPlayerId] = useState<string>(() =>
    defaultBankId(snapshot.players)
  );
  const [finalizing, setFinalizing] = useState(false);
  const [allocationMethod, setAllocationMethod] = useState<"proportional" | "selected">(
    snapshot.game.discrepancy_allocation?.method ?? "proportional"
  );
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(
    snapshot.game.discrepancy_allocation?.player_ids ?? []
  );
  const [allocationSaving, setAllocationSaving] = useState(false);
  const [feedbackScore, setFeedbackScore] = useState<number | null>(null);
  const [confusing, setConfusing] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    if (snapshot.game.status === "ended") {
      setMode("results");
    }
  }, [snapshot.game.status]);

  useEffect(() => {
    const saved = snapshot.game.discrepancy_allocation;
    if (!saved) return;
    setAllocationMethod(saved.method);
    setSelectedPlayerIds(saved.player_ids);
  }, [snapshot.game.discrepancy_allocation]);

  // Keep the selected bank valid when the player list changes.
  useEffect(() => {
    setBankPlayerId((current) => {
      if (current && snapshot.players.some((player) => player.id === current)) {
        return current;
      }
      return defaultBankId(snapshot.players);
    });
  }, [snapshot.players]);

  const players = snapshot.players;
  const totalBoughtIn = totalPot(snapshot);
  const totalCashedOut = snapshot.cashOuts.reduce(
    (sum, cashOut) => sum + cashOut.amount,
    0
  );
  const difference = round2(totalBoughtIn - totalCashedOut);
  const balanced = Math.abs(difference) < 0.005;

  const currentPlayer = sessionId
    ? (players.find((player) => player.session_id === sessionId) ?? null)
    : null;
  const currentPlayerId = currentPlayer?.id ?? null;
  const isHost = currentPlayer?.is_host === true;

  const nets = applyFundingAdjustments(
    players.map((player) => ({
      playerId: player.id,
      name: player.name,
      net: round2(
        (getPlayerCashOut(snapshot, player.id)?.amount ?? 0) -
          playerInvested(snapshot, player.id)
      ),
    })),
    snapshot.buyIns
  );

  const allocationEligible = nets.filter((player) =>
    difference > 0 ? player.net < -0.005 : player.net > 0.005
  );
  const allocation = !balanced
    ? { method: allocationMethod, playerIds: selectedPlayerIds }
    : null;
  const allocatedNets = allocation
    ? applyDiscrepancyAllocation(nets, difference, allocation)
    : nets;
  const selectedCapacity = allocationEligible
    .filter((player) => selectedPlayerIds.includes(player.playerId))
    .reduce((sum, player) => sum + Math.abs(player.net), 0);
  const selectedAllocationValid = allocationMethod === "proportional"
    || (selectedPlayerIds.length > 0 && selectedCapacity + 0.005 >= Math.abs(difference));
  const minTransfers = calculateMinTransfers(allocatedNets);
  const bankPlayer =
    players.find((player) => player.id === bankPlayerId) ?? null;
  const bankTransfers = calculateBankSettlement(allocatedNets, bankPlayerId);
  const activeTabTransfers = tab === "min" ? minTransfers : bankTransfers;

  const status = statusMeta[snapshot.game.status];

  async function handleCopyCode() {
    try {
      await copyText(snapshot.game.code);
      toast("Copied!", "success");
    } catch {
      toast("Couldn't copy the room code.", "error");
    }
  }

  async function handleSaveCashOut(playerId: string, amount: number) {
    try {
      await addCashOut(snapshot.game.id, playerId, amount);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to save cash-out.",
        "error"
      );
    }
  }

  async function handleFinalize() {
    setFinalizing(true);
    try {
      await markEnded(snapshot.game.id);
      toast("Game finalized", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to finalize the game.",
        "error"
      );
    } finally {
      setFinalizing(false);
    }
  }

  async function handleAllocationContinue() {
    if (!selectedAllocationValid) return;
    setAllocationSaving(true);
    try {
      await saveDiscrepancyAllocation(snapshot.game.id, {
        method: allocationMethod,
        player_ids: allocationMethod === "selected" ? selectedPlayerIds : allocationEligible.map((player) => player.playerId),
        amount: Math.abs(difference),
      });
      setMode("results");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save the discrepancy decision.", "error");
    } finally {
      setAllocationSaving(false);
    }
  }

  async function handleFeedbackSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (feedbackScore == null) return;
    setFeedbackSaving(true);
    try {
      await submitGameFeedback(snapshot.game.id, feedbackScore, confusing);
      setFeedbackSent(true);
      toast("Thanks — that helps us improve.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't save feedback.", "error");
    } finally {
      setFeedbackSaving(false);
    }
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const tabs: ResultsTab[] = ["min", "bank"];
    const currentIndex = tabs.indexOf(tab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
    setTab(nextTab);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                {snapshot.game.name}
              </h1>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Hosted by {snapshot.game.host_name}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
              Room code
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-mono text-2xl font-bold tracking-[0.2em] text-gray-900">
                {snapshot.game.code}
              </span>
              <Button variant="secondary" size="md" onClick={handleCopyCode}>
                Copy
              </Button>
            </div>
          </div>

          {isHost && snapshot.game.status === "settling" && mode === "results" ? (
            <div className="w-full sm:w-auto">
              <ConfirmButton
                variant="primary"
                size="md"
                className="w-full sm:w-auto"
                loading={finalizing}
                confirmLabel="Finalize now?"
                onConfirm={handleFinalize}
              >
                Finalize game
              </ConfirmButton>
            </div>
          ) : null}
        </div>
      </header>

      {players.length === 0 ? (
        <Card padding="md" className="mt-6">
          <p className="text-sm text-gray-500">No players.</p>
        </Card>
      ) : mode === "entry" ? (
        <div className="mt-6 space-y-6">
          <ReconciliationBar
            totalBoughtIn={totalBoughtIn}
            totalCashedOut={totalCashedOut}
            difference={difference}
            balanced={balanced}
          />

          <FundingNotes snapshot={snapshot} />

          <CashOutEntry
            snapshot={snapshot}
            currentPlayerId={currentPlayerId}
            isHost={isHost}
            onSaveCashOut={handleSaveCashOut}
          />

          <div className="space-y-3">
            <Button
              fullWidth
              size="lg"
              disabled={!balanced}
              onClick={() => setMode("results")}
            >
              Calculate settlement
            </Button>

            {!balanced ? (
              <div className="flex flex-col items-center gap-2 pt-1 text-center sm:flex-row sm:justify-center">
                <p className="text-sm text-gray-500">
                  Need to settle with a discrepancy?
                </p>
                <ConfirmButton
                  variant="ghost"
                  size="sm"
                  confirmLabel="Calculate anyway?"
                  onConfirm={() => setMode("allocation")}
                >
                  Calculate anyway
                </ConfirmButton>
              </div>
            ) : null}
          </div>
        </div>
      ) : mode === "allocation" ? (
        <div className="mt-6 space-y-6">
          <Card padding="md" className="border-amber-200 bg-amber-50/60">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">Discrepancy decision</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-gray-950">Agree how to handle {formatCurrency(Math.abs(difference))} before payments.</h2>
            <p className="mt-2 text-sm leading-6 text-gray-700">
              {difference < 0
                ? "Cash-outs exceed buy-ins, so the adjustment reduces winnings."
                : "Cash-outs are short of buy-ins, so the adjustment reduces recorded losses."} This choice is included in the settlement record.
            </p>

            <fieldset className="mt-5 space-y-3">
              <legend className="text-sm font-semibold text-gray-900">Allocate the adjustment</legend>
              <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-white p-4">
                <input type="radio" name="allocation-method" checked={allocationMethod === "proportional"} onChange={() => setAllocationMethod("proportional")} className="mt-0.5 h-4 w-4" />
                <span><span className="block text-sm font-semibold text-gray-900">Split proportionally</span><span className="mt-1 block text-sm text-gray-600">Share it across every {difference < 0 ? "winner" : "losing player"} in proportion to their result.</span></span>
              </label>
              <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-white p-4">
                <input type="radio" name="allocation-method" checked={allocationMethod === "selected"} onChange={() => setAllocationMethod("selected")} className="mt-0.5 h-4 w-4" />
                <span><span className="block text-sm font-semibold text-gray-900">Choose players</span><span className="mt-1 block text-sm text-gray-600">Use this when the table knows which results the discrepancy belongs to.</span></span>
              </label>
            </fieldset>

            {allocationMethod === "selected" ? (
              <fieldset className="mt-4 space-y-2">
                <legend className="text-sm font-semibold text-gray-900">Players sharing the adjustment</legend>
                {allocationEligible.map((player) => {
                  const checked = selectedPlayerIds.includes(player.playerId);
                  return <label key={player.playerId} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800"><span>{player.name} <span className="text-gray-500">({formatCurrency(Math.abs(player.net))})</span></span><input type="checkbox" checked={checked} onChange={() => setSelectedPlayerIds((current) => checked ? current.filter((id) => id !== player.playerId) : [...current, player.playerId])} className="h-4 w-4" /></label>;
                })}
                {!selectedAllocationValid ? <p className="text-sm text-red-700">Select players with at least {formatCurrency(Math.abs(difference))} in eligible results.</p> : null}
              </fieldset>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" size="md" onClick={() => setMode("entry")}>Back to cash-outs</Button>
              <Button size="md" onClick={handleAllocationContinue} disabled={!selectedAllocationValid} loading={allocationSaving}>Review adjusted settlement</Button>
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="tablist"
              aria-label="Settlement view"
              onKeyDown={handleTabKeyDown}
              className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-100 p-1"
            >
              <button
                type="button"
                role="tab"
                id="tab-min"
                aria-selected={tab === "min"}
                aria-controls="panel-min"
                tabIndex={tab === "min" ? 0 : -1}
                onClick={() => setTab("min")}
                className={tabClass(tab === "min")}
              >
                Fewest payments
              </button>
              <button
                type="button"
                role="tab"
                id="tab-bank"
                aria-selected={tab === "bank"}
                aria-controls="panel-bank"
                tabIndex={tab === "bank" ? 0 : -1}
                onClick={() => setTab("bank")}
                className={tabClass(tab === "bank")}
              >
                Bank
              </button>
            </div>

            <Button variant="ghost" size="md" onClick={() => setMode("entry")}>
              Edit cash-outs
            </Button>
          </div>

          <FundingNotes snapshot={snapshot} />

          {tab === "min" ? (
            <div
              id="panel-min"
              role="tabpanel"
              aria-labelledby="tab-min"
              className="space-y-6"
            >
              <section aria-labelledby="transfers-min-heading">
                <h2
                  id="transfers-min-heading"
                  className="mb-2 text-sm font-medium uppercase tracking-widest text-gray-500"
                >
                  Fewest payments
                </h2>
                <TransferList transfers={minTransfers} gameId={snapshot.game.id} mode="min" />
              </section>

              <section aria-labelledby="nets-min-heading">
                <h2
                  id="nets-min-heading"
                  className="mb-2 text-sm font-medium uppercase tracking-widest text-gray-500"
                >
                  Net results
                </h2>
                <NetList nets={allocatedNets} />
              </section>
            </div>
          ) : (
            <div
              id="panel-bank"
              role="tabpanel"
              aria-labelledby="tab-bank"
              className="space-y-6"
            >
              <div>
                <label
                  htmlFor="bank-player-select"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Who is the bank?
                </label>
                <select
                  id="bank-player-select"
                  value={bankPlayerId}
                  onChange={(event) => setBankPlayerId(event.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-950/10"
                >
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>

              <section aria-labelledby="transfers-bank-heading">
                <h2
                  id="transfers-bank-heading"
                  className="mb-2 text-sm font-medium uppercase tracking-widest text-gray-500"
                >
                  Bank settlements
                </h2>
                <TransferList transfers={bankTransfers} gameId={snapshot.game.id} mode="bank" />
              </section>

              <section aria-labelledby="nets-bank-heading">
                <h2
                  id="nets-bank-heading"
                  className="mb-2 text-sm font-medium uppercase tracking-widest text-gray-500"
                >
                  Net results
                </h2>
                <NetList
                  nets={allocatedNets}
                  bankPlayerId={bankPlayerId}
                  bankResidual={0}
                />
              </section>
            </div>
          )}

          <SettlementSummary
            snapshot={snapshot}
            game={snapshot.game}
            transfers={activeTabTransfers}
            nets={allocatedNets}
            mode={tab}
            bankName={bankPlayer?.name}
            totalBoughtIn={totalBoughtIn}
            isHost={isHost}
            finalized={snapshot.game.status === "ended"}
            playerCount={players.length}
            discrepancyAllocation={allocation}
            discrepancyAmount={balanced ? 0 : Math.abs(difference)}
          />

          {snapshot.game.status === "ended" && !feedbackSent ? (
            <Card padding="md" className="border-gray-200 bg-gray-50">
              <h2 className="font-semibold text-gray-950">How did game night go?</h2>
              <p className="mt-1 text-sm text-gray-600">A quick note helps us make the next game smoother.</p>
              <form onSubmit={handleFeedbackSubmit} className="mt-4 space-y-4">
                <fieldset>
                  <legend className="text-sm font-medium text-gray-700">How easy was Mainpot to use?</legend>
                  <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Ease of use score">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button key={score} type="button" role="radio" aria-checked={feedbackScore === score}
                        onClick={() => setFeedbackScore(score)}
                        className={`grid h-10 w-10 place-items-center rounded-lg border text-sm font-semibold ${feedbackScore === score ? "border-gray-950 bg-gray-950 text-white" : "border-gray-300 bg-white text-gray-700"}`}>
                        {score}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-medium text-gray-700" htmlFor="feedback-confusing">
                  What was confusing? <span className="font-normal text-gray-400">(optional)</span>
                  <textarea id="feedback-confusing" value={confusing} onChange={(event) => setConfusing(event.target.value)} maxLength={1000} rows={3}
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-950/10" />
                </label>
                <Button type="submit" size="md" disabled={feedbackScore == null} loading={feedbackSaving}>Send feedback</Button>
              </form>
            </Card>
          ) : null}
        </div>
      )}
    </main>
  );
}
