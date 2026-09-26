"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "./supabase-browser";
import { getSessionId } from "./session";

export function usePlayerIdentity() {
  const [identity, setIdentity] = useState<{ sessionId: string | null; userId: string | null }>({
    sessionId: null, userId: null,
  });
  useEffect(() => {
    const sessionId = getSessionId();
    // The browser session id is available synchronously. Do not leave the
    // room on its loading screen while Supabase emits INITIAL_SESSION.
    setIdentity({ sessionId, userId: null });
    const client = getBrowserSupabase();
    if (!client) {
      setIdentity({ sessionId, userId: null });
      return;
    }
    let active = true;
    // INITIAL_SESSION normally initializes the identity, while getSession
    // gives a bounded fallback path when that event is delayed by startup.
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) setIdentity({ sessionId, userId: session?.user.id ?? null });
    });
    void client.auth.getSession().then(({ data }) => {
      if (active) setIdentity({ sessionId, userId: data.session?.user.id ?? null });
    }).catch(() => {
      // Room loading can still resolve via the durable browser session id.
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return identity;
}
