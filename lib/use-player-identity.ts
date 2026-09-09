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
    const client = getBrowserSupabase();
    if (!client) {
      setIdentity({ sessionId, userId: null });
      return;
    }
    // INITIAL_SESSION also initializes the identity. Auth changes update both
    // room and settlement views without copying another browser's session id.
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setIdentity({ sessionId, userId: session?.user.id ?? null });
    });
    return () => subscription.unsubscribe();
  }, []);
  return identity;
}
