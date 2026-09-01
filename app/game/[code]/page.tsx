"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import GameHeader from "@/components/GameRoom/GameHeader";
import PlayerList from "@/components/GameRoom/PlayerList";
import ActivityFeed from "@/components/GameRoom/ActivityFeed";
import BuyInActions from "@/components/GameRoom/BuyInActions";
import JoinPrompt from "@/components/GameRoom/JoinPrompt";
import HostControls from "@/components/GameRoom/HostControls";
import PendingApprovals from "@/components/GameRoom/PendingApprovals";
import AcquisitionPrompt from "@/components/GameRoom/AcquisitionPrompt";
import SettlementScreen from "@/components/Settlement/SettlementScreen";
import {
  addBuyIn,
  endGame,
  getGame,
  getGameSnapshot,
  leaveGame,
  removeBuyIn,
  removePlayer,
  subscribeToGame,
  updateBuyIn,
  transferHost,
  usingLocalStorage,
  verifyBuyIn,
} from "@/lib/data";
import { pendingPot, verifiedPot } from "@/lib/game";
import { getSessionId, setActiveGame } from "@/lib/session";
import type { GameSnapshot } from "@/lib/types";

function LoadingScreen() {
  return (
    <main
      role="status"
      aria-label="Loading game"
      className="flex min-h-screen items-center justify-center"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-gray-950" />
      <span className="sr-only">Loading game…</span>
    </main>
  );
}

function NotFoundScreen() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 sm:px-6">
      <Card padding="lg" className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Game not found
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Check the code and try again.
        </p>
        <Link
          href="/join"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-gray-950 px-6 text-sm font-medium text-white transition-colors duration-150 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
        >
          Find a game
        </Link>
      </Card>
    </main>
  );
}

export default function GameRoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const { toast } = useToast();

  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [joinDismissed, setJoinDismissed] = useState(false);
  const [ending, setEnding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ledgerAction, setLedgerAction] = useState<"buy-in" | "rebuy" | null>(null);
  const ledgerActionInFlight = useRef(false);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    if (!sessionId || !code) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function load() {
      try {
        const game = await getGame(code);
        if (cancelled) {
          return;
        }
        if (!game) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setActiveGame(code);

        const gameSnapshot = await getGameSnapshot(game.id);
        if (cancelled) {
          return;
        }
        setSnapshot(gameSnapshot);
        setLoading(false);

        unsubscribe = subscribeToGame(game.id, (next) => setSnapshot(next));
        if (cancelled) {
          unsubscribe();
          unsubscribe = null;
        }
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          const message =
            err instanceof Error
              ? err.message
              : "Failed to load the game. Please try again.";
          toast(message, "error");
        }
      }
    }

    setLoading(true);
    setNotFound(false);
    setSnapshot(null);
    setJoinDismissed(false);
    void load();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [code, sessionId, toast]);

  const currentPlayer = sessionId && snapshot
    ? snapshot.players.find((player) => player.session_id === sessionId) ?? null
    : null;
  const isHost = currentPlayer?.is_host === true;
  const leftGame = currentPlayer?.left_at != null;

  async function handleBuyIn(operationKey: string): Promise<boolean> {
    if (ledgerActionInFlight.current || !snapshot || !currentPlayer) {
      return false;
    }

    ledgerActionInFlight.current = true;
    setLedgerAction("buy-in");
    try {
      await addBuyIn(
        snapshot.game.id,
        currentPlayer.id,
        snapshot.game.buy_in_amount,
        "buy_in",
        null,
        operationKey
      );
      toast("Buy-in added", "success");
      return true;
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to add buy-in.",
        "error"
      );
      return false;
    } finally {
      ledgerActionInFlight.current = false;
      setLedgerAction(null);
    }
  }

  async function handleRebuy(
    amount: number,
    frontedByPlayerId: string | null,
    operationKey: string
  ): Promise<boolean> {
    if (ledgerActionInFlight.current || !snapshot || !currentPlayer) {
      return false;
    }

    ledgerActionInFlight.current = true;
    setLedgerAction("rebuy");
    try {
      await addBuyIn(
        snapshot.game.id,
        currentPlayer.id,
        amount,
        "rebuy",
        frontedByPlayerId,
        operationKey
      );
      toast(frontedByPlayerId ? "Fronted rebuy added" : "Rebuy added", "success");
      return true;
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to add rebuy.",
        "error"
      );
      return false;
    } finally {
      ledgerActionInFlight.current = false;
      setLedgerAction(null);
    }
  }

  async function handleLeave() {
    if (!currentPlayer) {
      return;
    }
    setLeaving(true);
    try {
      await leaveGame(currentPlayer.id);
      toast("You left the game");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to leave the game.",
        "error"
      );
    } finally {
      setLeaving(false);
    }
  }

  async function handleVerify(buyInId: string) {
    try {
      await verifyBuyIn(buyInId);
      toast("Buy-in verified", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to verify buy-in.",
        "error"
      );
    }
  }

  async function handleVerifyAll(buyInIds: string[]) {
    try {
      for (const buyInId of buyInIds) {
        await verifyBuyIn(buyInId);
      }
      toast(`${buyInIds.length} entries verified`, "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to verify every entry.",
        "error"
      );
    }
  }

  async function handleEdit(buyInId: string, amount: number) {
    try {
      await updateBuyIn(buyInId, amount);
      // Keep the initiating host responsive while the room-wide subscription
      // reconciles the authoritative snapshot and audit entry.
      setSnapshot((current) => current
        ? {
            ...current,
            buyIns: current.buyIns.map((buyIn) =>
              buyIn.id === buyInId ? { ...buyIn, amount } : buyIn
            ),
          }
        : current
      );
      toast("Buy-in updated", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to update buy-in.",
        "error"
      );
    }
  }

  async function handleRemoveBuyIn(buyInId: string) {
    try {
      await removeBuyIn(buyInId);
      toast("Buy-in removed");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to remove buy-in.",
        "error"
      );
    }
  }

  async function handleRemovePlayer(playerId: string) {
    try {
      await removePlayer(playerId);
      toast("Player removed");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to remove player.",
        "error"
      );
    }
  }

  async function handleEndGame() {
    if (!snapshot) {
      return;
    }
    setEnding(true);
    try {
      await endGame(snapshot.game.id);
      toast("Game ended — settling now");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to end the game.",
        "error"
      );
    } finally {
      setEnding(false);
    }
  }

  async function handleTransferHost(playerId: string) {
    if (!snapshot) return;
    try {
      await transferHost(snapshot.game.id, playerId);
      toast("Host controls transferred", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to transfer host controls.", "error");
    }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (notFound) {
    return <NotFoundScreen />;
  }

  if (!snapshot) {
    return <LoadingScreen />;
  }

  if (!currentPlayer && !joinDismissed) {
    return (
      <JoinPrompt code={code} onJoined={() => setJoinDismissed(true)} />
    );
  }

  if (snapshot.game.status !== "active") {
    return <SettlementScreen snapshot={snapshot} />;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-32 md:pb-16">
      <GameHeader
        game={snapshot.game}
        verifiedPot={verifiedPot(snapshot)}
        pendingPot={pendingPot(snapshot)}
        playerCount={snapshot.players.length}
        isLocalMode={usingLocalStorage()}
        isHost={isHost}
        onEndGame={handleEndGame}
        ending={ending}
      />

      {isHost ? <AcquisitionPrompt game={snapshot.game} /> : null}

      <div className="mt-7 space-y-8">
        <PendingApprovals
          snapshot={snapshot}
          isHost={isHost}
          onVerify={handleVerify}
          onVerifyAll={handleVerifyAll}
          onEdit={handleEdit}
          onRemove={handleRemoveBuyIn}
        />
        <PlayerList
          players={snapshot.players}
          snapshot={snapshot}
          currentPlayerId={currentPlayer?.id ?? null}
        />
        <ActivityFeed
          snapshot={snapshot}
          isHost={isHost}
          onEdit={handleEdit}
          onRemoveBuyIn={handleRemoveBuyIn}
          onRemovePlayer={handleRemovePlayer}
        />
        {isHost && currentPlayer ? (
          <HostControls players={snapshot.players} currentPlayerId={currentPlayer.id} onTransfer={handleTransferHost} />
        ) : null}
      </div>

      {currentPlayer && !leftGame ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl gap-2">
            <BuyInActions
              game={snapshot.game}
              players={snapshot.players}
              currentPlayerId={currentPlayer.id}
              hasBuyIn={snapshot.buyIns.some((buyIn) => buyIn.player_id === currentPlayer.id)}
              onBuyIn={handleBuyIn}
              onRebuy={handleRebuy}
              ledgerAction={ledgerAction}
              onLeave={handleLeave}
              leaving={leaving}
              left={false}
            />
          </div>
        </div>
      ) : null}

      {currentPlayer && leftGame ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-gray-50 p-3 text-center text-sm text-gray-500">
          You left this game.
        </div>
      ) : null}
    </main>
  );
}
