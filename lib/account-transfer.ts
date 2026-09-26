/** Shared by the browser handoff and the server-side OAuth / OTP callback. */
export const ACCOUNT_TRANSFER_COOKIE = "mainpot_account_transfer";

export function isExpiredAccountTransferError(message: string | undefined): boolean {
  return message === "The guest transfer token is invalid or expired";
}
