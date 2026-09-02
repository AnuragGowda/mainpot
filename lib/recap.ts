import type { PlayerNet, Transfer } from "./settlement";
import type { GameSnapshot } from "./types";

export type RecapMode = "summary" | "leaderboard" | "full";

/** A portable representation of a finished game, suitable for future recap types. */
export interface RecapData {
  gameId: string;
  gameName: string;
  playedAt: string;
  playerCount: number;
  durationMinutes?: number;
  totalBuyIn: number;
  rebuyCount: number;
  settlementPaymentCount: number;
  players: RecapPlayer[];
  highlights: Array<{ label: string; value: string }>;
}

export interface RecapPlayer {
  id: string;
  displayName: string;
  net: number;
  rank: number;
  rebuyCount: number;
}

/** Presentation preferences are deliberately independent from the game record. */
export interface RecapPrivacy {
  showDollarAmounts: boolean;
  showPlayerNames: boolean;
  showLosses: boolean;
  hiddenPlayerIds: string[];
}

export interface RecapDisplayPlayer extends RecapPlayer {
  displayLabel: string;
  showNet: boolean;
}

export const defaultRecapPrivacy: RecapPrivacy = {
  showDollarAmounts: true,
  showPlayerNames: false,
  showLosses: true,
  hiddenPlayerIds: [],
};

function durationInMinutes(snapshot: GameSnapshot): number | undefined {
  const startedAt = new Date(snapshot.game.created_at).getTime();
  const endedAt = snapshot.game.ended_at
    ? new Date(snapshot.game.ended_at).getTime()
    : Number.NaN;

  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    return undefined;
  }

  return Math.round((endedAt - startedAt) / 60_000);
}

/**
 * Normalizes the canonical snapshot and already-calculated settlement into
 * presentation-ready data without changing either source.
 */
export function deriveRecapData(
  snapshot: GameSnapshot,
  nets: PlayerNet[],
  transfers: Transfer[]
): RecapData {
  const rebuyCounts = new Map<string, number>();
  for (const buyIn of snapshot.buyIns) {
    if (buyIn.type === "rebuy") {
      rebuyCounts.set(buyIn.player_id, (rebuyCounts.get(buyIn.player_id) ?? 0) + 1);
    }
  }

  const sortedNets = [...nets].sort(
    (left, right) => right.net - left.net || left.name.localeCompare(right.name)
  );
  let previousNet: number | undefined;
  let previousRank = 0;
  const players = sortedNets.map((player, index) => {
    const rank = previousNet === player.net ? previousRank : index + 1;
    previousNet = player.net;
    previousRank = rank;
    return {
      id: player.playerId,
      displayName: player.name,
      net: player.net,
      rank,
      rebuyCount: rebuyCounts.get(player.playerId) ?? 0,
    };
  });

  const rebuyCount = snapshot.buyIns.filter((buyIn) => buyIn.type === "rebuy").length;
  const durationMinutes = durationInMinutes(snapshot);
  const highlights: RecapData["highlights"] = [];
  if (durationMinutes) {
    highlights.push({ label: "Session", value: formatDuration(durationMinutes) });
  }
  if (rebuyCount > 0) {
    highlights.push({ label: "Rebuys", value: String(rebuyCount) });
  }

  return {
    gameId: snapshot.game.id,
    gameName: snapshot.game.name,
    playedAt: snapshot.game.ended_at ?? snapshot.game.created_at,
    playerCount: snapshot.players.length,
    ...(durationMinutes ? { durationMinutes } : {}),
    totalBuyIn: snapshot.buyIns.reduce((sum, buyIn) => sum + buyIn.amount, 0),
    rebuyCount,
    settlementPaymentCount: transfers.length,
    players,
    highlights,
  };
}

/** Applies privacy at render time. Raw recap data remains untouched. */
export function getRecapDisplayPlayers(
  data: RecapData,
  privacy: RecapPrivacy
): RecapDisplayPlayer[] {
  return data.players
    .filter((player) => !privacy.hiddenPlayerIds.includes(player.id))
    .filter((player) => privacy.showLosses || player.net >= -0.005)
    .map((player, index) => ({
      ...player,
      displayLabel: privacy.showPlayerNames ? player.displayName : `Player ${index + 1}`,
      showNet: privacy.showDollarAmounts && (privacy.showLosses || player.net >= -0.005),
    }));
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}
