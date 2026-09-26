import { withTimeout } from "@/lib/request-timeout";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACCOUNT_TRANSFER_COOKIE, isExpiredAccountTransferError } from "@/lib/account-transfer";
import { createServerSupabase, type ServerSupabaseCookie } from "@/lib/supabase-server";

/**
 * OAuth / magic-link callback. Exchanges the authorization code for a
 * session cookie, then redirects to the `next` query param (default "/").
 * On failure the user is sent to /signin with an error query param.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  // Next can expose its internal server hostname in request.url. Redirect to
  // the host the browser requested so host-only session cookies remain usable.
  const host = request.headers.get("host");
  if (host) requestUrl.host = host;
  const { searchParams, origin } = requestUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const cookieStore = await cookies();
  const transferToken = cookieStore.get(ACCOUNT_TRANSFER_COOKIE)?.value ?? null;
  const pendingSessionCookies = new Map<string, ServerSupabaseCookie>();
  let clearTransferCookie = false;

  function redirect(url: URL) {
    const response = NextResponse.redirect(url);
    pendingSessionCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    if (clearTransferCookie) response.cookies.delete(ACCOUNT_TRANSFER_COOKIE);
    return response;
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/signin?error=missing_code", origin)
    );
  }

  const supabase = await createServerSupabase((cookiesToSet) => {
    cookiesToSet.forEach((cookie) => pendingSessionCookies.set(cookie.name, cookie));
  });
  if (!supabase) {
    // Supabase is not configured — nothing to exchange.
    return redirect(new URL("/signin?error=not_configured", origin));
  }

  const exchange = await withTimeout(supabase.auth.exchangeCodeForSession(code), "Sign-in timed out. Please try again.")
    .catch((error: unknown) => ({ error: { message: error instanceof Error ? error.message : "Sign-in failed" } }));
  const { error } = exchange;
  if (error) {
    return redirect(new URL(`/signin?error=${encodeURIComponent(error.message)}`, origin));
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
    if (!claimError || recoveryExpired) {
      cookieStore.delete(ACCOUNT_TRANSFER_COOKIE);
      clearTransferCookie = true;
    }
    recoveryFailed = Boolean(claimError);
  }

  // Only allow same-origin redirect targets to avoid open redirects.
  const forwardUrl = new URL(next, origin);
  if (forwardUrl.origin !== origin) {
    return redirect(new URL("/", origin));
  }
  if (recoveryFailed) {
    const retryUrl = new URL("/signin", origin);
    retryUrl.searchParams.set("next", forwardUrl.pathname + forwardUrl.search);
    retryUrl.searchParams.set("account_recovery", recoveryExpired ? "expired" : "failed");
    return redirect(retryUrl);
  }
  return redirect(forwardUrl);
}
