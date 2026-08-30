import { getBrowserSupabase } from "./supabase-browser";
import { getSessionId } from "./session";
import { round2 } from "./format";

interface AnonymousPlayerRow {
  id: string;
  game_id: string;
}

/**
 * Links the current browser session's anonymous players to an authenticated
 * user. For each player (session_id match, user_id null):
 *   1. sets the player's user_id,
 *   2. if that player's game has ended, computes their net result
 *      (sum of cash-outs minus sum of buy-ins) and upserts it into
 *      game_participants.
 *
 * No-op when Supabase is unconfigured.
 */
export async function linkSessionToUser(userId: string): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return;
  }

  const sessionId = getSessionId();

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, game_id, session_id, user_id")
    .eq("session_id", sessionId)
    .is("user_id", null);
  if (playersError) {
    throw new Error(`Failed to load anonymous players: ${playersError.message}`);
  }

  for (const player of (players ?? []) as AnonymousPlayerRow[]) {
    const { error: updateError } = await supabase
      .from("players")
      .update({ user_id: userId })
      .eq("id", player.id);
    if (updateError) {
      throw new Error(`Failed to link player to account: ${updateError.message}`);
    }

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, status")
      .eq("id", player.game_id)
      .maybeSingle();
    if (gameError) {
      throw new Error(`Failed to load game for player: ${gameError.message}`);
    }
    if (!game || game.status !== "ended") {
      continue;
    }

    const [buyInsResult, cashOutsResult] = await Promise.all([
      supabase.from("buy_ins").select("amount").eq("player_id", player.id),
      supabase.from("cash_outs").select("amount").eq("player_id", player.id),
    ]);
    if (buyInsResult.error) {
      throw new Error(
        `Failed to load buy-ins for player: ${buyInsResult.error.message}`
      );
    }
    if (cashOutsResult.error) {
      throw new Error(
        `Failed to load cash-outs for player: ${cashOutsResult.error.message}`
      );
    }

    const buyInTotal = (buyInsResult.data ?? []).reduce(
      (sum, row) => sum + Number((row as { amount: number | string }).amount),
      0
    );
    const cashOutTotal = (cashOutsResult.data ?? []).reduce(
      (sum, row) => sum + Number((row as { amount: number | string }).amount),
      0
    );
    const netResult = round2(cashOutTotal - buyInTotal);

    const { error: upsertError } = await supabase
      .from("game_participants")
      .upsert(
        {
          game_id: player.game_id,
          user_id: userId,
          player_id: player.id,
          net_result: netResult,
        },
        { onConflict: "game_id,user_id" }
      );
    if (upsertError) {
      throw new Error(
        `Failed to record game result: ${upsertError.message}`
      );
    }
  }
}