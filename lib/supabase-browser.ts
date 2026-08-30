import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Creates a browser-side Supabase client backed by @supabase/ssr cookies,
 * or returns null when Supabase is not configured.
 *
 * Note: `createBrowserClient` caches its client per module (singleton in the
 * browser), so repeated calls are cheap.
 */
export function createBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

let cachedBrowserSupabase: SupabaseClient | null | undefined;

/**
 * Lazily-created singleton browser client, or null when Supabase is not
 * configured. Import this from client components to avoid recreating a
 * client on every render.
 */
export function getBrowserSupabase(): SupabaseClient | null {
  if (cachedBrowserSupabase === undefined) {
    cachedBrowserSupabase = createBrowserSupabase();
  }
  return cachedBrowserSupabase;
}

/** Singleton browser client (null when Supabase is unconfigured). */
export const browserSupabase: SupabaseClient | null = createBrowserSupabase();