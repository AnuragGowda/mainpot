"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { LogIn, LogOut } from "lucide-react";
import { getCurrentUser, signOutUser } from "@/lib/auth-client";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { isSupabaseConfigured } from "@/lib/supabase";
import BrandMark from "@/components/BrandMark";

const navLink =
  "min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2";

export default function SiteNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (new URLSearchParams(window.location.search).get("signout") === "unconfirmed") {
      setSignOutError("Sign-out on other devices could not be confirmed. Sign out on those devices too.");
    }
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
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      const outcome = await signOutUser();
      // Replace the document so a protected page's pending auth check cannot
      // overwrite the intended destination with a competing client redirect.
      window.location.replace(outcome === "local-only" ? "/?signout=unconfirmed" : "/");
    } catch {
      setSignOutError("Could not sign out. Check your connection and try again.");
      setSigningOut(false);
    }
  }

  const hasAccount = Boolean(user && !user.is_anonymous);
  const publicAction = pathname === "/create"
    ? { href: "/join", desktop: "Join a game", mobile: "Join" }
    : { href: "/create", desktop: "Start a game", mobile: "Start game" };

  return (
    <header className="app-site-nav sticky z-30 border-b border-gray-200/80 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/" aria-label="Mainpot home" className="group inline-flex min-h-11 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2">
          <BrandMark className="h-7 w-7 shadow-sm transition group-hover:bg-gray-800" />
          <span className="hidden text-lg font-semibold tracking-tight text-gray-950 min-[360px]:inline">
            Mainpot
          </span>
        </Link>

        <nav aria-label="Main navigation" className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          {hasAccount ? (
            <>
              <Link
                href="/dashboard"
                aria-current={pathname === "/dashboard" ? "page" : undefined}
                className={`${navLink} inline-flex px-2 text-xs sm:px-3 sm:text-sm ${
                  pathname === "/dashboard" ? "bg-gray-100 text-gray-950" : ""
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/friends"
                aria-current={pathname === "/friends" ? "page" : undefined}
                className={`${navLink} inline-flex px-2 text-xs sm:px-3 sm:text-sm ${
                  pathname === "/friends" ? "bg-gray-100 text-gray-950" : ""
                }`}
              >
                Friends
              </Link>
              <Link href="/create" className={`${navLink} hidden sm:inline-flex`}>
                New game
              </Link>
              <button type="button" onClick={handleSignOut} disabled={signingOut} aria-busy={signingOut} className={`${navLink} hidden disabled:cursor-wait disabled:opacity-60 sm:inline-flex`}>
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                aria-busy={signingOut}
                aria-label={signingOut ? "Signing out" : "Sign out"}
                title="Sign out"
                className={`${navLink} grid h-11 w-11 place-items-center px-0 sm:hidden`}
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
                className={`${navLink} grid h-11 w-11 place-items-center px-0 sm:hidden`}
              >
                <LogIn aria-hidden className="h-4 w-4" />
              </Link>
              <Link
                href={publicAction.href}
                className="ml-1 inline-flex min-h-11 items-center rounded-lg bg-gray-950 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2"
              >
                <span className="hidden sm:inline">{publicAction.desktop}</span>
                <span className="sm:hidden">{publicAction.mobile}</span>
              </Link>
            </>
          ) : (
            <span className="h-11 w-28 animate-pulse rounded-md bg-gray-100" />
          )}
        </nav>
      </div>
      {signOutError ? (
        <p role="alert" className="mx-auto max-w-6xl px-4 pb-3 text-sm text-red-700 sm:px-6">{signOutError}</p>
      ) : null}
    </header>
  );
}
