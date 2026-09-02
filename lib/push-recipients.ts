import type { GamePushEvent } from "./push-client";

export interface PushRecipientPlayer {
  left_at: string | null;
  user_id: string | null;
}

/**
 * Lifecycle alerts matter to every person who played, even if they have left
 * the active game screen. Join alerts remain limited to the current table.
 */
export function getPushRecipientIds(
  players: PushRecipientPlayer[],
  event: GamePushEvent,
  senderUserId: string,
): string[] {
  return [...new Set(
    players
      .filter((player) => event !== "player_joined" || player.left_at === null)
      .map((player) => player.user_id)
      .filter((userId): userId is string => Boolean(userId))
      .filter((userId) => event !== "player_joined" || userId !== senderUserId),
  )];
}
