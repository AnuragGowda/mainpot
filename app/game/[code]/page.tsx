"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import GameHeader from "@/components/GameRoom/GameHeader";
import PlayerList from "@/components/GameRoom/PlayerList";
import ActivityFeed from "@/components/GameRoom/ActivityFeed";
import BuyInActions from "@/components/GameRoom/BuyInActions";
import JoinPrompt from "@/components/GameRoom/JoinPrompt";
import HostLeaveButton from "@/components/GameRoom/HostLeaveButton";
import PendingApprovals from "@/components/GameRoom/PendingApprovals";
import OutstandingAdvances from "@/components/GameRoom/OutstandingAdvances";
import EarlyCashOutButton from "@/components/GameRoom/EarlyCashOutButton";
import EarlyCashOuts from "@/components/GameRoom/EarlyCashOuts";
import AcquisitionPrompt from "@/components/GameRoom/AcquisitionPrompt";
import GameNotifications from "@/components/GameRoom/GameNotifications";
import PwaInstallCard from "@/components/PwaInstallCard";
import SettlementScreen from "@/components/Settlement/SettlementScreen";
import {
  addBuyIn,
  approveEarlyCashOut,
  cancelEarlyCashOut,
  endGame,
  getGame,
  getGameSnapshot,
  leaveGame,
  removeBuyIn,
  removePlayer,
  requestEarlyCashOut,
  markBuyInAdvanceRepaid,
  subscribeToGame,
  updateBuyIn,
  transferHostAndLeave,
  type GameSyncStatus,
  usingLocalStorage,
  verifyBuyIn,
} from "@/lib/data";
import { pendingPot, verifiedPot } from "@/lib/game";
import { navigateToFreshAppPage } from "@/lib/navigation";
import { getSessionId, setActiveGame } from "@/lib/session";
import type { GameSnapshot, GameStatus } from "@/lib/types";
import { classifyProductOpsFailure, trackProductOpsEvent } from "@/lib/product-ops";

function LoadingScreen() {
  return (
    <main tabIndex={-1} id="main-content"
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
    <main tabIndex={-1} id="main-content" className="flex min-h-screen flex-col items-center justify-center px-4 py-16 sm:px-6">
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

function GameLoadErrorScreen({ message }: { message: string }) {
  return (
    <main tabIndex={-1} id="main-content" className="flex min-h-screen flex-col items-center justify-center px-4 py-16 sm:px-6">
      <Card padding="lg" className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Couldn’t load this game
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">{message}</p>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          Your game is still saved. Reload it or return to setup to resume it.
        </p>
        <div className="mt-6 grid gap-3">
          <Button fullWidth onClick={() => window.location.reload()}>
            Reload game
          </Button>
          <Button fullWidth variant="secondary" onClick={() => navigateToFreshAppPage("/create")}>
            Back to game setup
          </Button>
        </div>
      </Card>
    </main>
  );
}

function SyncStatusNotice({
  status,
  onRetry,
}: {
  status: GameSyncStatus;
  onRetry: () => void;
}) {
  if (status === "connected") return null;

  const offline = status === "offline";
  const waiting = status === "connecting" || status === "reconnecting";
  const message = offline
    ? "You’re offline. Changes will appear after you reconnect."
    : status === "stale"
      ? "Live updates paused. The last visible totals may be out of date."
      : "Reconnecting to live updates…";

  return (
    <div className="fixed inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-[60] mx-auto max-w-xl">
      <div
        role="status"
        className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur ${
          offline || status === "stale"
            ? "border-amber-300 bg-amber-50/95 text-amber-950"
            : "border-gray-300 bg-white/95 text-gray-700"
        }`}
      >
        <span>{message}</span>
        {!waiting ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-current px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function GameRoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const { toast } = useToast();

  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] =
    useState<GameSyncStatus>("connecting");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ledgerAction, setLedgerAction] = useState<"buy-in" | "rebuy" | null>(
    null,
  );
  const ledgerActionInFlight = useRef(false);
  const previousHostStateRef = useRef<{
    gameId: string;
    playerId: string;
    isHost: boolean;
  } | null>(null);
  const previousGameStatusRef = useRef<{
    gameId: string;
    status: GameStatus;
  } | null>(null);
  const currentPlayerRef = useRef(false);
  const isHostRef = useRef(false);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    const handleOffline = () => setSyncStatus("offline");
    const handleOnline = () => setSyncStatus("reconnecting");
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!sessionId || !code) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function load() {
      let journeyId: string | undefined;
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
        journeyId = game.id;

        const gameSnapshot = await getGameSnapshot(game.id);
        if (cancelled) {
          return;
        }
        setSnapshot(gameSnapshot);
        previousGameStatusRef.current = {
          gameId: gameSnapshot.game.id,
          status: gameSnapshot.game.status,
        };
        setLoading(false);

        unsubscribe = subscribeToGame(
          game.id,
          (next) => {
            const previous = previousGameStatusRef.current;
            previousGameStatusRef.current = {
              gameId: next.game.id,
              status: next.game.status,
            };
            if (
              previous?.gameId === next.game.id
              && previous.status !== next.game.status
              && currentPlayerRef.current
              && !isHostRef.current
            ) {
              if (next.game.status === "settling") {
                toast("Game ended — starting settlement.");
              } else if (next.game.status === "ended") {
                toast("Final settlement is ready to review.", "success");
              }
            }
            setSnapshot(next);
          },
          {
            onStatusChange: (status) => {
              if (!cancelled) setSyncStatus(status);
            },
          },
        );
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
          setLoadError(message);
          trackProductOpsEvent(
            "game.room_load_failed",
            {
              reason: classifyProductOpsFailure(err),
              storage_mode: usingLocalStorage() ? "local_storage" : "supabase",
            },
            journeyId,
          );
          toast(message, "error");
        }
      }
    }

    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    setSnapshot(null);
    previousGameStatusRef.current = null;
    setSyncStatus("connecting");
    void load();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [code, sessionId, toast]);

  const currentPlayer =
    sessionId && snapshot
      ? (snapshot.players.find((player) => player.session_id === sessionId) ??
        null)
      : null;
  const isHost = currentPlayer?.is_host === true;
  const leftGame = currentPlayer?.left_at != null;
  const currentEarlyCashOut = currentPlayer
    ? snapshot?.earlyCashOuts.find(
        (item) => item.player_id === currentPlayer.id && item.status !== "cancelled"
      ) ?? null
    : null;

  useEffect(() => {
    currentPlayerRef.current = Boolean(currentPlayer);
    isHostRef.current = isHost;
  }, [currentPlayer, isHost]);

  useEffect(() => {
    if (!snapshot || !currentPlayer) {
      previousHostStateRef.current = null;
      return;
    }

    const previous = previousHostStateRef.current;
    if (
      previous?.gameId === snapshot.game.id
      && previous.playerId === currentPlayer.id
      && !previous.isHost
      && isHost
    ) {
      toast(
        "You're the host now — you can manage the ledger and end the game.",
        "success",
      );
    }

    previousHostStateRef.current = {
      gameId: snapshot.game.id,
      playerId: currentPlayer.id,
      isHost,
    };
  }, [currentPlayer, isHost, snapshot, toast]);

  const handleJoined = useCallback(async (gameId: string) => {
    setSnapshot(await getGameSnapshot(gameId));
  }, []);

  const handleRetrySync = useCallback(async () => {
    if (!snapshot) return;
    setSyncStatus("connecting");
    try {
      setSnapshot(await getGameSnapshot(snapshot.game.id));
      setSyncStatus("connected");
    } catch (err) {
      setSyncStatus(navigator.onLine ? "stale" : "offline");
      toast(
        err instanceof Error ? err.message : "Could not refresh the game.",
        "error",
      );
    }
  }, [snapshot, toast]);

  async function handleBuyIn(
    frontedByPlayerId: string | null,
    operationKey: string,
  ): Promise<boolean> {
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
        frontedByPlayerId,
        operationKey,
      );
      toast(
        frontedByPlayerId ? "Buy-in and outstanding advance added" : "Buy-in added",
        "success",
      );
      return true;
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to add buy-in.",
        "error",
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
    operationKey: string,
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
        operationKey,
      );
      toast(
        frontedByPlayerId ? "Rebuy and outstanding advance added" : "Rebuy added",
        "success",
      );
      return true;
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to add rebuy.",
        "error",
      );
      return false;
    } finally {
      ledgerActionInFlight.current = false;
      setLedgerAction(null);
    }
  }

  async function handleLeave(nextHostId?: string) {
    if (!currentPlayer) {
      return;
    }
    setLeaving(true);
    try {
      if (nextHostId && snapshot) {
        await transferHostAndLeave(snapshot.game.id, currentPlayer.id, nextHostId);
        toast("Host transferred — you left the game", "success");
      } else {
        await leaveGame(currentPlayer.id);
        toast("You left the game");
      }
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to leave the game.",
        "error",
      );
    } finally {
      setLeaving(false);
    }
  }

  async function handleRequestEarlyCashOut(amount: number): Promise<boolean> {
    if (!snapshot || !currentPlayer) return false;
    try {
      await requestEarlyCashOut(snapshot.game.id, currentPlayer.id, amount);
      toast("Cash-out sent to the host", "success");
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not request the early cash-out.", "error");
      return false;
    }
  }

  async function handleApproveEarlyCashOut(earlyCashOutId: string): Promise<void> {
    try {
      await approveEarlyCashOut(earlyCashOutId);
      toast("Early cash-out locked — payment is ready", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not approve the early cash-out.", "error");
    }
  }

  async function handleCancelEarlyCashOut(earlyCashOutId: string): Promise<void> {
    try {
      await cancelEarlyCashOut(earlyCashOutId);
      toast(isHost ? "Early cash-out declined" : "Early cash-out cancelled");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not cancel the early cash-out.", "error");
    }
  }

  async function handleVerify(buyInId: string) {
    try {
      await verifyBuyIn(buyInId);
      toast("Buy-in verified", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to verify buy-in.",
        "error",
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
        "error",
      );
    }
  }

  async function handleEdit(buyInId: string, amount: number) {
    try {
      await updateBuyIn(buyInId, amount);
      // Keep the initiating host responsive while the room-wide subscription
      // reconciles the authoritative snapshot and audit entry.
      setSnapshot((current) =>
        current
          ? {
              ...current,
              buyIns: current.buyIns.map((buyIn) =>
                buyIn.id === buyInId ? { ...buyIn, amount } : buyIn,
              ),
            }
          : current,
      );
      toast("Buy-in updated", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to update buy-in.",
        "error",
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
        "error",
      );
    }
  }

  async function handleMarkAdvanceRepaid(buyInId: string) {
    try {
      await markBuyInAdvanceRepaid(buyInId);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              buyIns: current.buyIns.map((buyIn) =>
                buyIn.id === buyInId
                  ? { ...buyIn, fronted_by_player_id: null }
                  : buyIn,
              ),
            }
          : current,
      );
      toast("Advance marked repaid", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to mark the advance repaid.",
        "error",
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
        "error",
      );
    }
  }

  async function handleHostPlayerSaved() {
    if (!snapshot) return;
    try {
      setSnapshot(await getGameSnapshot(snapshot.game.id));
      toast("Table updated", "success");
    } catch {
      toast("Entry saved. Reconnecting to refresh the table.");
      setSyncStatus("stale");
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
        "error",
      );
    } finally {
      setEnding(false);
    }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (notFound) {
    return <NotFoundScreen />;
  }

  if (loadError) {
    return <GameLoadErrorScreen message={loadError} />;
  }

  if (!snapshot) {
    return <LoadingScreen />;
  }

  if (!currentPlayer) {
    return (
      <JoinPrompt
        game={snapshot.game}
        onJoined={handleJoined}
      />
    );
  }

  if (snapshot.game.status !== "active") {
    return (
      <>
        <SyncStatusNotice status={syncStatus} onRetry={handleRetrySync} />
        <SettlementScreen snapshot={snapshot} />
      </>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 pb-32 focus:outline-none md:pb-24">
      <SyncStatusNotice status={syncStatus} onRetry={handleRetrySync} />
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

      <PwaInstallCard gameCode={snapshot.game.code} />

      {currentPlayer && !leftGame ? (
        <GameNotifications
          isHost={isHost}
        />
      ) : null}

      <div className="mt-7 space-y-8">
        <PendingApprovals
          snapshot={snapshot}
          isHost={isHost}
          onVerify={handleVerify}
          onVerifyAll={handleVerifyAll}
          onEdit={handleEdit}
          onRemove={handleRemoveBuyIn}
        />
        <EarlyCashOuts
          snapshot={snapshot}
          currentPlayerId={currentPlayer.id}
          isHost={isHost}
          onApprove={handleApproveEarlyCashOut}
          onCancel={handleCancelEarlyCashOut}
        />
        <OutstandingAdvances
          snapshot={snapshot}
          isHost={isHost}
          onMarkRepaid={handleMarkAdvanceRepaid}
        />
        <PlayerList
          players={snapshot.players}
          snapshot={snapshot}
          currentPlayerId={currentPlayer?.id ?? null}
          onHostPlayerSaved={handleHostPlayerSaved}
        />
        <ActivityFeed
          snapshot={snapshot}
          isHost={isHost}
          onEdit={handleEdit}
          onRemoveBuyIn={handleRemoveBuyIn}
          onRemovePlayer={handleRemovePlayer}
        />
        {isHost ? <AcquisitionPrompt game={snapshot.game} /> : null}
      </div>

      {currentPlayer && !leftGame && currentEarlyCashOut?.status !== "requested" ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl gap-2">
            <BuyInActions
              game={snapshot.game}
              players={snapshot.players}
              currentPlayerId={currentPlayer.id}
              hasBuyIn={snapshot.buyIns.some(
                (buyIn) => buyIn.player_id === currentPlayer.id,
              )}
              onBuyIn={handleBuyIn}
              onRebuy={handleRebuy}
              ledgerAction={ledgerAction}
              onLeave={handleLeave}
              leaving={leaving}
              left={false}
              leaveAction={isHost ? (
                <HostLeaveButton
                  players={snapshot.players}
                  currentPlayerId={currentPlayer.id}
                  leaving={leaving}
                  onConfirm={handleLeave}
                />
              ) : snapshot.buyIns.some((buyIn) => buyIn.player_id === currentPlayer.id) ? (
                <EarlyCashOutButton
                  snapshot={snapshot}
                  currentPlayerId={currentPlayer.id}
                  leaving={leaving}
                  onRequest={handleRequestEarlyCashOut}
                  onLeaveWithoutCashOut={handleLeave}
                />
              ) : undefined}
            />
          </div>
        </div>
      ) : null}

      {currentPlayer && !leftGame && currentEarlyCashOut?.status === "requested" ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-amber-200 bg-amber-50/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-center text-sm font-medium text-amber-950 backdrop-blur">
          Waiting for {snapshot.game.host_name} to confirm your early cash-out.
        </div>
      ) : null}

      {currentPlayer && leftGame ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-gray-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-center text-sm text-gray-500">
          {currentEarlyCashOut?.status === "locked"
            ? "You cashed out early. Your payment record is above."
            : "You left this game."}
        </div>
      ) : null}

    </main>
  );
}
