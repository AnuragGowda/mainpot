"use client";

import { Component, type ReactNode } from "react";
import { classifyProductOpsFailure, trackProductOpsEvent } from "@/lib/product-ops";
import { isSupabaseConfigured } from "@/lib/supabase";
import { roomErrorSupportCode } from "@/lib/room-error";
import Button from "@/components/ui/Button";

interface Props {
  gameId: string;
  name: string;
  children: ReactNode;
  onRetry?: () => Promise<void>;
}

/** Mount with the game ID as its key: one panel's failure belongs to one table. */
export default class RoomSectionBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error("Room panel failed") };
  }

  componentDidCatch(error: unknown) {
    trackProductOpsEvent("game.room_load_failed", { reason: classifyProductOpsFailure(error), storage_mode: isSupabaseConfigured ? "supabase" : "local_storage" }, this.props.gameId);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section role="alert" aria-label={`${this.props.name} unavailable`} className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <h2 className="font-semibold text-gray-950">{this.props.name} couldn’t load</h2>
        <p className="mt-1 text-sm leading-6 text-gray-700">This panel is unavailable. Your saved ledger is unchanged; the rest of this table remains available.</p>
        <p className="mt-2 text-xs text-gray-600">Support code: {roomErrorSupportCode(this.state.error, process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown")}</p>
        <Button className="mt-3" variant="secondary" size="sm" onClick={async () => {
          try {
            await this.props.onRetry?.();
            this.setState({ error: null });
          } catch { /* Keep the unavailable panel isolated if its refresh fails. */ }
        }}>Retry {this.props.name.toLowerCase()}</Button>
      </section>
    );
  }
}
