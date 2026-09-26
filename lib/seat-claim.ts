"use client";

import { ensureCurrentUser } from "./auth-client";
import { getSessionId } from "./session";
import { getBrowserSupabase } from "./supabase-browser";

const SEAT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireSupabase() {
  const client = getBrowserSupabase();
  if (!client) throw new Error("Seat claim links need a connected Mainpot game.");
  return client;
}

function requireToken(token: string): string {
  if (!SEAT_TOKEN_PATTERN.test(token)) throw new Error("This seat claim link is invalid.");
  return token;
}

export interface MintedSeatClaim {
  token: string;
  expiresAt: string;
}

export interface ClaimedSeat {
  gameId: string;
  playerId: string;
}

/** Host-only: make a random fragment capability while storing only its hash. */
export async function mintHostManagedSeatClaim(
  gameId: string,
  playerId: string,
): Promise<MintedSeatClaim> {
  if (!await ensureCurrentUser()) throw new Error("Could not start a secure session.");
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const { data, error } = await requireSupabase().rpc("mint_host_managed_seat_claim", {
    input_game_id: gameId,
    input_player_id: playerId,
    input_token_hash: await sha256Hex(token),
  });
  if (error || typeof data !== "string") throw new Error(error?.message ?? "Could not create a seat claim link.");
  return { token, expiresAt: data };
}

/** Claim a host-issued seat without name or browser-session matching. */
export async function claimHostManagedSeat(gameId: string, token: string): Promise<ClaimedSeat> {
  if (!await ensureCurrentUser()) throw new Error("Could not start a secure session.");
  const { data, error } = await requireSupabase().rpc("claim_host_managed_seat", {
    input_game_id: gameId,
    input_token: requireToken(token),
    input_session_id: getSessionId(),
  });
  if (error || !data || typeof data !== "object") throw new Error(error?.message ?? "Could not claim this seat.");
  const row = data as { game_id?: unknown; player_id?: unknown };
  if (typeof row.game_id !== "string" || typeof row.player_id !== "string") {
    throw new Error("Could not confirm the claimed seat.");
  }
  if (row.game_id !== gameId) throw new Error("This seat claim link is for another game.");
  return { gameId: row.game_id, playerId: row.player_id };
}

export function seatClaimUrl(gameCode: string, token: string): string {
  requireToken(token);
  return `${window.location.origin}/game/${encodeURIComponent(gameCode)}#seat=${token}`;
}

export function seatClaimFromFragment(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("seat");
  return token && SEAT_TOKEN_PATTERN.test(token) ? token : null;
}

/** Remove a capability from browser history only after the server confirms it. */
export function clearSeatClaimFragment(): void {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}
