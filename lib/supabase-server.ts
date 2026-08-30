import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "./supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Creates a server-side Supabase client whose session is read from (and
 * written back to) the request cookies, or returns null when Supabase is
 * not configured. Must be called within a request context (route handlers,
 * server components, server actions).
 */
export function createServerSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            // An auth-token cookie carrying the "refresh_token_not_found"
            // code means the refresh token no longer exists server-side
            // (e.g. the session was revoked). Delete the cookie instead of
            // persisting a dead token.
            const isExpiredAuthToken =
              /^sb-.+-auth-token$/.test(name) &&
              value.includes("refresh_token_not_found");

            if (value === "" || isExpiredAuthToken) {
              // Session cookie is being cleared: expire it client-side
              // instead of re-setting an empty value.
              cookieStore.set(name, "", { ...options, maxAge: 0 });
            } else {
              cookieStore.set(name, value, options);
            }
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}