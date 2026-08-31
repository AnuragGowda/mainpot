"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import SiteNav from "@/components/SiteNav";
import GoogleMark from "@/components/GoogleMark";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { linkSessionToUser } from "@/lib/accounts";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getBrowserSupabase } from "@/lib/supabase-browser";

type AuthMode = "signin" | "signup";

export default function SignInPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [next, setNext] = useState("/dashboard");
  const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedNext = params.get("next");
    if (requestedNext?.startsWith("/") && !requestedNext.startsWith("//")) {
      setNext(requestedNext);
    }
    const authError = params.get("error");
    if (authError) toast("Sign-in could not be completed. Please try again.", "error");
  }, [toast]);

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function handlePasswordAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) {
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() || email.split("@")[0] },
            emailRedirectTo: callbackUrl(),
          },
        });
        if (error) throw error;
        if (data.user && data.session) {
          await linkSessionToUser(data.user.id);
          router.push(next);
        } else {
          toast("Check your email to confirm your account.", "success");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        await linkSessionToUser(data.user.id);
        router.push(next);
      }
      router.refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to sign in.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    const supabase = getBrowserSupabase();
    if (!supabase || !email.trim()) {
      toast("Enter your email first.", "error");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) throw error;
      setMagicLinkSent(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to send the link.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      toast(error.message, "error");
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8f6]">
      <SiteNav />
      <main className="mx-auto grid w-full max-w-5xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_440px] lg:py-24">
        <section className="hidden lg:block">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-700">
            Keep your history
          </p>
          <h2 className="mt-4 max-w-xl text-5xl font-semibold tracking-tight text-gray-950">
            Keep every settled game in one place.
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-8 text-gray-600">
            Sign in to save results, find regular players, and track your record over time.
          </p>
        </section>

        <Card padding="lg" className="border-gray-200/80 shadow-xl shadow-gray-900/5">
          {!isSupabaseConfigured ? (
            <div className="text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-xl" aria-hidden="true">
                ♠
              </span>
              <h1 className="mt-5 text-2xl font-semibold tracking-tight text-gray-950">
                Accounts are off in local mode
              </h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Games stay on this device, so you can run the full ledger without signing in.
              </p>
              <Link
                href="/create"
                className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-lg bg-gray-950 px-4 text-sm font-medium text-white transition hover:bg-gray-800"
              >
                Start a game
              </Link>
              <p className="mt-4 text-xs text-gray-400">
                Account history and live sync are unavailable in this setup.
              </p>
            </div>
          ) : magicLinkSent ? (
            <div className="py-8 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-800" aria-hidden="true">
                ✓
              </span>
              <h1 className="mt-5 text-2xl font-semibold text-gray-950">Check your inbox</h1>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                We sent a secure sign-in link to <strong>{email}</strong>.
              </p>
              <Button className="mt-6" variant="secondary" onClick={() => setMagicLinkSent(false)}>
                Use another email
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-gray-950">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </h1>
              <p className="mt-1.5 text-sm text-gray-500">
                {mode === "signin" ? "View your saved games and results." : "Save games and track results over time."}
              </p>

              {googleAuthEnabled ? (
                <>
                  <Button fullWidth variant="secondary" className="mt-7" onClick={handleGoogle} leftIcon={<GoogleMark className="h-4 w-4" />}>
                    Continue with Google
                  </Button>
                  <p className="mt-2 text-center text-xs leading-5 text-gray-500">
                    Google securely shares only your basic profile and email with Mainpot.
                  </p>
                  <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-gray-400">
                    <span className="h-px flex-1 bg-gray-200" />or<span className="h-px flex-1 bg-gray-200" />
                  </div>
                </>
              ) : (
                <div className="h-6" />
              )}

              <form onSubmit={handlePasswordAuth} className="space-y-4">
                {mode === "signup" ? (
                  <Input label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="Alex" />
                ) : null}
                <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" />
                <Input label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} required placeholder="At least 6 characters" />
                <Button type="submit" fullWidth loading={loading}>
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
              </form>

              <button type="button" onClick={handleMagicLink} disabled={loading} className="mt-4 w-full text-sm font-medium text-gray-800 hover:text-gray-950 disabled:opacity-50">
                Email me a magic link
              </button>
              <p className="mt-7 text-center text-sm text-gray-500">
                {mode === "signin" ? "New to Mainpot?" : "Already have an account?"}{" "}
                <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="font-medium text-gray-900 hover:text-gray-600">
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
