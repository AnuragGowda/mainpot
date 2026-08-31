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
import { addCashOut, markEnded, submitGameFeedback } from "@/lib/data";
import { getPlayerCashOut, playerInvested, totalPot } from "@/lib/game";
import { round2 } from "@/lib/format";
import { getSessionId } from "@/lib/session";
import {
  applyFundingAdjustments,
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

type SettlementMode = "entry" | "results";
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

  const minTransfers = calculateMinTransfers(nets);
  const bankPlayer =
    players.find((player) => player.id === bankPlayerId) ?? null;
  const bankTransfers = calculateBankSettlement(nets, bankPlayerId);
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

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
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
            <ConfirmButton
              variant="primary"
              size="md"
              loading={finalizing}
              confirmLabel="Finalize now?"
              onConfirm={handleFinalize}
            >
              Finalize game
            </ConfirmButton>
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
                  onConfirm={() => setMode("results")}
                >
                  Calculate anyway
                </ConfirmButton>
              </div>
            ) : null}
          </div>
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
                <NetList nets={nets} />
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
                  nets={nets}
                  bankPlayerId={bankPlayerId}
                  bankResidual={difference}
                />
              </section>
            </div>
          )}

          <SettlementSummary
            snapshot={snapshot}
            game={snapshot.game}
            transfers={activeTabTransfers}
            nets={nets}
            mode={tab}
            bankName={bankPlayer?.name}
            totalBoughtIn={totalBoughtIn}
            isHost={isHost}
            finalized={snapshot.game.status === "ended"}
            playerCount={players.length}
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
