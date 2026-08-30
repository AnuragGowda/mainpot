import { getCurrentUser } from "./auth-client";
import { getBrowserSupabase } from "./supabase-browser";
import type { GameInviteStatus, IncomingGameInvite, Profile } from "./types";

export async function inviteFriendToGame(gameId: string, inviteeId: string): Promise<void> {
  const supabase = getBrowserSupabase();
  const user = await getCurrentUser();
  if (!supabase || !user || user.is_anonymous) {
    throw new Error("Sign in to invite saved friends.");
  }
  const { error } = await supabase.from("game_invites").insert({
    game_id: gameId,
    inviter_id: user.id,
    invitee_id: inviteeId,
  });
  if (error && error.code !== "23505") {
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
  game: IncomingGameInvite["game"];
  inviter: IncomingGameInvite["inviter"];
}

export async function getIncomingGameInvites(userId: string): Promise<IncomingGameInvite[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("game_invites")
    .select("*, game:games!inner(id,code,name,buy_in_amount,host_name,status), inviter:profiles!game_invites_inviter_id_fkey(id,username,display_name,avatar_url)")
    .eq("invitee_id", userId)
    .eq("status", "pending")
    .eq("game.status", "active")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load game invites: ${error.message}`);
  return ((data ?? []) as unknown as IncomingRow[]).map((row) => ({
    ...row,
    game: { ...row.game, buy_in_amount: Number(row.game.buy_in_amount) },
  }));
}

export async function respondToGameInvite(inviteId: string, status: Exclude<GameInviteStatus, "pending">): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) return;
  const { error } = await supabase
    .from("game_invites")
    .update({ status, responded_at: new Date().toISOString() })
    .eq("id", inviteId);
  if (error) throw new Error(`Could not update invite: ${error.message}`);
}

export function friendLabel(profile: Pick<Profile, "display_name" | "username">): string {
  return profile.display_name || (profile.username ? `@${profile.username}` : "Player");
}
