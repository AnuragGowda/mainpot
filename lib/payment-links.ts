import { getBrowserSupabase } from "./supabase-browser";

export interface PlayerPaymentHandles {
  venmo: string | null;
  zelle: string | null;
}

export function buildVenmoPaymentUrl(
  handle: string,
  amount: number,
  note = "Mainpot settlement"
): string | null {
  const normalizedHandle = handle.trim().replace(/^@/, "");
  if (!normalizedHandle || !Number.isFinite(amount) || amount <= 0) return null;

  const params = new URLSearchParams({
    txn: "pay",
    amount: amount.toFixed(2),
    note,
  });
  return `https://venmo.com/${encodeURIComponent(normalizedHandle)}?${params.toString()}`;
}

export function buildZellePaymentText(handle: string, amount: number): string | null {
  const normalizedHandle = handle.trim();
  if (!normalizedHandle || !Number.isFinite(amount) || amount <= 0) return null;
  return `Send $${amount.toFixed(2)} with Zelle to ${normalizedHandle} — Mainpot settlement`;
}

export async function getPlayerPaymentHandles(
  playerIds: string[]
): Promise<Map<string, PlayerPaymentHandles>> {
  const result = new Map<string, PlayerPaymentHandles>();
  const supabase = getBrowserSupabase();
  const uniquePlayerIds = Array.from(new Set(playerIds.filter(Boolean)));
  if (!supabase || uniquePlayerIds.length === 0) return result;

  const { data: players, error: playerError } = await supabase
    .from("players")
    .select("id, user_id")
    .in("id", uniquePlayerIds);
  if (playerError) throw new Error(`Could not load payment details: ${playerError.message}`);

  const playerRows = (players ?? []) as Array<{ id: string; user_id: string | null }>;
  const userIds = Array.from(new Set(playerRows.map((row) => row.user_id).filter((id): id is string => Boolean(id))));
  if (userIds.length === 0) return result;

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, venmo_handle, zelle_handle")
    .in("id", userIds);
  if (profileError) throw new Error(`Could not load payment details: ${profileError.message}`);

  const byUserId = new Map(
    ((profiles ?? []) as Array<{ id: string; venmo_handle: string | null; zelle_handle: string | null }>).map((profile) => [
      profile.id,
      { venmo: profile.venmo_handle, zelle: profile.zelle_handle },
    ])
  );
  for (const player of playerRows) {
    const handles = player.user_id ? byUserId.get(player.user_id) : undefined;
    if (handles) result.set(player.id, handles);
  }
  return result;
}
