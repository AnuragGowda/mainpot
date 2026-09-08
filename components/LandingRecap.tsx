"use client";

import CharacterStoryCard from "@/components/Settlement/exploration/CharacterStoryCard";
import { defaultRecapPrivacy, type RecapData } from "@/lib/recap";

const example: RecapData = {
  gameId: "landing-example",
  gameName: "Friday night",
  playedAt: "2026-09-04T23:00:00Z",
  playerCount: 4,
  durationMinutes: 180,
  totalBuyIn: 240,
  rebuyCount: 2,
  settlementPaymentCount: 3,
  players: [
    { id: "1", displayName: "Alex", net: 80, rank: 1, rebuyCount: 0 },
    { id: "2", displayName: "Sam", net: -10, rank: 2, rebuyCount: 0 },
    { id: "3", displayName: "Jordan", net: -30, rank: 3, rebuyCount: 1 },
    { id: "4", displayName: "Morgan", net: -40, rank: 4, rebuyCount: 1 },
  ],
  highlights: [],
};

export default function LandingRecap() {
  return (
    <figure className="mx-auto w-48 sm:w-56">
      <div className="overflow-hidden rounded-xl border border-white/20 shadow-xl">
        <CharacterStoryCard
          data={example}
          privacy={defaultRecapPrivacy}
          featuredPlayerId="1"
          direction="society"
        />
      </div>
      <figcaption className="mt-3 text-center text-xs text-gray-400">Example game card</figcaption>
    </figure>
  );
}
