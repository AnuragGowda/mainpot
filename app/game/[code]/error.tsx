"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { classifyProductOpsFailure, trackProductOpsEvent } from "@/lib/product-ops";
import { isSupabaseConfigured } from "@/lib/supabase";
import { roomErrorSupportCode } from "@/lib/room-error";

export default function GameRoomErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { code } = useParams<{ code: string }>();
  useEffect(() => {
    trackProductOpsEvent("game.room_load_failed", {
      reason: classifyProductOpsFailure(error),
      storage_mode: isSupabaseConfigured ? "supabase" : "local_storage",
    });
  }, [error]);

  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-[#f7f8f6] px-4 py-16">
      <Card padding="lg" className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-950">
          Mainpot hit a snag
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your game data is still saved. Try the screen again, or reload to pick up the latest app version.
        </p>
        <p className="mt-3 text-xs text-gray-500">
          Support code: {roomErrorSupportCode(error, process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown")}
        </p>
        <div className="mt-6 grid gap-3">
          <Button fullWidth onClick={reset}>Try again</Button>
          <Button fullWidth variant="secondary" onClick={() => window.location.reload()}>
            Reload Mainpot
          </Button>
          <a href="/create" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700">Open another table</a>
          <a
            href={`/recover.html?game=${encodeURIComponent(code)}`}
            className="mt-1 inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-gray-700 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950"
          >
            Refresh app files and resume
          </a>
        </div>
      </Card>
    </main>
  );
}
