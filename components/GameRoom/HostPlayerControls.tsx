"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { UserPlus } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { addBuyIn, addHostPlayer, requestEarlyCashOut } from "@/lib/data";
import { formatCurrency, round2 } from "@/lib/format";
import { playerVerifiedInvested } from "@/lib/game";
import { PLAYER_NAME_MAX_LENGTH } from "@/lib/name-validation";
import { randomUUID } from "@/lib/session";
import { calculateEarlyCashOutNet } from "@/lib/settlement";
import type { GameSnapshot, Player } from "@/lib/types";

function numericAmount(value: string) {
  const [whole, ...fraction] = value.replace(/[^0-9.]/g, "").split(".");
  return fraction.length ? `${whole}.${fraction.join("")}` : whole;
}

function PlayerSheet({ title, description, busy, error, submitLabel, onSubmit, onClose, children }: {
  title: string;
  description: string;
  busy: boolean;
  error: string;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    element?.querySelector("input")?.focus();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return createPortal(
    <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[calc(100dvh-1rem)] w-full max-w-none overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-gray-950 shadow-2xl backdrop:bg-gray-950/45 backdrop:backdrop-blur-sm sm:inset-0 sm:m-auto sm:max-w-sm sm:rounded-2xl sm:p-6">
      <h2 id={titleId} className="text-xl font-semibold tracking-tight">{title}</h2>
      <p id={descriptionId} className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        {children}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-2 pt-2 sm:grid-cols-2">
          <Button type="submit" fullWidth loading={busy} className="sm:order-2">{submitLabel}</Button>
          <Button type="button" variant="secondary" fullWidth disabled={busy} onClick={onClose} className="sm:order-1">Cancel</Button>
        </div>
      </form>
    </dialog>, document.body,
  );
}

export function AddHostPlayerButton({ snapshot, onSaved }: { snapshot: GameSnapshot; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      <UserPlus aria-hidden="true" className="mr-1.5 h-4 w-4" />Add player
    </Button>
    {open ? <AddPlayerForm snapshot={snapshot} onSaved={onSaved} onClose={() => setOpen(false)} /> : null}
  </>;
}

function AddPlayerForm({ snapshot, onSaved, onClose }: { snapshot: GameSnapshot; onSaved: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(String(snapshot.game.buy_in_amount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ signature: string; key: string } | null>(null);
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!amount.trim()) { setError("Enter an opening buy-in, or 0 to add it later."); return; }
    inFlight.current = true;
    setBusy(true);
    setError("");
    const signature = JSON.stringify([name.trim(), round2(Number(amount))]);
    if (request.current?.signature !== signature) request.current = { signature, key: randomUUID() };
    try {
      await addHostPlayer(snapshot.game.id, name, Number(amount), request.current.key);
      // A refresh failure must not offer to submit an already-committed player again.
      onClose();
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the player. Try again.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <PlayerSheet title="Add a player" description="You’ll manage their entries. They don’t need a phone or account."
    busy={busy} error={error} submitLabel="Add player" onSubmit={submit} onClose={onClose}>
    <Input label="Player name" value={name} onChange={(event) => setName(event.target.value)} maxLength={PLAYER_NAME_MAX_LENGTH} autoComplete="off" disabled={busy} />
    <Input label="Opening buy-in" prefix="$" inputMode="decimal" value={amount} onChange={(event) => setAmount(numericAmount(event.target.value))} disabled={busy} />
    <p className="text-xs leading-5 text-gray-500">Recorded as host-confirmed. Enter 0 if they haven’t bought in yet.</p>
  </PlayerSheet>;
}

export function HostPlayerActions({ snapshot, player, onSaved }: { snapshot: GameSnapshot; player: Player; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  if (player.left_at) return null;
  return <>
    <button type="button" aria-label={`Manage ${player.name}`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950">
      Manage
    </button>
    {open ? <ManagePlayerForm snapshot={snapshot} player={player} onSaved={onSaved} onClose={() => setOpen(false)} /> : null}
  </>;
}

function ManagePlayerForm({ snapshot, player, onSaved, onClose }: { snapshot: GameSnapshot; player: Player; onSaved: () => Promise<void>; onClose: () => void }) {
  const [mode, setMode] = useState<"buy-in" | "cash-out">("buy-in");
  const [amount, setAmount] = useState(String(snapshot.game.buy_in_amount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ signature: string; key: string; type: "buy_in" | "rebuy" } | null>(null);
  const inFlight = useRef(false);
  const pendingCashOut = snapshot.earlyCashOuts.some((item) => item.player_id === player.id && item.status === "requested");
  const locked = snapshot.earlyCashOuts.some((item) => item.player_id === player.id && item.status === "locked");
  const hasBuyIn = snapshot.buyIns.some((item) => item.player_id === player.id);
  const previewFinalStack = Number(amount);
  const hasCashOutPreview = mode === "cash-out"
    && amount.trim() !== ""
    && Number.isFinite(previewFinalStack)
    && previewFinalStack >= 0;
  const verifiedInvested = playerVerifiedInvested(snapshot, player.id);
  const previewNet = hasCashOutPreview
    ? calculateEarlyCashOutNet(snapshot.buyIns, player.id, round2(previewFinalStack))
    : null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const parsed = Number(amount);
    if (!amount.trim() || !Number.isFinite(parsed) || parsed < 0 || parsed > 99999999.99 || (mode === "buy-in" && round2(parsed) <= 0)) {
      setError(mode === "buy-in" ? "Enter a buy-in greater than 0." : "Enter a cash-out of 0 or greater.");
      return;
    }
    if (locked || player.left_at || (mode === "cash-out" && pendingCashOut)) { setError("This player already has a cash-out. Review it at the table."); return; }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (mode === "buy-in") {
        const signature = JSON.stringify([mode, round2(parsed)]);
        if (request.current?.signature !== signature) request.current = { signature, key: randomUUID(), type: hasBuyIn ? "rebuy" : "buy_in" };
        await addBuyIn(snapshot.game.id, player.id, round2(parsed), request.current.type, null, request.current.key);
      } else {
        await requestEarlyCashOut(snapshot.game.id, player.id, round2(parsed));
      }
      onClose();
      await onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save this entry. Try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <PlayerSheet title={`Manage ${player.name}`} description={mode === "buy-in" ? "Record their buy-in on their behalf. It’s host-confirmed immediately." : "Enter their final stack, then review and confirm the early cash-out at the table."}
    busy={busy} error={error} submitLabel={mode === "buy-in" ? "Record buy-in" : "Review cash-out"} onSubmit={submit} onClose={onClose}>
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1" role="group" aria-label="Entry type">
      {(["buy-in", "cash-out"] as const).map((value) => <button key={value} type="button" aria-pressed={mode === value} disabled={busy || (value === "cash-out" && pendingCashOut)}
        onClick={() => { setMode(value); setAmount(value === "buy-in" ? String(snapshot.game.buy_in_amount) : ""); setError(""); }}
        className={`min-h-10 rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 disabled:opacity-50 ${mode === value ? "bg-white text-gray-950 shadow-sm" : "text-gray-600"}`}>
        {value === "buy-in" ? "Buy-in" : "Cash-out"}
      </button>)}
    </div>
    <Input label={mode === "buy-in" ? "Buy-in amount" : "Final stack"} prefix="$" inputMode="decimal" value={amount} onChange={(event) => setAmount(numericAmount(event.target.value))} disabled={busy} />
    {mode === "buy-in" ? <p className="text-xs text-gray-500">Table buy-in: {formatCurrency(snapshot.game.buy_in_amount)}</p> : null}
    {mode === "cash-out" ? (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
        <div className="flex justify-between gap-4 text-gray-600"><span>Host-confirmed invested</span><span className="font-medium tabular-nums text-gray-900">{formatCurrency(verifiedInvested)}</span></div>
        <div className="mt-2 flex justify-between gap-4"><span className="text-gray-600">Final chips</span><span className="font-medium tabular-nums text-gray-900">{hasCashOutPreview ? formatCurrency(round2(previewFinalStack)) : "Enter final chips"}</span></div>
        {previewNet != null ? <div className="mt-2 flex justify-between gap-4 border-t border-gray-200 pt-2"><span className="font-medium text-gray-900">Expected net</span><span className="font-semibold tabular-nums text-gray-950">{previewNet > 0 ? "+" : previewNet < 0 ? "−" : ""}{formatCurrency(Math.abs(previewNet))}</span></div> : null}
        <p className="mt-2 text-xs leading-5 text-gray-500">This sends a review request. The separate Confirm &amp; lock step records the final obligation.</p>
      </div>
    ) : null}
    {pendingCashOut ? <p className="text-xs text-gray-500">An early cash-out is already waiting for review.</p> : null}
  </PlayerSheet>;
}
