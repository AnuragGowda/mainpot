import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCOUNT_TRANSFER_COOKIE } from "@/lib/account-transfer";
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
  const cookieStore = await cookies();
  const transferToken = cookieStore.get(ACCOUNT_TRANSFER_COOKIE)?.value ?? null;

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

  let recoveryFailed = false;
  if (transferToken) {
    const { error: claimError } = await supabase.rpc("claim_anonymous_account_transfer", {
      input_token: transferToken,
    });
    // Keep a failed capability for the same authenticated browser to retry;
    // a successful claim consumes it permanently.
    if (!claimError) cookieStore.delete(ACCOUNT_TRANSFER_COOKIE);
    recoveryFailed = Boolean(claimError);
  }

  // Only allow same-origin redirect targets to avoid open redirects.
  const forwardUrl = new URL(next, origin);
  if (forwardUrl.origin !== origin) {
    return NextResponse.redirect(new URL("/", origin));
  }
  if (recoveryFailed) {
    const retryUrl = new URL("/signin", origin);
    retryUrl.searchParams.set("next", forwardUrl.pathname + forwardUrl.search);
    retryUrl.searchParams.set("account_recovery", "failed");
    return NextResponse.redirect(retryUrl);
  }
  return NextResponse.redirect(forwardUrl);
}
