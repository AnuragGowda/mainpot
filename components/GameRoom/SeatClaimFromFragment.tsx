"use client";

import { useEffect, useState } from "react";
import { claimHostManagedSeat, clearSeatClaimFragment, seatClaimFromFragment } from "@/lib/seat-claim";

/**
 * Claims a #seat capability after the room loads. The fragment remains in the
 * address bar on every failure so a user can retry without asking the host for
 * a new link; it is cleared only after the refreshed snapshot confirms success.
 */
export default function SeatClaimFromFragment({
  gameId,
  code,
  onClaimed,
}: {
  gameId: string;
  code: string;
  onClaimed: (gameId: string) => Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "claiming" | "claimed" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = seatClaimFromFragment();
    if (!token) return;
    let cancelled = false;
    setState("claiming");
    void claimHostManagedSeat(gameId, token)
      .then(async (claim) => {
        await onClaimed(gameId);
        if (cancelled) return;
        clearSeatClaimFragment();
        setState("claimed");
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Could not claim this seat.");
        setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [code, gameId, onClaimed]);

  if (state === "idle") return null;
  if (state === "claiming") return <p role="status" className="text-sm text-gray-600">Claiming your recorded seat…</p>;
  if (state === "claimed") return <p role="status" className="text-sm font-medium text-green-800">Your recorded seat is ready.</p>;
  return <p role="alert" className="text-sm font-medium text-red-700">{error}</p>;
}
