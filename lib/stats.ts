import { getBrowserSupabase } from "./supabase-browser";
import { round2 } from "./format";
import type { FriendStats, GameHistory, UserStats } from "./types";

// ---------------------------------------------------------------------------
// Pure stats computation
// ---------------------------------------------------------------------------

function zeroStats(): UserStats {
  return {
    gamesPlayed: 0,
    totalPL: 0,
    avgPL: 0,
    biggestWin: 0,
    biggestLoss: 0,
    winRate: 0,
  };
}

/**
 * Computes aggregate stats from a list of per-game net results.
 * Pure and unit-testable — no I/O.
 */
export function computeUserStats(nets: number[]): UserStats {
  const gamesPlayed = nets.length;
  const totalPL = round2(nets.reduce((sum, net) => sum + net, 0));
  const avgPL = gamesPlayed > 0 ? round2(totalPL / gamesPlayed) : 0;

  const wins = nets.filter((net) => net > 0);
  const losses = nets.filter((net) => net < 0);

  const biggestWin = wins.length > 0 ? round2(Math.max(...wins)) : 0;
  const biggestLoss = losses.length > 0 ? round2(Math.min(...losses)) : 0;
  const winRate =
    gamesPlayed > 0 ? Math.round((wins.length / gamesPlayed) * 1000) / 10 : 0;

  return { gamesPlayed, totalPL, avgPL, biggestWin, biggestLoss, winRate };
}

// ---------------------------------------------------------------------------
// Data functions (Supabase-backed; empty/zeroed when unconfigured)
// ---------------------------------------------------------------------------

/**
 * Fetches the user's aggregate stats from their game_participants rows.
 * Returns a zeroed UserStats when Supabase is unconfigured.
 */
export async function getUserStats(userId: string): Promise<UserStats> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return zeroStats();
  }

  const { data, error } = await supabase
    .from("game_participants")
    .select("net_result")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to load user stats: ${error.message}`);
  }

  const nets = ((data ?? []) as Array<{
    net_result: number | string | null;
  }>).map((row) => Number(row.net_result ?? 0));

  return computeUserStats(nets);
}

interface ParticipantWithGameRow {
  game_id: string;
  net_result: number | string | null;
  games: {
    id: string;
    name: string;
    buy_in_amount: number | string;
    ended_at: string | null;
    created_at: string;
  } | null;
}

/**
 * Fetches the user's game history (most recent first), each with the game's
 * name, buy-in, net result, and player count. Applies `limit`/`offset` after
 * sorting by date descending. Returns [] when Supabase is unconfigured.
 */
export async function getUserGames(
  userId: string,
  limit = 10,
  offset = 0
): Promise<GameHistory[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return [];
  }

  const { data: participants, error } = await supabase
    .from("game_participants")
    .select(
      "game_id, net_result, games(id, name, buy_in_amount, ended_at, created_at)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load game history: ${error.message}`);
  }

  // PostgREST returns `games` as a single to-one object at runtime, though
  // supabase-js statically types embedded resources as arrays.
  const rows = (participants ?? []) as unknown as ParticipantWithGameRow[];
  if (rows.length === 0) {
    return [];
  }

  const uniqueGameIds = Array.from(
    new Set(rows.map((row) => row.game_id))
  );

  // Count players per game in JS after one group-by-ish fetch.
  const { data: playerRows, error: playerCountError } = await supabase
    .from("players")
    .select("game_id")
    .in("game_id", uniqueGameIds);
  if (playerCountError) {
    throw new Error(`Failed to load player counts: ${playerCountError.message}`);
  }

  const playerCounts = new Map<string, number>();
  for (const row of (playerRows ?? []) as Array<{ game_id: string }>) {
    playerCounts.set(row.game_id, (playerCounts.get(row.game_id) ?? 0) + 1);
  }

  const history: GameHistory[] = [];
  for (const row of rows) {
    const game = row.games;
    if (!game) {
      continue;
    }
    history.push({
      gameId: row.game_id,
      gameName: game.name,
      date: new Date(game.ended_at ?? game.created_at),
      netResult: Number(row.net_result ?? 0),
      buyInAmount: Number(game.buy_in_amount),
      playerCount: playerCounts.get(row.game_id) ?? 0,
    });
  }

  history.sort((a, b) => b.date.getTime() - a.date.getTime());
  return history.slice(offset, offset + limit);
}

/**
 * Fetches aggregate stats for the user's accepted friends, sorted by totalPL
 * descending. Returns [] when Supabase is unconfigured.
 */
export async function getFriendsStats(userId: string): Promise<FriendStats[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return [];
  }

  const { data: friendships, error } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (error) {
    throw new Error(`Failed to load friends: ${error.message}`);
  }

  const friendIds = new Set<string>();
  for (const row of (friendships ?? []) as Array<{
    requester_id: string;
    addressee_id: string;
  }>) {
    friendIds.add(
      row.requester_id === userId ? row.addressee_id : row.requester_id
    );
  }
  if (friendIds.size === 0) {
    return [];
  }

  const friendIdList = Array.from(friendIds);

  const [profilesResult, participantsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", friendIdList),
    supabase
      .from("game_participants")
      .select("user_id, net_result")
      .in("user_id", friendIdList),
  ]);

  if (profilesResult.error) {
    throw new Error(
      `Failed to load friend profiles: ${profilesResult.error.message}`
    );
  }
  if (participantsResult.error) {
    throw new Error(
      `Failed to load friend stats: ${participantsResult.error.message}`
    );
  }

  const profiles = new Map(
    ((profilesResult.data ?? []) as Array<{
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    }>).map((profile) => [profile.id, profile])
  );

  const totals = new Map<string, { totalPL: number; gamesPlayed: number }>();
  for (const row of (participantsResult.data ?? []) as Array<{
    user_id: string;
    net_result: number | string | null;
  }>) {
    const entry = totals.get(row.user_id) ?? { totalPL: 0, gamesPlayed: 0 };
    entry.totalPL += Number(row.net_result ?? 0);
    entry.gamesPlayed += 1;
    totals.set(row.user_id, entry);
  }

  return friendIdList
    .map((friendId) => {
      const profile = profiles.get(friendId);
      const aggregate = totals.get(friendId) ?? { totalPL: 0, gamesPlayed: 0 };
      return {
        userId: friendId,
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        totalPL: round2(aggregate.totalPL),
        gamesPlayed: aggregate.gamesPlayed,
      };
    })
    .sort((a, b) => b.totalPL - a.totalPL);
}