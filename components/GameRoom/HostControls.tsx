"use client";

import { Crown } from "lucide-react";
import { useMemo, useState } from "react";
import type { Player } from "@/lib/types";
import ConfirmButton from "./ConfirmButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";

interface HostControlsProps {
  players: Player[];
  currentPlayerId: string;
  onTransfer: (playerId: string) => Promise<void>;
}

export default function HostControls({ players, currentPlayerId, onTransfer }: HostControlsProps) {
  const candidates = useMemo(
    () => players.filter((player) => player.id !== currentPlayerId && !player.left_at),
    [players, currentPlayerId]
  );
  const [playerId, setPlayerId] = useState(candidates[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  if (!candidates.length) return null;

  const validPlayerId = candidates.some((player) => player.id === playerId)
    ? playerId
    : candidates[0].id;
  const selectedPlayer = candidates.find((player) => player.id === validPlayerId);

  return (
    <details className="group rounded-xl border border-gray-200 bg-white shadow-none">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-medium text-gray-800 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">
        <Crown aria-hidden size={17} className="text-gray-500" />
        <span className="flex-1">Host controls</span>
        <span className="text-xs font-normal text-gray-500 group-open:hidden">Transfer host if you leave early</span>
        <span aria-hidden className="text-gray-400 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-gray-100 p-4">
        <p className="mb-3 text-sm leading-6 text-gray-600">
          Transfer control to another player. You will immediately lose host-only actions.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="next-host" className="mb-1.5 block text-sm font-medium text-gray-900">Pass host controls</label>
            <Select value={validPlayerId} onValueChange={setPlayerId}>
              <SelectTrigger id="next-host" className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {candidates.map((player) => <SelectItem key={player.id} value={player.id}>{player.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ConfirmButton
            variant="secondary"
            confirmVariant="secondary"
            loading={loading}
            confirmationTitle={`Make ${selectedPlayer?.name ?? "this player"} the host?`}
            confirmationDescription="You will immediately lose host-only controls. The new host can manage the ledger and end the game."
            confirmLabel="Transfer host"
            onConfirm={async () => {
              setLoading(true);
              try { await onTransfer(validPlayerId); } finally { setLoading(false); }
            }}
          >
            Make host
          </ConfirmButton>
        </div>
      </div>
    </details>
  );
}
