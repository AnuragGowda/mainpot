import type { Player } from "./types";

/** Authenticated ownership is authoritative; browser identity is for local seats only. */
export function resolveCurrentPlayer<T extends Pick<Player, "user_id" | "session_id">>(
  players: T[], sessionId: string | null, userId: string | null,
): T | null {
  if (userId) {
    return players.find((player) => player.user_id === userId) ?? null;
  }
  return (sessionId ? players.find((player) => (player.user_id === null || player.user_id === undefined) && player.session_id === sessionId) : null) ?? null;
}
