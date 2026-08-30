"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import GameSetupShell from "@/components/GameSetupShell";
import { useToast } from "@/components/ui/Toast";
import { createGame } from "@/lib/data";
import { getCurrentUserId } from "@/lib/auth-client";
import { getPlayerName, setActiveGame, setPlayerName } from "@/lib/session";

interface FormErrors {
  name?: string;
  gameName?: string;
  buyIn?: string;
}

export default function CreateGamePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [gameName, setGameName] = useState("");
  const [buyIn, setBuyIn] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setName(getPlayerName() ?? "");
    const params = new URLSearchParams(window.location.search);
    const suggestedName = params.get("name")?.trim().slice(0, 80);
    const suggestedBuyIn = Number(params.get("buyin"));
    if (suggestedName) setGameName(suggestedName);
    if (Number.isFinite(suggestedBuyIn) && suggestedBuyIn > 0) {
      setBuyIn(String(suggestedBuyIn));
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedGameName = gameName.trim();
    const parsedBuyIn = Number(buyIn);

    const nextErrors: FormErrors = {};
    if (!trimmedName) {
      nextErrors.name = "Enter your name.";
    }
    if (!trimmedGameName) {
      nextErrors.gameName = "Enter a game name.";
    }
    if (!buyIn.trim() || !Number.isFinite(parsedBuyIn) || parsedBuyIn <= 0) {
      nextErrors.buyIn = "Enter an amount greater than 0.";
    }
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.gameName || nextErrors.buyIn) {
      return;
    }

    setLoading(true);
    try {
      setPlayerName(trimmedName);
      const userId = await getCurrentUserId();
      const { code } = await createGame(
        trimmedGameName,
        trimmedName,
        parsedBuyIn,
        userId
      );
      setActiveGame(code);
      toast("Game created!", "success");
      router.push(`/game/${code}`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      toast(message, "error");
      setLoading(false);
    }
  }

  return (
    <GameSetupShell
      eyebrow="Host a table"
      title="Start the game in under a minute."
      description="Set the opening buy-in, invite the table, and keep every chip accounted for from the first hand."
    >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-gray-950">Game details</h2>
              <p className="mt-1 text-sm text-gray-500">You can edit buy-ins during the game.</p>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">Host</span>
          </div>

          <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
            <Input
              id="create-name"
              label="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mike"
              autoComplete="name"
              error={errors.name}
            />
            <Input
              id="create-game-name"
              label="Game name"
              value={gameName}
              onChange={(event) => setGameName(event.target.value)}
              placeholder="Friday Night at Mike's"
              error={errors.gameName}
            />
            <Input
              id="create-buy-in"
              label="Buy-in amount"
              type="number"
              min={1}
              step={0.01}
              inputMode="decimal"
              prefix="$"
              value={buyIn}
              onChange={(event) => setBuyIn(event.target.value)}
              placeholder="20"
              error={errors.buyIn}
            />
            <Button type="submit" fullWidth loading={loading}>
              Create game room
            </Button>
          </form>
          <p className="mt-4 text-center text-xs leading-5 text-gray-400">
            A private six-character code is created for your table.
          </p>
    </GameSetupShell>
  );
}
