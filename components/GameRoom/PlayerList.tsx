"use client";

import { useState } from "react";
import type { GameSnapshot, Player } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { AddHostPlayerButton, HostPlayerActions } from "./HostPlayerControls";
import { formatCurrency } from "@/lib/format";
import {
  getPlayerBuyIns,
  playerPendingAmount,
  playerVerifiedInvested,
} from "@/lib/game";

export interface PlayerListProps {
  players: Player[];
  snapshot: GameSnapshot;
  currentPlayerId: string | null;
  onHostPlayerSaved?: () => Promise<void>;
}

const COLLAPSE_AFTER = 10;

export default function PlayerList({ players, snapshot, currentPlayerId, onHostPlayerSaved }: PlayerListProps) {
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const canManage = snapshot.game.status === "active" && players.some((player) => player.id === currentPlayerId && player.is_host && !player.left_at);

  if (!players.length) {
    return <Card className="text-center text-sm text-gray-500">Share the room code to invite players.</Card>;
  }

  const priorityPlayerIds = new Set(
    players
      .filter((player) => player.is_host || player.id === currentPlayerId || playerPendingAmount(snapshot, player.id) > 0)
      .map((player) => player.id),
  );
  const visiblePlayerIds = new Set([
    ...players.slice(0, COLLAPSE_AFTER).map((player) => player.id),
    ...priorityPlayerIds,
  ]);
  const visiblePlayers = showAllPlayers ? players : players.filter((player) => visiblePlayerIds.has(player.id));
  const hiddenPlayerCount = players.length - visiblePlayers.length;

  return (
    <section aria-labelledby="table-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
        <h2 id="table-heading" className="text-base font-semibold text-gray-950">At the table</h2>
        <p className="text-sm text-gray-500">Verified buy-ins by player.</p>
        </div>
        {canManage && onHostPlayerSaved ? <AddHostPlayerButton snapshot={snapshot} onSaved={onHostPlayerSaved} /> : null}
      </div>
      <Card padding="none" className="overflow-hidden rounded-xl shadow-none">
        <ul id="player-list" className="divide-y divide-gray-100">
          {visiblePlayers.map((player) => {
            const buyIns = getPlayerBuyIns(snapshot, player.id);
            const verified = playerVerifiedInvested(snapshot, player.id);
            const pending = playerPendingAmount(snapshot, player.id);
            const earlyCashOutLocked = snapshot.earlyCashOuts.some(
              (item) => item.player_id === player.id && item.status === "locked"
            );
            const advances = buyIns.reduce<{ name: string; amount: number }[]>((current, buyIn) => {
              if (!buyIn.fronted_by_player_id || buyIn.fronted_by_player_id === player.id) return current;
              const lender = players.find((item) => item.id === buyIn.fronted_by_player_id);
              if (!lender) return current;
              const existing = current.find((advance) => advance.name === lender.name);
              if (existing) {
                existing.amount += buyIn.amount;
              } else {
                current.push({ name: lender.name, amount: buyIn.amount });
              }
              return current;
            }, []);
            return (
              <li key={player.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                  {player.name.trim().slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-gray-900">{player.name}</p>
                    {player.is_host ? <Badge variant="gray" className="px-1.5 py-0.5 text-[10px] leading-none">Host</Badge> : null}
                    {player.id === currentPlayerId ? <Badge variant="green" className="px-1.5 py-0.5 text-[10px] leading-none">You</Badge> : null}
                    {earlyCashOutLocked
                      ? <Badge variant="gray" className="px-1.5 py-0.5 text-[10px] leading-none">Cashed out</Badge>
                      : player.left_at
                        ? <Badge variant="amber" className="px-1.5 py-0.5 text-[10px] leading-none">Left</Badge>
                        : null}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {buyIns.length} {buyIns.length === 1 ? "entry" : "entries"}
                    {pending > 0 ? ` · ${formatCurrency(pending)} pending` : ""}
                    {player.session_id === null ? " · Host-managed" : ""}
                  </p>
                  {advances.map((advance) => (
                    <p key={advance.name} className="mt-1 text-xs font-medium text-amber-700">
                      Still owes {advance.name} {formatCurrency(advance.amount)} · included at settlement
                    </p>
                  ))}
                </div>
                <div className="flex shrink-0 flex-col items-end">
                <p className="font-semibold tabular-nums text-gray-950">{formatCurrency(verified)}</p>
                {canManage && onHostPlayerSaved && player.id !== currentPlayerId && !earlyCashOutLocked ? (
                  <HostPlayerActions snapshot={snapshot} player={player} onSaved={onHostPlayerSaved} />
                ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {hiddenPlayerCount > 0 ? (
          <div className="border-t border-gray-100 p-2 sm:px-3">
            <button
              type="button"
              aria-expanded={showAllPlayers}
              aria-controls="player-list"
              onClick={() => setShowAllPlayers((current) => !current)}
              className="min-h-11 w-full rounded-lg px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
            >
              Show all players ({players.length})
            </button>
          </div>
        ) : null}
        {showAllPlayers && players.length > COLLAPSE_AFTER ? (
          <div className="border-t border-gray-100 p-2 sm:px-3">
            <button
              type="button"
              aria-expanded="true"
              aria-controls="player-list"
              onClick={() => setShowAllPlayers(false)}
              className="min-h-11 w-full rounded-lg px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
            >
              Show fewer players
            </button>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
