import { getBrowserSupabase } from "./supabase-browser";
import { ACCOUNT_TRANSFER_COOKIE, isExpiredAccountTransferError } from "./account-transfer";

const accountTransferStorageKey = "mainpot_account_transfer";
const accountTransferDeadlineMs = 8_000;
const unboundTransferLifetimeSeconds = 10 * 60;
const emailBoundTransferLifetimeSeconds = 60 * 60;

export const GUEST_RECOVERY_WINDOW_EXPIRED = "Your guest-game recovery window expired.";

function withDeadline<T>(operation: PromiseLike<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`${label} timed out. Please try again.`)), accountTransferDeadlineMs);
    void operation.then(
      (value) => { window.clearTimeout(timeout); resolve(value); },
      (error: unknown) => { window.clearTimeout(timeout); reject(error); },
    );
  });
}

function writeTransferToken(token: string, maxAgeSeconds: number): void {
  window.sessionStorage.setItem(accountTransferStorageKey, token);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ACCOUNT_TRANSFER_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function clearTransferToken(): void {
  window.sessionStorage.removeItem(accountTransferStorageKey);
  document.cookie = `${ACCOUNT_TRANSFER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function discardAnonymousAccountTransfer(): void {
  clearTransferToken();
}

function storedTransferToken(): string | null {
  const stored = window.sessionStorage.getItem(accountTransferStorageKey);
  if (stored) return stored;
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${ACCOUNT_TRANSFER_COOKIE}=`))
    ?.slice(ACCOUNT_TRANSFER_COOKIE.length + 1);
  return cookie ? decodeURIComponent(cookie) : null;
}

/**
 * Mints a single-use capability while the browser still holds its anonymous
 * Auth identity. An unbound OAuth proof lasts ten minutes. A proof bound to a
 * destination email lasts one hour, matching the default Supabase email-link
 * lifetime. A browser session ID is never used to claim players.
 */
export async function prepareAnonymousAccountTransfer(destinationEmail?: string): Promise<string | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) return null;

  const { data: { user }, error: userError } = await withDeadline(supabase.auth.getUser(), "Checking guest identity");
  // A clean sign-in page has no session to recover. Supabase reports that as
  // AuthSessionMissingError; it is not an authentication failure.
  if (userError && userError.name !== "AuthSessionMissingError") {
    throw new Error(`Could not prepare guest games: ${userError.message}`);
  }
  if (!user?.is_anonymous) return null;

  const normalizedDestinationEmail = destinationEmail?.trim() || null;
  const { data, error } = await withDeadline(
    supabase.rpc("issue_anonymous_account_transfer", {
      input_destination_email: normalizedDestinationEmail,
    }),
    "Preparing guest games",
  );
  if (error) throw new Error(`Could not prepare guest games: ${error.message}`);
  if (typeof data !== "string" || !/^[0-9a-f]{64}$/.test(data)) {
    throw new Error("Could not prepare guest games.");
  }
  writeTransferToken(data, normalizedDestinationEmail ? emailBoundTransferLifetimeSeconds : unboundTransferLifetimeSeconds);
  return data;
}

/** Claims the prepared guest identity after Auth has switched to a permanent user. */
export async function claimAnonymousAccountTransfer(token = storedTransferToken()): Promise<void> {
  if (!token) return;
  const supabase = getBrowserSupabase();
  if (!supabase) return;

  const { error } = await withDeadline(
    supabase.rpc("claim_anonymous_account_transfer", { input_token: token }),
    "Recovering guest games",
  );
  if (error) {
    if (isExpiredAccountTransferError(error.message)) {
      clearTransferToken();
      throw new Error(GUEST_RECOVERY_WINDOW_EXPIRED);
    }
    throw new Error(`Could not recover guest games: ${error.message}`);
  }
  clearTransferToken();
}

/**
 * Compatibility entry point for account surfaces that load after Auth. It no
 * longer reads or claims a browser session ID; it can only consume the
 * prepared capability bound to the just-authenticated account.
 */
export async function linkSessionToUser(_userId: string): Promise<void> {
  // Recovery is completed in the explicit sign-in or callback flow, while it
  // still has the one-time token. This intentionally does not infer ownership
  // from a persistent browser identifier.
  void _userId;
  await claimAnonymousAccountTransfer();
}
