import { getBrowserSupabase } from "@/lib/supabase-browser";
import { isSupabaseConfigured } from "@/lib/supabase";
import { restorePlayerToTableLocal } from "@/lib/data";
import type { Player } from "@/lib/types";

/** Restores a departed player row with the current host's authorization. */
export async function restorePlayerToTable(gameId: string, playerId: string): Promise<Player> {
  if (!isSupabaseConfigured) return restorePlayerToTableLocal(gameId, playerId);

  const client = getBrowserSupabase();
  if (!client) throw new Error("Seat recovery requires a connected table.");

  const { data, error } = await client.rpc("restore_player_to_table", {
    input_game_id: gameId,
    input_player_id: playerId,
  });
  if (error) throw new Error(error.message);
  const player = Array.isArray(data) ? data[0] : data;
  if (!player) throw new Error("Could not return this player to the table.");
  return player as Player;
}
