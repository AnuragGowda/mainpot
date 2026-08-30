import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

/**
 * OAuth / magic-link callback. Exchanges the authorization code for a
 * session cookie, then redirects to the `next` query param (default "/").
 * On failure the user is sent to /signin with an error query param.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(
      new URL("/signin?error=missing_code", origin)
    );
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    // Supabase is not configured — nothing to exchange.
    return NextResponse.redirect(
      new URL("/signin?error=not_configured", origin)
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(error.message)}`, origin)
    );
  }

  // Only allow same-origin redirect targets to avoid open redirects.
  const forwardUrl = new URL(next, origin);
  if (forwardUrl.origin !== origin) {
    return NextResponse.redirect(new URL("/", origin));
  }
  return NextResponse.redirect(forwardUrl);
}
