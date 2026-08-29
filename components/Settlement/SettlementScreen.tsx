"use client";

import type { GameSnapshot } from "@/lib/types";
import Card from "@/components/ui/Card";

export interface SettlementScreenProps {
  snapshot: GameSnapshot;
}

/**
 * Placeholder settlement screen. Packet 4 replaces this with the real
 * cash-out / reconciliation flow — keep this minimal on purpose.
 */
export default function SettlementScreen({ snapshot }: SettlementScreenProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16 sm:px-6">
      <Card padding="lg" className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Settling up
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">{snapshot.game.name}</p>
        <p className="mt-6 text-sm text-gray-400">
          Settlement flow is implemented in the next step.
        </p>
      </Card>
    </main>
  );
}