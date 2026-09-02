"use client";

import type { GameSnapshot, Player } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
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
}

export default function PlayerList({ players, snapshot, currentPlayerId }: PlayerListProps) {
  if (!players.length) {
    return <Card className="text-center text-sm text-gray-500">Share the room code to invite players.</Card>;
  }

  return (
    <section aria-labelledby="table-heading">
      <div className="mb-3">
        <h2 id="table-heading" className="text-base font-semibold text-gray-950">At the table</h2>
        <p className="text-sm text-gray-500">Verified buy-ins by player.</p>
      </div>
      <Card padding="none" className="overflow-hidden rounded-xl shadow-none">
        <ul className="divide-y divide-gray-100">
          {players.map((player) => {
            const buyIns = getPlayerBuyIns(snapshot, player.id);
            const verified = playerVerifiedInvested(snapshot, player.id);
            const pending = playerPendingAmount(snapshot, player.id);
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
                    {player.left_at ? <Badge variant="amber" className="px-1.5 py-0.5 text-[10px] leading-none">Left</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {buyIns.length} {buyIns.length === 1 ? "entry" : "entries"}
                    {pending > 0 ? ` · ${formatCurrency(pending)} pending` : ""}
                  </p>
                  {advances.map((advance) => (
                    <p key={advance.name} className="mt-1 text-xs font-medium text-amber-700">
                      {advance.name} covered {formatCurrency(advance.amount)} · settled separately
                    </p>
                  ))}
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-gray-950">{formatCurrency(verified)}</p>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
