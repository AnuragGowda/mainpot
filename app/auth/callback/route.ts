import { withTimeout } from "@/lib/request-timeout";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCOUNT_TRANSFER_COOKIE, isExpiredAccountTransferError } from "@/lib/account-transfer";
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

  const exchange = await withTimeout(supabase.auth.exchangeCodeForSession(code), "Sign-in timed out. Please try again.")
    .catch((error: unknown) => ({ error: { message: error instanceof Error ? error.message : "Sign-in failed" } }));
  const { error } = exchange;
  if (error) {
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(error.message)}`, origin)
    );
  }

  let recoveryFailed = false;
  let recoveryExpired = false;
  if (transferToken) {
    const { error: claimError } = await withTimeout(supabase.rpc("claim_anonymous_account_transfer", {
      input_token: transferToken,
    }), "Guest recovery timed out. Please try again.").catch(() => ({ error: true }));
    // Keep a failed capability for the same authenticated browser to retry;
    // a successful claim consumes it permanently.
    recoveryExpired = typeof claimError === "object"
      && claimError !== null
      && "message" in claimError
      && isExpiredAccountTransferError(String(claimError.message));
    if (!claimError || recoveryExpired) cookieStore.delete(ACCOUNT_TRANSFER_COOKIE);
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
    retryUrl.searchParams.set("account_recovery", recoveryExpired ? "expired" : "failed");
    return NextResponse.redirect(retryUrl);
  }
  return NextResponse.redirect(forwardUrl);
}
