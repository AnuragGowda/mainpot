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
    <figure className="relative mx-auto w-48 sm:w-56 md:w-full md:max-w-60">
      <div aria-hidden="true" className="absolute -inset-8 rounded-full bg-indigo-400/15 blur-3xl" />
      <div aria-hidden="true" className="absolute inset-0 translate-x-3 translate-y-3 rotate-3 rounded-xl border border-white/15 bg-white/5" />
      <div className="relative -rotate-1 overflow-hidden rounded-xl border border-white/25 shadow-2xl shadow-black/40">
        <CharacterStoryCard
          data={example}
          privacy={defaultRecapPrivacy}
          featuredPlayerId="1"
          direction="society"
        />
      </div>
      <figcaption className="sr-only">Example game card</figcaption>
    </figure>
  );
}
