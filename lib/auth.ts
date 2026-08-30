import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createServerSupabase } from "./supabase-server";

/** The authenticated Supabase user (null when signed out / unconfigured). */
export type AuthUser = User;

export interface AuthUserResult {
  user: User;
  supabase: SupabaseClient;
}

/**
 * Returns the current auth session (or null) using the server-side Supabase
 * client. Returns null when Supabase is unconfigured or no session exists.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return null;
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Returns `{ user, supabase }` when an authenticated user exists, or null
 * when Supabase is unconfigured or there is no active session.
 */
export async function getUser(): Promise<AuthUserResult | null> {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return null;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  return { user, supabase };
}
