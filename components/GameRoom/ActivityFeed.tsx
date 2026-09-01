"use client";

import { useMemo, useState } from "react";
import type { GameEvent, GameSnapshot } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import ConfirmButton from "./ConfirmButton";

export interface ActivityFeedProps {
  snapshot: GameSnapshot;
  isHost: boolean;
  onEdit: (buyInId: string, amount: number) => void;
  onRemoveBuyIn: (buyInId: string) => void;
  onRemovePlayer: (playerId: string) => void;
}

function legacyEvents(snapshot: GameSnapshot): GameEvent[] {
  const events: GameEvent[] = [];
  for (const player of snapshot.players) {
    events.push({
      id: `legacy-join-${player.id}`,
      game_id: snapshot.game.id,
      event_type: "player_joined",
      actor_player_id: player.id,
      subject_player_id: player.id,
      amount: null,
      metadata: { player_name: player.name },
      created_at: player.joined_at,
    });
  }
  for (const buyIn of snapshot.buyIns) {
    const player = snapshot.players.find((item) => item.id === buyIn.player_id);
    const frontedBy = snapshot.players.find(
      (item) => item.id === buyIn.fronted_by_player_id
    );
    events.push({
      id: `legacy-buy-in-${buyIn.id}`,
      game_id: snapshot.game.id,
      event_type: "buy_in_added",
      actor_player_id: buyIn.player_id,
      subject_player_id: buyIn.player_id,
      amount: buyIn.amount,
      metadata: {
        player_name: player?.name,
        buy_in_id: buyIn.id,
        buy_in_type: buyIn.type,
        fronted_by_name: frontedBy?.name,
      },
      created_at: buyIn.created_at,
    });
  }
  return events.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function eventText(event: GameEvent, actorName: string | null): string {
  const playerName = event.metadata.player_name ?? "A player";
  const amount = event.amount == null ? null : formatCurrency(event.amount);
  const actor = actorName ?? "The host";
  const possession = actorName === playerName ? "their" : `${playerName}’s`;
  const entryType = event.metadata.buy_in_type === "rebuy" ? "rebuy" : "buy-in";

  switch (event.event_type) {
    case "game_created":
      return `${playerName} opened the table`;
    case "player_joined":
      return `${playerName} joined`;
    case "buy_in_added":
      return `${playerName} ${event.metadata.buy_in_type === "rebuy" ? "rebought" : "bought in"} for ${amount}${event.metadata.fronted_by_name ? `, fronted by ${event.metadata.fronted_by_name}` : ""}`;
    case "buy_in_updated":
      return `${actor} edited ${possession} ${entryType} from ${formatCurrency(Number(event.metadata.previous_amount ?? 0))} to ${amount}`;
    case "buy_in_removed":
      return `${actor} removed ${possession} ${amount} ${entryType}`;
    case "buy_in_verified":
      return `${actor} verified ${possession} ${amount} ${entryType}`;
    case "player_left":
      return `${playerName} left the table`;
    case "player_removed":
      return `${actor} removed ${playerName} from the table`;
    case "host_transferred":
      return `${actor} made ${playerName} the host`;
    case "cash_out_updated":
      return `${playerName} recorded a ${amount} cash-out`;
    case "game_settling":
      return `${actorName ?? "The host"} closed the table for settlement`;
    case "game_finalized":
      return `${actorName ?? "The host"} finalized the game`;
    case "host_returned_to_create":
      return `${actorName ?? "The host"} started another game`;
    default:
      return "Updated the game";
  }
}

function EventMark({ type }: { type: GameEvent["event_type"] }) {
  const symbol = type.includes("buy_in")
    ? "$"
    : type.includes("player")
      ? "+"
      : type.includes("cash_out")
        ? "↗"
        : "✓";
  const tone = type.includes("removed")
    ? "bg-red-50 text-red-600"
    : type.includes("buy_in")
      ? "bg-emerald-50 text-emerald-700"
      : "bg-gray-100 text-gray-600";
  return (
    <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${tone}`}>
      {symbol}
    </span>
  );
}

export default function ActivityFeed({
  snapshot,
  isHost,
  onEdit,
  onRemoveBuyIn,
  onRemovePlayer,
}: ActivityFeedProps) {
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const events = useMemo(() => {
    const source = snapshot.events.length ? snapshot.events : legacyEvents(snapshot);
    return source
      .map((event, index) => ({ event, index }))
      .sort(
        (a, b) =>
          b.event.created_at.localeCompare(a.event.created_at) || b.index - a.index
      )
      .map(({ event }) => event);
  }, [snapshot]);

  const latestByBuyIn = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) {
      const buyInId = event.metadata.buy_in_id;
      if (buyInId && !map.has(buyInId)) map.set(buyInId, event.id);
    }
    return map;
  }, [events]);

  function startEdit(eventId: string, amount: number) {
    setEditingId(eventId);
    setEditValue(String(amount));
  }

  function saveEdit(buyInId: string) {
    const amount = Number(editValue);
    if (!Number.isFinite(amount) || amount <= 0) return;
    onEdit(buyInId, amount);
    setEditingId(null);
    setOpenEventId(null);
  }

  return (
    <section aria-labelledby="activity-heading">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 id="activity-heading" className="text-base font-semibold text-gray-950">Activity</h2>
          <p className="text-sm text-gray-500">Newest first.</p>
        </div>
        <span className="text-xs text-gray-400">{events.length} events</span>
      </div>
      <Card padding="none" className="overflow-hidden rounded-xl shadow-none">
        <ol className="divide-y divide-gray-100">
          {events.map((event) => {
            const actor = snapshot.players.find((player) => player.id === event.actor_player_id);
            const subject = snapshot.players.find((player) => player.id === event.subject_player_id);
            const buyInId = event.metadata.buy_in_id;
            const buyIn = buyInId ? snapshot.buyIns.find((item) => item.id === buyInId) : null;
            const canManageBuyIn = Boolean(
              isHost && buyIn?.verified && buyInId && latestByBuyIn.get(buyInId) === event.id
            );
            const canRemovePlayer = Boolean(
              isHost &&
                event.event_type === "player_joined" &&
                subject &&
                !subject.is_host &&
                !subject.left_at
            );
            const showMenu = canManageBuyIn || canRemovePlayer;
            const editing = editingId === event.id;
            return (
              <li key={event.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex items-start gap-3">
                  <EventMark type={event.event_type} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6 text-gray-800">
                      {eventText(event, actor?.name ?? null)}
                    </p>
                    <time dateTime={event.created_at} className="mt-0.5 block text-xs text-gray-400">
                      {new Date(event.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </time>
                  </div>
                  {showMenu ? (
                    <button
                      type="button"
                      aria-label={`Actions for ${eventText(event, actor?.name ?? null)}`}
                      aria-expanded={openEventId === event.id}
                      onClick={() => setOpenEventId((current) => current === event.id ? null : event.id)}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-lg leading-none text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
                    >
                      ···
                    </button>
                  ) : null}
                </div>

                {openEventId === event.id && showMenu ? (
                  <div className="ml-11 mt-3 rounded-lg bg-gray-50 p-3">
                    {editing && buyIn ? (
                      <div className="flex items-end gap-2">
                        <Input aria-label={`Edit ${buyIn.type === "rebuy" ? "rebuy" : "buy-in"} amount for ${subject?.name ?? "player"}`} type="number" min={0.01} step={0.01} inputMode="decimal" prefix="$" value={editValue} onChange={(event) => setEditValue(event.target.value)} />
                        <Button size="sm" onClick={() => saveEdit(buyIn.id)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {canManageBuyIn && buyIn ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => startEdit(event.id, buyIn.amount)}>Edit {buyIn.type === "rebuy" ? "rebuy" : "buy-in"}</Button>
                            <ConfirmButton size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" confirmLabel="Remove entry?" onConfirm={() => onRemoveBuyIn(buyIn.id)}>Remove {buyIn.type === "rebuy" ? "rebuy" : "buy-in"}</ConfirmButton>
                          </>
                        ) : null}
                        {canRemovePlayer && subject ? (
                          <ConfirmButton size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onConfirm={() => onRemovePlayer(subject.id)}>Remove player</ConfirmButton>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        {!events.length ? <p className="px-5 py-10 text-center text-sm text-gray-500">Activity will appear here as the game moves.</p> : null}
      </Card>
    </section>
  );
}
