"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { copyText } from "@/lib/clipboard";
import { mintHostManagedSeatClaim, seatClaimUrl } from "@/lib/seat-claim";
import type { Player } from "@/lib/types";

/** Host-only control for handing a pre-entered, active managed seat to its person. */
export default function HostManagedSeatClaimLink({
  gameId,
  gameCode,
  player,
}: {
  gameId: string;
  gameCode: string;
  player: Player;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const eligible = !player.is_host && !player.left_at && !player.user_id && !player.session_id;
  if (!eligible) return null;

  async function createLink() {
    setBusy(true);
    setMessage(null);
    try {
      const claim = await mintHostManagedSeatClaim(gameId, player.id);
      const nextLink = seatClaimUrl(gameCode, claim.token);
      setLink(nextLink);
      setExpiresAt(claim.expiresAt);
      await copyText(nextLink);
      setMessage("Seat link copied. It can be used once within 15 minutes.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the seat link.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await copyText(link);
      setMessage("Seat link copied.");
    } catch {
      setMessage("Could not copy the seat link.");
    }
  }

  async function shareLink() {
    if (!link) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Mainpot seat for ${player.name}`, text: "Use this private link to claim your recorded seat.", url: link });
        setMessage("Seat link shared.");
      } else {
        await copyLink();
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setMessage("Could not share the seat link.");
    }
  }

  return (
    <section className="mt-4 border-t border-gray-200 pt-4" aria-label={`Seat link for ${player.name}`}>
      <p className="text-sm font-medium text-gray-900">Hand this seat to {player.name}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">Send this private link only to this player. It keeps their existing buy-ins and expires after 15 minutes.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => void createLink()}>
          {link ? "Replace seat link" : "Create seat link"}
        </Button>
        {link ? <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void copyLink()}>Copy seat link</Button> : null}
        {link ? <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void shareLink()}>Share seat link</Button> : null}
      </div>
      {link ? (
        <div className="mt-3 space-y-2">
          <textarea
            aria-label="Seat link"
            className="w-full resize-none break-all rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700"
            readOnly
            rows={3}
            value={link}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => { setLink(null); setExpiresAt(null); setMessage(null); }}>
            Close seat link
          </Button>
        </div>
      ) : null}
      {expiresAt ? <p className="mt-2 text-xs text-gray-500">Expires {new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.</p> : null}
      {message ? <p role="status" className="mt-2 text-xs font-medium text-gray-700">{message}</p> : null}
    </section>
  );
}
