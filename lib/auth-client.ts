"use client";

import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "./supabase-browser";

/**
 * Returns the currently authenticated user, or null when Supabase is
 * unconfigured or the user is signed out.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return null;
  }
  const {
    data: { user }, error,
  } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    throw new Error("Could not check your secure session. Check your connection and retry.");
  }
  return user ?? null;
}

/** Returns the current user's id, or null when signed out / unconfigured. */
export async function getCurrentUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

let anonymousSignIn: Promise<User | null> | null = null;

/**
 * Returns the current user, creating a passwordless anonymous Supabase user
 * when needed. This keeps room links account-free while still giving RLS a
 * trustworthy identity for every browser.
 */
export async function ensureCurrentUser(): Promise<User | null> {
  const current = await getCurrentUser();
  if (current) {
    return current;
  }
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return null;
  }
  if (!anonymousSignIn) {
    anonymousSignIn = supabase.auth.signInAnonymously().then(({ data, error }) => {
      if (error) {
        throw error;
      }
      return data.user ?? null;
    });
  }
  try {
    return await anonymousSignIn;
  } finally {
    anonymousSignIn = null;
  }
}

/** Distinguishes confirmed sign-out from local clearing after a server error. */
export async function signOutUser(): Promise<"signed-out" | "local-only"> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return "signed-out";
  }
  const { error } = await supabase.auth.signOut();
  if (!error) return "signed-out";
  // The installed SDK can remove the browser session before returning a
  // remote logout error. Never claim that account is still signed in.
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (!sessionError && !session) return "local-only";
  throw new Error("Could not sign out. Check your connection and try again.");
}
