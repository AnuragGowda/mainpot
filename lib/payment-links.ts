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

export function buildZellePaymentText(contact: string, amount: number): string | null {
  const normalizedContact = contact.trim();
  if (!normalizedContact || !Number.isFinite(amount) || amount <= 0) return null;
  return `Send $${amount.toFixed(2)} with Zelle to ${normalizedContact} — Mainpot settlement`;
}

export async function getPlayerPaymentHandles(
  playerIds: string[]
): Promise<Map<string, PlayerPaymentHandles>> {
  const result = new Map<string, PlayerPaymentHandles>();
  const supabase = getBrowserSupabase();
  const uniquePlayerIds = Array.from(new Set(playerIds.filter(Boolean)));
  if (!supabase || uniquePlayerIds.length === 0) return result;

  const { data, error } = await supabase.rpc("get_player_payment_handles", {
    input_player_ids: uniquePlayerIds,
  });
  if (error) throw new Error(`Could not load payment details: ${error.message}`);

  for (const row of (data ?? []) as Array<{
    player_id: string;
    venmo_handle: string | null;
    zelle_handle: string | null;
  }>) {
    result.set(row.player_id, {
      venmo: row.venmo_handle,
      zelle: row.zelle_handle,
    });
  }
  return result;
}
