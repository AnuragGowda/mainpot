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
    data: { user },
  } = await supabase.auth.getUser();
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

/** Signs the current user out. No-op when Supabase is unconfigured. */
export async function signOutUser(): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return;
  }
  await supabase.auth.signOut();
}
