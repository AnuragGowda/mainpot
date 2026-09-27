import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "./session";

type Channel = ReturnType<SupabaseClient["channel"]>;

/** Optional realtime must never prevent the authoritative polling reader from running. */
export function subscribeWithPollingFallback(
  client: SupabaseClient | null,
  topic: string,
  configure: (channel: Channel) => void,
  onSetupFailure?: () => void,
): () => void {
  if (!client) return () => {};
  let channel: Channel | undefined;
  let disposed = false;
  const remove = () => {
    if (!channel) return;
    try {
      void client.removeChannel(channel).catch(() => undefined);
    } catch {
      // Cleanup failure cannot take down the saved room or payment reader.
    }
  };
  try {
    // Allocate per subscription attempt, including remounts and delayed cleanup.
    channel = client.channel(`${topic}-${randomUUID()}`);
    configure(channel);
  } catch {
    remove();
    channel = undefined;
    console.warn("Mainpot live updates could not start. Saved records will keep refreshing.");
    onSetupFailure?.();
  }
  return () => {
    if (disposed) return;
    disposed = true;
    remove();
  };
}
