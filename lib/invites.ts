import { getCurrentUser } from "./auth-client";
import { getBrowserSupabase } from "./supabase-browser";
import type { GameInviteStatus, IncomingGameInvite, Profile } from "./types";

export type IncomingGameInviteMetadata = Omit<IncomingGameInvite, "game"> & {
  game: Omit<IncomingGameInvite["game"], "code">;
};

export async function inviteFriendToGame(gameId: string, inviteeId: string): Promise<void> {
  const supabase = getBrowserSupabase();
  const user = await getCurrentUser();
  if (!supabase || !user || user.is_anonymous) {
    throw new Error("Sign in to invite saved friends.");
  }
  const { error } = await supabase.rpc("send_game_invite", {
    input_game_id: gameId,
    input_invitee_id: inviteeId,
  });
  if (error) {
    throw new Error(`Could not send invite: ${error.message}`);
  }
}

interface IncomingRow {
  id: string;
  game_id: string;
  inviter_id: string;
  invitee_id: string;
  status: GameInviteStatus;
  created_at: string;
  responded_at: string | null;
  game: IncomingGameInviteMetadata["game"];
  inviter: IncomingGameInviteMetadata["inviter"];
}

export async function getIncomingGameInvites(): Promise<IncomingGameInviteMetadata[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .rpc("get_my_incoming_game_invites");
  if (error) throw new Error(`Could not load game invites: ${error.message}`);
  return ((data ?? []) as unknown as IncomingRow[]).map((row) => ({
    ...row,
    game: { ...row.game, buy_in_amount: Number(row.game.buy_in_amount) },
  }));
}

export async function respondToGameInvite(
  inviteId: string,
  status: Exclude<GameInviteStatus, "pending">
): Promise<string | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .rpc("respond_to_game_invite", {
      input_invite_id: inviteId,
      input_status: status,
    });
  if (error) throw new Error(`Could not update invite: ${error.message}`);
  return (data as string | null) ?? null;
}

export function friendLabel(profile: Pick<Profile, "display_name" | "username">): string {
  return profile.display_name || (profile.username ? `@${profile.username}` : "Player");
}
