import type { Player } from "./types";

/** Account ownership survives browser changes; a stable session still recovers guests. */
export function resolveCurrentPlayer<T extends Pick<Player, "user_id" | "session_id">>(
  players: T[], sessionId: string | null, userId: string | null,
): T | null {
  if (userId) {
    const accountPlayer = players.find((player) => player.user_id === userId);
    if (accountPlayer) return accountPlayer;
  }
  return (sessionId ? players.find((player) => player.session_id === sessionId) : null) ?? null;
}
