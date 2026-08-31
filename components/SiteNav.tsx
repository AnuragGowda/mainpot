"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { LogIn, LogOut } from "lucide-react";
import { getCurrentUser, signOutUser } from "@/lib/auth-client";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { isSupabaseConfigured } from "@/lib/supabase";
import BrandMark from "@/components/BrandMark";

const navLink =
  "rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-950";

export default function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  useEffect(() => {
    let active = true;
    const readyFallback = isSupabaseConfigured
      ? window.setTimeout(() => {
          if (active) setReady(true);
        }, 2500)
      : undefined;

    void getCurrentUser()
      .then((currentUser) => {
        if (active) {
          setUser(currentUser);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setReady(true);
        }
      });

    const supabase = getBrowserSupabase();
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
        setReady(true);
      }
    }).data.subscription;

    return () => {
      active = false;
      if (readyFallback !== undefined) window.clearTimeout(readyFallback);
      subscription?.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await signOutUser();
    setUser(null);
    router.push("/");
    router.refresh();
  }

  const inAccountArea = pathname === "/dashboard" || pathname === "/friends";
  const hasAccount = Boolean(user && !user.is_anonymous);

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group inline-flex items-center gap-2">
          <BrandMark className="h-7 w-7 shadow-sm transition group-hover:bg-gray-800" />
          <span className="text-lg font-semibold tracking-tight text-gray-950">
            Mainpot
          </span>
        </Link>

        <nav aria-label="Main navigation" className="flex items-center gap-1">
          {hasAccount ? (
            <>
              <Link
                href="/dashboard"
                className={`${navLink} ${
                  inAccountArea ? "bg-gray-100 text-gray-950" : ""
                }`}
              >
                <span className="hidden sm:inline">Dashboard</span>
                <span className="sm:hidden">Home</span>
              </Link>
              <Link href="/create" className={`${navLink} hidden sm:inline-flex`}>
                New game
              </Link>
              <button type="button" onClick={handleSignOut} className={`${navLink} hidden sm:inline-flex`}>
                Sign out
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                aria-label="Sign out"
                title="Sign out"
                className={`${navLink} grid h-9 w-9 place-items-center px-0 sm:hidden`}
              >
                <LogOut aria-hidden className="h-4 w-4" />
              </button>
            </>
          ) : ready ? (
            <>
              {!isSupabaseConfigured ? (
                <span className="hidden rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 sm:inline">
                  Local mode
                </span>
              ) : null}
              <Link href="/signin" className={`${navLink} hidden sm:inline-flex`}>
                Sign in
              </Link>
              <Link
                href="/signin"
                aria-label="Sign in"
                title="Sign in"
                className={`${navLink} grid h-9 w-9 place-items-center px-0 sm:hidden`}
              >
                <LogIn aria-hidden className="h-4 w-4" />
              </Link>
              <Link
                href="/create"
                className="ml-1 rounded-lg bg-gray-950 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
              >
                <span className="hidden sm:inline">Start a game</span>
                <span className="sm:hidden">Play</span>
              </Link>
            </>
          ) : (
            <span className="h-9 w-28 animate-pulse rounded-md bg-gray-100" />
          )}
        </nav>
      </div>
    </header>
  );
}
