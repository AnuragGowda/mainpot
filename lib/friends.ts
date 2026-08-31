import { getBrowserSupabase } from "./supabase-browser";
import { getCurrentUserId } from "./auth-client";
import type { Friendship, Profile } from "./types";

interface FriendshipWithProfile extends Friendship {
  profiles: Profile;
}

interface FriendshipWithOtherProfiles extends Friendship {
  requester_profile: Profile;
  addressee_profile: Profile;
}

const publicProfileSelection =
  "id, username, display_name, avatar_url, bio, plan, created_at, updated_at";

function toPublicProfile(row: Omit<Profile, "venmo_handle" | "zelle_handle" | "supporter_until">): Profile {
  return {
    ...row,
    venmo_handle: null,
    zelle_handle: null,
    supporter_until: null,
  };
}

function toFriendship(row: Friendship): Friendship {
  return {
    id: row.id,
    requester_id: row.requester_id,
    addressee_id: row.addressee_id,
    status: row.status,
    created_at: row.created_at,
    responded_at: row.responded_at,
  };
}

/**
 * Searches profiles by username OR display name (case-insensitive substring).
 * Returns up to 10 matches. Returns [] when Supabase is unconfigured.
 */
export async function searchUsers(query: string): Promise<Profile[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return [];
  }
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const { data, error } = await supabase
    .from("profiles")
    .select(publicProfileSelection)
    .or(`username.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`)
    .limit(10);
  if (error) {
    throw new Error(`Failed to search users: ${error.message}`);
  }
  return ((data ?? []) as Array<Omit<Profile, "venmo_handle" | "zelle_handle" | "supporter_until">>).map(toPublicProfile);
}

/**
 * Sends a friend request from the current user to `addresseeId`.
 * A duplicate (unique requester_id, addressee_id conflict) is treated as a
 * success/no-op. No-op when Supabase is unconfigured or signed out.
 */
export async function sendFriendRequest(addresseeId: string): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return;
  }
  const requesterId = await getCurrentUserId();
  if (!requesterId) {
    return;
  }
  const { error } = await supabase.from("friendships").insert({
    requester_id: requesterId,
    addressee_id: addresseeId,
    status: "pending",
  });
  // code 23505 = unique_violation on (requester_id, addressee_id).
  if (error && error.code !== "23505") {
    throw new Error(`Failed to send friend request: ${error.message}`);
  }
}

/** Accepts a pending friend request. No-op when Supabase is unconfigured. */
export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return;
  }
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", friendshipId);
  if (error) {
    throw new Error(`Failed to accept friend request: ${error.message}`);
  }
}

/** Declines a pending friend request. No-op when Supabase is unconfigured. */
export async function declineFriendRequest(friendshipId: string): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return;
  }
  const { error } = await supabase
    .from("friendships")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", friendshipId);
  if (error) {
    throw new Error(`Failed to decline friend request: ${error.message}`);
  }
}

/** Deletes the user's own outgoing (pending) friend request. */
export async function cancelFriendRequest(friendshipId: string): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return;
  }
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) {
    throw new Error(`Failed to cancel friend request: ${error.message}`);
  }
}

/** Removes an accepted friendship. No-op when Supabase is unconfigured. */
export async function removeFriend(friendshipId: string): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return;
  }
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) {
    throw new Error(`Failed to remove friend: ${error.message}`);
  }
}

/**
 * Returns pending friendships addressed to `userId`, joined with the
 * requester's profile. Returns [] when Supabase is unconfigured.
 */
export async function getIncomingRequests(
  userId: string
): Promise<Array<{ friendship: Friendship; profile: Profile }>> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from("friendships")
    .select(`*, profiles!friendships_requester_id_fkey(${publicProfileSelection})`)
    .eq("addressee_id", userId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`Failed to load incoming requests: ${error.message}`);
  }
  return ((data ?? []) as FriendshipWithProfile[]).map((row) => ({
    friendship: toFriendship(row),
    profile: toPublicProfile(row.profiles),
  }));
}

/**
 * Returns the current user's pending outgoing requests, joined with the
 * addressee's profile. Returns [] when Supabase is unconfigured.
 */
export async function getOutgoingRequests(
  userId: string
): Promise<Array<{ friendship: Friendship; profile: Profile }>> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from("friendships")
    .select(`*, profiles!friendships_addressee_id_fkey(${publicProfileSelection})`)
    .eq("requester_id", userId)
    .eq("status", "pending");
  if (error) {
    throw new Error(`Failed to load outgoing requests: ${error.message}`);
  }
  return ((data ?? []) as FriendshipWithProfile[]).map((row) => ({
    friendship: toFriendship(row),
    profile: toPublicProfile(row.profiles),
  }));
}

/**
 * Returns the user's accepted friendships, joined with the OTHER party's
 * profile. Returns [] when Supabase is unconfigured.
 */
export async function getFriends(
  userId: string
): Promise<Array<{ profile: Profile; friendship: Friendship }>> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return [];
  }
  const { data, error } = await supabase
    .from("friendships")
    .select(
      `*, requester_profile:profiles!friendships_requester_id_fkey(${publicProfileSelection}), addressee_profile:profiles!friendships_addressee_id_fkey(${publicProfileSelection})`
    )
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) {
    throw new Error(`Failed to load friends: ${error.message}`);
  }
  return ((data ?? []) as FriendshipWithOtherProfiles[]).map((row) => {
    const otherProfile =
      row.requester_id === userId ? row.addressee_profile : row.requester_profile;
    return {
      profile: toPublicProfile(otherProfile),
      friendship: toFriendship(row),
    };
  });
}

/**
 * Returns the friendship row (any status) between two users, or null.
 * When both directions exist, returns one of them.
 */
export async function getFriendshipBetween(
  userA: string,
  userB: string
): Promise<Friendship | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase
    .from("friendships")
    .select("*")
    .or(
      `and(requester_id.eq.${userA},addressee_id.eq.${userB}),and(requester_id.eq.${userB},addressee_id.eq.${userA})`
    )
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load friendship: ${error.message}`);
  }
  return (data ?? null) as Friendship | null;
}

/** Fetches a profile by exact username (case-insensitive), or null. */
export async function getProfileByUsername(
  username: string
): Promise<Profile | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select(publicProfileSelection)
    .ilike("username", username.trim())
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }
  return data
    ? toPublicProfile(data as Omit<Profile, "venmo_handle" | "zelle_handle" | "supporter_until">)
    : null;
}

/** Fetches a profile by id, or null. */
export async function getProfileById(userId: string): Promise<Profile | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return null;
  }
  const currentUserId = await getCurrentUserId();
  if (currentUserId !== userId) {
    return null;
  }
  const { data, error } = await supabase
    .rpc("get_my_profile")
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load profile: ${error.message}`);
  }
  return (data ?? null) as Profile | null;
}

/**
 * Updates the user's own profile with the given patch (leading `@` is
 * stripped from venmo_handle before storing) and returns the updated row,
 * or null when the profile does not exist / Supabase is unconfigured.
 */
export async function updateProfile(
  userId: string,
  patch: {
    username?: string;
    display_name?: string;
    bio?: string;
    venmo_handle?: string;
    zelle_handle?: string;
    avatar_url?: string;
  }
): Promise<Profile | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return null;
  }

  const updates: Record<string, string> = {};
  for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
    const value = patch[key];
    if (value === undefined) {
      continue;
    }
    updates[key] =
      key === "venmo_handle" ? value.trim().replace(/^@/, "") : value;
  }
  if (Object.keys(updates).length === 0) {
    return getProfileById(userId);
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);
  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }
  return getProfileById(userId);
}

/**
 * Returns true when another profile already has the given username
 * (case-insensitive), optionally excluding the current user's own row.
 */
export async function isUsernameTaken(
  username: string,
  excludeUserId?: string
): Promise<boolean> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return false;
  }
  const trimmed = username.trim();
  if (!trimmed) {
    return false;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", trimmed)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to check username: ${error.message}`);
  }
  if (!data) {
    return false;
  }
  return data.id !== excludeUserId;
}
