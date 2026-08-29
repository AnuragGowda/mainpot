"use client";

import type { GameSnapshot, Player } from "@/lib/types";
import Card from "@/components/ui/Card";
import { getPlayerBuyIns, playerInvested } from "@/lib/game";
import PlayerCard from "./PlayerCard";

export interface PlayerListProps {
  players: Player[];
  snapshot: GameSnapshot;
  isHost: boolean;
  currentPlayerId: string | null;
  onVerify: (buyInId: string) => void;
  onEdit: (buyInId: string, amount: number) => void;
  onRemoveBuyIn: (buyInId: string) => void;
  onRemovePlayer: (playerId: string) => void;
}

export default function PlayerList({
  players,
  snapshot,
  isHost,
  currentPlayerId,
  onVerify,
  onEdit,
  onRemoveBuyIn,
  onRemovePlayer,
}: PlayerListProps) {
  if (players.length === 0) {
    return (
      <Card padding="md" className="text-center">
        <h2 className="font-semibold text-gray-900">No players yet</h2>
        <p className="mt-1 text-sm text-gray-500">
          Share the room code to invite friends.
        </p>
      </Card>
    );
  }

  return (
    <section aria-label="Players" className="space-y-3">
      {players.map((player) => (
        <PlayerCard
          key={player.id}
          player={player}
          buyIns={getPlayerBuyIns(snapshot, player.id)}
          invested={playerInvested(snapshot, player.id)}
          isCurrentUser={player.id === currentPlayerId}
          isHost={isHost}
          game={snapshot.game}
          onVerify={onVerify}
          onEdit={onEdit}
          onRemoveBuyIn={onRemoveBuyIn}
          onRemovePlayer={onRemovePlayer}
        />
      ))}
    </section>
  );
}