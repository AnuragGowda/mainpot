import { getBrowserSupabase } from "./supabase-browser";

export interface GameTemplate {
  id: string;
  name: string;
  game_name: string;
  buy_in_amount: number | string;
  preferred_roster: string[];
  created_at: string;
  updated_at: string;
}

export async function getGameTemplates(userId: string): Promise<GameTemplate[]> {
  const supabase = getBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("game_templates")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Couldn't load templates: ${error.message}`);
  return (data ?? []) as GameTemplate[];
}

export async function saveGameTemplate(input: {
  userId: string;
  name: string;
  gameName: string;
  buyInAmount: number;
  preferredRoster: string[];
}): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Sign in to save a recurring template.");
  const { error } = await supabase.from("game_templates").insert({
    user_id: input.userId,
    name: input.name.trim(),
    game_name: input.gameName.trim(),
    buy_in_amount: input.buyInAmount,
    preferred_roster: input.preferredRoster.map((name) => name.trim()).filter(Boolean),
  });
  if (error) throw new Error(`Couldn't save template: ${error.message}`);
}

export async function exportMyAccountData(): Promise<unknown> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Sign in to export your data.");
  const { data, error } = await supabase.rpc("export_my_mainpot_data");
  if (error) throw new Error(`Couldn't prepare export: ${error.message}`);
  return data;
}

export async function requestAccountDeletion(): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Sign in to request account deletion.");
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) throw new Error(`Couldn't request deletion: ${error.message}`);
}
