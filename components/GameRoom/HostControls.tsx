"use client";

import { Crown } from "lucide-react";
import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { Player } from "@/lib/types";

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

  return (
    <Card padding="sm" className="flex flex-col gap-3 shadow-none sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label htmlFor="next-host" className="text-sm font-medium text-gray-900">Pass host controls</label>
        <p className="mb-2 text-xs text-gray-500">Useful if you leave early. This takes effect immediately.</p>
        <select id="next-host" value={validPlayerId} onChange={(event) => setPlayerId(event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-950/10">
          {candidates.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
        </select>
      </div>
      <Button
        variant="secondary"
        loading={loading}
        leftIcon={<Crown size={16} />}
        onClick={async () => {
          setLoading(true);
          try { await onTransfer(validPlayerId); } finally { setLoading(false); }
        }}
      >
        Make host
      </Button>
    </Card>
  );
}
