import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when both Supabase env vars are present at runtime. */
export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl && supabaseAnonKey
);

/**
 * Supabase client, or null when Supabase is not configured.
 * When null, the data layer falls back to localStorage.
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;